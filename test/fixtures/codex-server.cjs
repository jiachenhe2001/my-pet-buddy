// Deterministic protocol peer. No credentials, network calls or model usage.
const readline = require('node:readline');
if (process.argv.includes('queue')) {
  process.stdout.write('Message queued\n'); process.stderr.write('Warning: no daemon available to resume\n');
} else {
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const event = (method, params) => write({ method, params });
  const pending = new Map(); let nextThread = 0, nextTurn = 0;
  const turns = new Map();
  function finish(threadId, turnId, content, status = 'completed') {
    event('item/agentMessage/delta', { threadId, turnId, itemId: `answer-${turnId}`, delta: content });
    event('item/completed', { threadId, turnId, item: { id: `answer-${turnId}`, type: 'agentMessage', text: content } });
    event('turn/completed', { threadId, turn: { id: turnId, status, error: status === 'failed' ? { message: '测试失败原因' } : null } });
  }
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line), { id, method, params = {} } = message;
    if (!method) {
      const request = pending.get(id); if (!request) return;
      pending.delete(id); event('serverRequest/resolved', { threadId: request.threadId, requestId: id });
      const accepted = message.result?.decision === 'accept' || message.result?.permissions?.network?.enabled || Object.keys(message.result?.answers || {}).length;
      finish(request.threadId, request.turnId, accepted ? '已经完成检查。收到你的确认。' : '已拒绝，原命令没有执行。'); return;
    }
    if (id === undefined) return;
    const reply = result => write({ id, result });
    if (method === 'initialize') reply({ userAgent: 'fixture' });
    else if (method === 'account/read') reply({ account: { type: process.env.PET_BUDDY_TEST_AUTH || 'chatgpt', planType: 'plus' } });
    else if (method === 'account/login/start') reply({ authUrl: 'https://auth.openai.com/test' });
    else if (method === 'thread/list') reply({ data: [{ id: 'history', name: '历史项目', cwd: '/project', updatedAt: 1 }], nextCursor: null });
    else if (method === 'thread/read') reply({ thread: { id: params.threadId, turns: [] } });
    else if (method === 'thread/turns/list') reply({ data: [{ id: 'old-turn' }], nextCursor: null });
    else if (method === 'thread/items/list') reply({ data: [{ item: { id: 'old-message', type: 'agentMessage', text: '历史回复' }, turnId: 'old-turn' }], nextCursor: null });
    else if (method === 'thread/start') {
      const thread = { id: `thread-${++nextThread}`, cwd: params.cwd };
      event('thread/started', { thread }); reply({ thread });
    } else if (method === 'thread/resume') reply({ thread: { id: params.threadId } });
    else if (method === 'turn/start') {
      const threadId = params.threadId, turnId = `turn-${++nextTurn}`, text = params.input[0].text;
      turns.set(threadId, turnId); event('turn/started', { threadId, turn: { id: turnId } });
      event('turn/plan/updated', { threadId, turnId, plan: [{ step: '检查输入框和气泡布局', status: 'completed' }, { step: '运行桌面端检查', status: 'in_progress' }] });
      if (text === 'failure') finish(threadId, turnId, '这次测试没有完成。', 'failed');
      else if (text === 'running') event('item/started', { threadId, turnId, item: { id: 'reasoning', type: 'reasoning' } });
      else {
        const requestId = `approval-${turnId}`, common = { threadId, turnId, itemId: `tool-${turnId}`, cwd: '/project' };
        let requestMethod = 'item/commandExecution/requestApproval', requestParams = { ...common, command: 'npm run test:desktop', reason: '运行测试，检查真实窗口交互。', availableDecisions: text === 'cancel-only' ? ['accept', 'cancel'] : ['accept', 'decline'] };
        if (text === 'input') { requestMethod = 'item/tool/requestUserInput'; requestParams = { ...common, questions: [{ id: 'choice', header: '范围', question: '先检查哪一项？', options: [{ label: '气泡', description: '检查交互' }, { label: '动作', description: '检查动画' }] }] }; }
        else if (text === 'permissions') { requestMethod = 'item/permissions/requestApproval'; requestParams = { ...common, permissions: { network: { enabled: true } }, reason: '连接测试服务' }; }
        event('item/started', { threadId, turnId, item: { id: common.itemId, type: 'commandExecution', command: requestParams.command || '' } });
        pending.set(requestId, { threadId, turnId }); write({ id: requestId, method: requestMethod, params: requestParams });
      }
      // Intentionally after notifications, to exercise response/event races.
      reply({ turn: { id: turnId, status: 'inProgress' } });
    } else if (method === 'turn/steer') reply({ turnId: params.expectedTurnId });
    else if (method === 'turn/interrupt') { finish(params.threadId, params.turnId, '已停止这一轮。', 'interrupted'); reply({}); }
    else write({ id, error: { code: -32601, message: `Unsupported fixture method: ${method}` } });
  });
}
