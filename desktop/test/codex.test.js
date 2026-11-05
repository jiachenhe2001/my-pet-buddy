const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { CodexService } = require('../src/codex/CodexService');
const { CodexClient } = require('../src/codex/CodexClient');
const { HookBridge } = require('../src/codex/HookBridge');
const { forwardHook } = require('../src/codex/hook-client');
const { resolveCodex } = require('../src/codex/command');
const { placeAssistant } = require('../src/windows/assistantPlacement');
const fixture = path.resolve(__dirname, '../../test/fixtures/codex-server.cjs');
function waitFor(service, predicate) {
  if (predicate(service.snapshot())) return Promise.resolve(service.snapshot());
  return new Promise((resolve, reject) => {
    const listener = snapshot => { if (predicate(snapshot)) { cleanup(); resolve(snapshot); } };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for state')); }, 4000);
    const cleanup = () => { clearTimeout(timer); service.off('change', listener); };
    service.on('change', listener);
  });
}
async function setup(t, extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-codex-'));
  const service = new CodexService({ directory, codexHome: path.join(directory, 'codex'), hookCommand: [process.execPath, 'test.js'], binary: fixture, ...extra });
  t.after(() => { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  await service.start(); await service.connect(); const id = await service.newSession(directory);
  return { service, id, directory };
}
const selected = service => service.snapshot().sessions.find(session => session.id === service.selectedId);
const request = service => selected(service).pending[0];

test('real stdio handshake, plan, one-time command approval and completion', async t => {
  const { service, id } = await setup(t);
  assert.equal(service.connection.authenticated, true); assert.equal(service.connection.planType, 'plus');
  await service.send({ sessionId: id, text: '检查气泡' });
  assert.equal(selected(service).status, 'waiting_approval');
  assert.equal(selected(service).plan.length, 2); assert.match(request(service).detail, /npm run test:desktop/);
  const approvalId = request(service).id;
  service.respond({ id: approvalId, decision: 'accept' });
  await waitFor(service, state => state.sessions.some(session => session.id === id && session.status === 'completed'));
  assert.match(selected(service).messages.at(-1).text, /已经完成检查/);
  assert.throws(() => service.respond({ id: approvalId, decision: 'accept' }), /过期/);
});
test('reject returns the supported cancel decision and permits a later turn', async t => {
  const { service, id } = await setup(t);
  await service.send({ sessionId: id, text: 'cancel-only' });
  service.respond({ id: request(service).id, decision: 'decline' });
  await waitFor(service, state => state.sessions.some(session => session.id === id && session.status === 'completed'));
  assert.match(selected(service).messages.at(-1).text, /原命令没有执行/);
  await service.send({ sessionId: id, text: '再检查' }); assert.equal(selected(service).status, 'waiting_approval');
});
test('permissions are scoped to this turn and user input must answer every question', async t => {
  const { service, id } = await setup(t);
  await service.send({ sessionId: id, text: 'permissions' });
  const responses = [], send = service.client.respond.bind(service.client);
  service.client.respond = (...args) => { responses.push(args[1]); send(...args); };
  service.respond({ id: request(service).id, decision: 'accept' });
  assert.deepEqual(responses[0], { permissions: { network: { enabled: true } }, scope: 'turn' });
  await waitFor(service, state => state.sessions.some(session => session.id === id && session.status === 'completed'));
  await service.send({ sessionId: id, text: 'input' });
  assert.throws(() => service.respond({ id: request(service).id, decision: 'accept' }), /所有问题/);
  service.respond({ id: request(service).id, decision: 'accept', answers: { choice: { answers: ['气泡'] } } });
  await waitFor(service, state => state.sessions.some(session => session.id === id && session.status === 'completed'));
});
test('steer and interrupt keep the same in-flight turn', async t => {
  const { service, id } = await setup(t);
  await service.send({ sessionId: id, text: 'running' }); const turn = selected(service).turnId;
  await service.send({ sessionId: id, text: '再加一条要求' }); assert.equal(selected(service).turnId, turn);
  await service.interrupt(id);
  await waitFor(service, state => state.sessions.some(session => session.id === id && session.status === 'interrupted'));
  assert.equal(service.hasActiveTasks(), false);
});
test('a late turn/start response cannot overwrite an already failed turn', async t => {
  const { service, id } = await setup(t);
  await service.send({ sessionId: id, text: 'failure' });
  assert.equal(selected(service).status, 'failed'); assert.match(selected(service).messages.map(message => message.text).join(' '), /测试失败原因/);
});
test('disconnect invalidates approvals and reconnect restores the ability to continue', async t => {
  const { service, id } = await setup(t);
  await service.send({ sessionId: id, text: '检查' }); const old = request(service).id;
  service.client.child.kill(); await waitFor(service, state => state.connection.status === 'disconnected');
  assert.equal(selected(service).pending.length, 0); assert.throws(() => service.respond({ id: old, decision: 'accept' }), /过期/);
  await service.connect(); await service.send({ sessionId: id, text: '恢复' }); assert.equal(selected(service).status, 'waiting_approval');
});
test('API-key accounts cannot submit tasks through the Plus-only integration', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-account-'));
  const service = new CodexService({ directory, codexHome: path.join(directory, 'codex'), hookCommand: [], binary: fixture,
    clientFactory: command => new CodexClient({ command: { ...command, env: { ...command.env, PET_BUDDY_TEST_AUTH: 'apiKey' } } }) });
  t.after(() => { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  await service.start(); await service.connect();
  assert.equal(service.connection.authenticated, false); await assert.rejects(service.newSession(directory), /ChatGPT/);
});
test('history is read without takeover and follow-ups use argv queue with accurate resume status', async t => {
  let call;
  const { service } = await setup(t, { execute: (file, args, options, callback) => {
    call = { file, args, options }; callback(null, 'queued', 'Warning: unable to resume');
  } });
  await service.select('history'); assert.equal(selected(service).source, 'history');
  assert.match(selected(service).messages[0].text, /历史回复/); assert.equal(service.controlled.has('history'), false);
  const text = '包含 `符号` 和 $(内容) 的消息'; const result = await service.send({ sessionId: 'history', text });
  assert.equal(result.resumed, false); assert.ok(call.args.includes(`--message=${text}`)); assert.equal(call.options.shell, undefined);
});
test('parallel file approvals use the matching item, refuse missing details, and expire with their turn', async t => {
  const { service, id } = await setup(t); const epoch = service.client.epoch;
  service._nativeEvent({ method: 'turn/started', params: { threadId: id, turn: { id: 'files' } } });
  for (const name of ['a', 'b']) service._nativeEvent({ method: 'item/started', params: { threadId: id,
    item: { id: name, type: 'fileChange', changes: [{ path: `${name}.js`, diff: `+ ${name}` }] } } });
  const params = { threadId: id, turnId: 'files', itemId: 'a' };
  service._nativeRequest({ id: 'f1', method: 'item/fileChange/requestApproval', params, epoch });
  assert.match(request(service).detail, /a\.js/); assert.doesNotMatch(request(service).detail, /b\.js/);
  service._nativeRequest({ id: 'f2', method: 'item/fileChange/requestApproval', params: { ...params, itemId: 'missing' }, epoch });
  const missing = selected(service).pending[1]; assert.equal(missing.canAccept, false);
  assert.throws(() => service.respond({ id: missing.id, decision: 'accept' }), /详情/);
  const old = request(service).id;
  service._nativeEvent({ method: 'turn/started', params: { threadId: id, turn: { id: 'new-files' } } });
  assert.throws(() => service.respond({ id: old, decision: 'accept' }), /过期/);
  service._nativeEvent({ method: 'turn/completed', params: { threadId: id, turn: { id: 'files', status: 'completed' } } });
  assert.equal(selected(service).status, 'running');
});
test('hook client waits for a real authenticated loopback decision and defaults to no decision', async t => {
  const { service, directory } = await setup(t);
  const event = { hook_event_name: 'PermissionRequest', session_id: 'external', turn_id: 'turn-external', cwd: directory,
    tool_name: 'Bash', tool_input: { command: 'echo hook-check' } };
  const response = forwardHook({ infoPath: service.bridge.infoPath, input: event });
  await waitFor(service, state => state.sessions.some(session => session.id === 'external' && session.pending.length));
  service.respond({ id: request(service).id, decision: 'accept' });
  assert.equal((await response).hookSpecificOutput.decision.behavior, 'allow');
  const fallback = forwardHook({ infoPath: service.bridge.infoPath, input: event });
  await waitFor(service, state => state.sessions.some(session => session.id === 'external' && session.pending.length));
  service.bridge.stop(); assert.equal(await fallback, null);
});
test('hooks merge preserves other entries, backs up the file, and uninstall removes only this integration', async t => {
  const { service, directory } = await setup(t), target = path.join(directory, 'codex/hooks.json');
  fs.mkdirSync(path.dirname(target));
  const existing = { description: 'existing', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] } };
  fs.writeFileSync(target, JSON.stringify(existing));
  service.installHooks(true); service.installHooks(true);
  const installed = JSON.parse(fs.readFileSync(target)); assert.equal(installed.hooks.Stop.length, 2);
  assert.ok(fs.readdirSync(path.dirname(target)).some(name => name.includes('backup')));
  service.installHooks(false); assert.deepEqual(JSON.parse(fs.readFileSync(target)), existing);
  fs.writeFileSync(target, 'bad json'); assert.throws(() => service.installHooks(true), /有效 JSON/); assert.equal(fs.readFileSync(target, 'utf8'), 'bad json');
});
test('loopback bridge rejects browser origins and incorrect tokens', async t => {
  const { service } = await setup(t), info = JSON.parse(fs.readFileSync(service.bridge.infoPath));
  for (const headers of [{ Authorization: 'Bearer wrong' }, { Authorization: `Bearer ${info.token}`, Origin: 'https://example.com' }]) {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: info.port, path: '/event', method: 'POST', headers }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end('{}');
    }); assert.equal(status, 403);
  }
});
test('expired hook requests fall back without auto-approving', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-expiry-'));
  const bridge = new HookBridge({ directory, codexHome: directory, command: [], approvalTimeout: 30 });
  t.after(() => { bridge.stop(); fs.rmSync(directory, { recursive: true, force: true }); }); await bridge.start();
  const response = await forwardHook({ infoPath: bridge.infoPath, input: { hook_event_name: 'PermissionRequest', session_id: 'expired' } });
  assert.equal(response, null); assert.equal(bridge.pending.size, 0);
});
test('old connection epochs cannot respond to a new Codex process', async t => {
  const { service } = await setup(t), oldEpoch = service.client.epoch;
  service.client.stop(); await service.client.start();
  assert.throws(() => service.client.respond('old', { decision: 'accept' }, oldEpoch), /过期/);
});
test('a stale hook completion cannot overwrite a newer running turn', async t => {
  const { service, directory } = await setup(t);
  for (const turn_id of ['older', 'newer']) service._hookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'external', turn_id, cwd: directory, prompt: turn_id });
  service._hookEvent({ hook_event_name: 'Stop', session_id: 'external', turn_id: 'older', cwd: directory });
  assert.equal(service.sessions.get('external').status, 'running');
  assert.equal(service.sessions.get('external').turnId, 'newer');
});
test('assistant placement stays on the selected display and switches below near the top', () => {
  for (const [anchor, area] of [
    [{ x: 1000, y: 700, width: 120, height: 120 }, { x: 0, y: 0, width: 1280, height: 800 }],
    [{ x: -1900, y: 5, width: 120, height: 120 }, { x: -1920, y: 0, width: 1920, height: 1080 }],
    [{ x: 15, y: 100, width: 90, height: 90 }, { x: 0, y: 0, width: 320, height: 480 }]
  ]) {
    const rect = placeAssistant(anchor, area);
    assert.ok(rect.x >= area.x && rect.y >= area.y); assert.ok(rect.x + rect.width <= area.x + area.width); assert.ok(rect.y + rect.height <= area.y + area.height);
    if (anchor.y === 5) assert.equal(rect.placement, 'below');
  }
  assert.throws(() => resolveCodex('/missing/pet-codex'), /没有找到/);
});
