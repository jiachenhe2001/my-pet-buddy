const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CodexService } = require('../src/codex/CodexService');
const { readHistory } = require('../src/codex/history');
const { OverlayWindowManager, overlayBounds } = require('../src/windows/OverlayWindowManager');

const message = (id, text, phase = 'final_answer') => ({ id, type: 'agentMessage', text, phase });
class Bridge extends EventEmitter { isInstalled() { return false; } stop() {} cancelSession() {} }
function setup(t, extra = {}) {
  let latest = { id: 'turn-1', status: 'inProgress' };
  let items = [message('comment', '我先检查一下', 'commentary')], stamp = 10;
  const calls = [], attention = [];
  const service = new CodexService({ bridge: new Bridge(), pollInterval: 0, ...extra });
  service.client = { child: {}, request: async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/list') return { data: [{ id: 'external', name: '外部桌面任务', cwd: '/project', updatedAt: stamp }] };
    if (method === 'thread/turns/list') return { data: [{ ...latest }] };
    if (method === 'thread/items/list') return { data: [...items].reverse().map(item => ({ item })), nextCursor: null };
    throw new Error('Unexpected method: ' + method);
  }, stop() {} };
  service.connection.status = 'connected';
  service.on('attention', event => attention.push(event));
  t.after(() => service.stop());
  return { service, calls, attention, update(turn, messages = items, timestamp = stamp) { latest = turn; items = messages; stamp = timestamp; } };
}

test('external replies update repeatedly, retain phase, and notify completion with unchanged listing timestamp', async t => {
  const { service, attention, update, calls } = setup(t);
  await service.refresh(); await service.select('external');
  assert.equal(service.sessions.get('external').messages[0].phase, 'commentary');
  update({ id: 'turn-1', status: 'completed' }, [message('comment', '我先检查一下', 'commentary'), message('final', '这是最终完整答复')]);
  await service.refresh();
  const session = service.sessions.get('external');
  assert.equal(session.status, 'completed');
  assert.equal(session.messages.at(-1).text, '这是最终完整答复');
  assert.equal(session.messages.at(-1).phase, 'final_answer');
  assert.equal(attention.length, 1);
  await service.refresh(); await service.select('external');
  assert.equal(session.messages.filter(item => item.id === 'final').length, 1);
  assert.equal(attention.length, 1);
  assert.ok(calls.every(call => !['thread/resume', 'turn/start'].includes(call.method)));
});

test('closed panel still monitors an unselected external task and does not replay old completions', async t => {
  const { service, attention, update } = setup(t);
  update({ id: 'old-turn', status: 'completed' });
  await service.refresh(); assert.equal(attention.length, 0);
  // This task can both start and finish between polls; the listed timestamp changes on start.
  update({ id: 'new-turn', status: 'completed' }, [message('new-final', '已完成')], 11);
  await service.refresh();
  assert.equal(service.selectedId, null);
  assert.equal(attention.length, 1);
  assert.equal(service.snapshot().attention.sessionId, 'external');
});

test('delayed disk reads cannot overwrite a newer hook turn or its approval', async t => {
  const { service } = setup(t); await service.refresh();
  let finish;
  service.client.request = () => new Promise(resolve => { finish = resolve; });
  const syncing = service._syncHistory('external', false);
  service._hookEvent({ session_id: 'external', hook_event_name: 'UserPromptSubmit', turn_id: 'newer', cwd: '/project', prompt: '新要求' });
  finish({ data: [{ id: 'turn-1', status: 'completed' }] }); await syncing;
  assert.equal(service.sessions.get('external').status, 'running');
  assert.equal(service.sessions.get('external').turnId, 'newer');
});

test('temporary history errors preserve replies and a later selection retries', async t => {
  const { service } = setup(t);
  await service.refresh(); await service.select('external');
  const request = service.client.request;
  service.client.request = async () => { throw new Error('temporary read error'); };
  await service.select('external');
  assert.equal(service.sessions.get('external').messages[0].text, '我先检查一下');
  assert.match(service.sessions.get('external').historyError, /重试/);
  service.client.request = request; await service.select('external');
  assert.equal(service.sessions.get('external').historyError, null);
});

test('paged history finds the final answer past more than 20 tool events', async () => {
  const calls = [];
  const tools = Array.from({ length: 25 }, (_, index) => ({ id: 'tool-' + index, type: 'commandExecution' }));
  const client = { request: async (method, params) => {
    calls.push(params);
    if (method === 'thread/turns/list') return { data: [{ id: 'turn', status: 'completed' }] };
    return params.cursor ? { data: [{ item: message('final', '完整答复') }], nextCursor: null } :
      { data: tools.map(item => ({ item })), nextCursor: 'page-2' };
  } };
  const result = await readHistory(client, 'history', { messages: true });
  assert.ok(result.items.some(item => item.id === 'final' && item.text === '完整答复'));
  assert.ok(calls.some(params => params.cursor === 'page-2'));
});

test('older CLI uses full history only when pagination is unsupported', async () => {
  const calls = [], final = message('final', '旧版完整答复');
  const client = { request: async (method, params) => {
    calls.push({ method, params });
    if (method !== 'thread/read') throw new Error('Method not found');
    return { thread: { turns: [{ id: 'old', status: 'completed', items: [final] }] } };
  } };
  const result = await readHistory(client, 'old', { messages: true });
  assert.equal(result.items.at(-1).text, '旧版完整答复');
  assert.equal(result.latest.status, 'completed');
  assert.ok(calls.some(call => call.method === 'thread/read' && call.params.includeTurns === true));
});

test('queued follow-ups are reconciled with persisted messages instead of duplicating them', async t => {
  const { service, update } = setup(t); await service.refresh(); await service.select('external');
  const session = service.sessions.get('external');
  service._message(session, 'user', '再补充一点', 'queued:local');
  update({ id: 'turn-1', status: 'completed' }, [
    { id: 'server-user', type: 'userMessage', content: [{ type: 'text', text: '再补充一点' }] }, message('final', '已处理')
  ]);
  await service.refresh();
  assert.equal(session.messages.filter(item => item.text === '再补充一点').length, 1);
  assert.equal(session.messages.at(-1).text, '已处理');
});

test('every approval in one turn can notify, and terminal events deduplicate', async t => {
  const { service, attention } = setup(t);
  const session = service._session('native', { turnId: 'one-turn' });
  service._attention(session, 'waiting_approval', '操作 A', 'approval-a');
  service._attention(session, 'waiting_approval', '操作 B', 'approval-b');
  service._attention(session, 'completed', '完成');
  service._attention(session, 'completed', '完成');
  assert.equal(attention.length, 3);
});

test('macOS pet layer reaches the screen edge while Windows preserves its taskbar area', () => {
  const display = { bounds: { x: -1440, y: 0, width: 1440, height: 900 }, workArea: { x: -1440, y: 25, width: 1440, height: 805 } };
  assert.deepEqual(overlayBounds(display, 'darwin'), display.bounds);
  assert.deepEqual(overlayBounds(display, 'win32'), display.workArea);
});

test('hook turns without an id cannot be marked completed from the previous persisted answer', async t => {
  const { service, update } = setup(t);
  update({ id: 'old-turn', status: 'completed' });
  await service.refresh();
  service._hookEvent({ session_id: 'external', hook_event_name: 'UserPromptSubmit', cwd: '/project', prompt: '下一项任务' });
  await service.refresh();
  assert.equal(service.sessions.get('external').status, 'running');
  update({ id: 'new-turn', status: 'inProgress' });
  await service.refresh();
  assert.equal(service.sessions.get('external').turnId, 'new-turn');
});

test('display changes refit the overlay using the same bounds policy as initial creation', () => {
  const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 30, width: 1920, height: 1010 } };
  const manager = new OverlayWindowManager(); let actual;
  manager.win = { setBounds: value => { actual = value; } };
  manager.applyDisplayBounds(display);
  assert.deepEqual(actual, overlayBounds(display));
});

test('background polling detects completion and stops cleanly without a renderer timer', async t => {
  const { service, calls, update } = setup(t, { pollInterval: 10 });
  await service.refresh();
  update({ id: 'turn-1', status: 'completed' });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No background completion')), 1000);
    service.on('attention', () => { clearTimeout(timeout); resolve(); });
    service._schedulePoll();
  });
  service.stop(); const count = calls.length;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(calls.length, count);
});
