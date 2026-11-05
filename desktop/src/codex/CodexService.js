const { EventEmitter } = require('node:events');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { CodexClient } = require('./CodexClient');
const { HookBridge } = require('./HookBridge');
const { resolveCodex } = require('./command');
const { readHistory } = require('./history');

const ACTIVE = new Set(['running', 'waiting_approval', 'waiting_input']);
const bounded = (value, limit = 16000) => typeof value === 'string' ? value.slice(0, limit) : '';
const plain = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const idKey = id => `${typeof id}:${id}`;

class CodexService extends EventEmitter {
  constructor({ directory, hookCommand, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    binary = process.env.PET_BUDDY_CODEX_BIN || '', execute = execFile, bridge, clientFactory, pollInterval = 3000 } = {}) {
    super();
    this.binary = binary; this.execute = execute; this.codexHome = codexHome;
    this.clientFactory = clientFactory || (command => new CodexClient({ command }));
    this.bridge = bridge || new HookBridge({ directory, codexHome, command: hookCommand });
    this.sessions = new Map(); this.items = new Map(); this.pending = new Map();
    this.controlled = new Set(); this.sending = new Set(); this.selectedId = null;
    this.connection = { status: 'disconnected', authenticated: null, error: null };
    this.pollInterval = pollInterval; this.historyReads = new Map(); this.historyState = new Map();
    this.listedAt = new Map(); this.hookHistoryAfter = new Map(); this.revisions = new Map(); this.attentionKeys = new Map(); this.attention = null;
    this.bridge.on('event', event => this._hookEvent(event));
    this.bridge.on('approval', event => this._hookApproval(event));
    this.bridge.on('expired', id => {
      const request = this.pending.get(`hook:${id}`);
      const session = request && this.sessions.get(request.sessionId);
      if (session) session.phase = '这次确认已回到 Codex 原窗口';
      this._removePending(`hook:${id}`, true);
    });
  }
  async start() {
    try { await this.bridge.start(); }
    catch { this.bridgeError = '终端接入暂不可用；仍可使用小黑里的 Codex 会话。'; }
    this._changed();
  }
  snapshot() {
    return { connection: { ...this.connection }, selectedId: this.selectedId, attention: this.attention,
      hooks: { installed: this.bridge.isInstalled(), error: this.bridgeError || null },
      sessions: [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 80).map(session => ({
        ...session, messages: session.id === this.selectedId ? session.messages.slice(-60) : [],
        pending: [...this.pending.values()].filter(request => request.sessionId === session.id).map(request => request.publicRequest)
      })) };
  }
  _changed() { this.emit('change', this.snapshot()); }
  _attention(session, type, message = `${session.title} · ${session.phase}`, identity = '') {
    const key = `${session.turnId || ''}:${type}:${identity}`;
    if (this.attentionKeys.get(session.id) === key) return;
    this.attentionKeys.set(session.id, key);
    this.attention = { id: randomUUID(), sessionId: session.id, type, message, at: Date.now() };
    this.emit('attention', this.attention);
  }
  _schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.pollInterval || this.connection.status !== 'connected' || !this.client?.child) return;
    this.pollTimer = setTimeout(() => {
      this.refresh().catch(() => {}).finally(() => this._schedulePoll());
    }, this.pollInterval);
    this.pollTimer.unref?.();
  }
  _session(id, values = {}) {
    if (!this.sessions.has(id)) this.sessions.set(id, { id, title: 'Codex 会话', cwd: '', source: 'app-server',
      status: 'idle', phase: '', activity: '', messages: [], plan: [], turnId: null });
    const session = this.sessions.get(id); Object.assign(session, values); session.updatedAt = Date.now(); return session;
  }
  _message(session, role, text, id = randomUUID(), phase) {
    if (!text) return;
    const previous = session.messages.find(message => message.id === id);
    if (previous) { previous.text = bounded(text, 100000); if (phase) previous.phase = phase; }
    else session.messages.push({ id, role, text: bounded(text, 100000), ...(phase ? { phase } : {}) });
    session.messages = session.messages.slice(-60);
    let total = session.messages.reduce((sum, message) => sum + message.text.length, 0);
    while (total > 200000 && session.messages.length > 1) total -= session.messages.shift().text.length;
  }
  async connect(binary = this.binary) {
    if (this.connecting) return this.connecting;
    if (this.client?.child) return this.refresh();
    this.connecting = this._connect(binary).finally(() => { this.connecting = null; }); return this.connecting;
  }
  async _readAccount() {
    const { account } = await this.client.request('account/read', { refreshToken: false });
    this.connection.authenticated = account?.type === 'chatgpt';
    this.connection.planType = account?.planType || null;
    this.connection.error = account && account.type !== 'chatgpt' ? '请使用 ChatGPT 登录 Codex，以沿用套餐用量。' : null;
  }
  async _connect(binary) {
    this.connection = { status: 'connecting', authenticated: null, error: null }; this._changed();
    try {
      this.command = resolveCodex(binary, { ...process.env, CODEX_HOME: this.codexHome }); this.binary = binary;
      const client = this.clientFactory(this.command); this.client = client;
      client.on('notification', event => this._nativeEvent(event));
      client.on('request', event => this._nativeRequest(event));
      client.on('disconnected', error => {
        if (this.client !== client) return;
        this.connection = { status: 'disconnected', authenticated: null, error: error.message };
        clearTimeout(this.pollTimer); this.historyReads.clear();
        for (const [id, request] of this.pending) if (request.source === 'native') this.pending.delete(id);
        for (const id of this.controlled) {
          const session = this.sessions.get(id);
          if (session && ACTIVE.has(session.status)) { session.status = 'disconnected'; session.phase = '连接已断开，请核对原会话状态'; }
        }
        this.controlled.clear(); this.items.clear(); this._changed();
      });
      await client.start(); await this._readAccount(); this.connection.status = 'connected';
      for (const session of this.sessions.values()) if (session.source === 'app-server' && session.status === 'disconnected') {
        session.status = 'idle'; session.turnId = null; session.phase = '连接已恢复，请核对上轮结果后继续';
      }
      await this.refresh(); this._schedulePoll(); return this.snapshot();
    } catch (error) {
      this.client?.stop(); this.connection = { status: 'error', authenticated: null, error: error.message }; this._changed(); throw error;
    }
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this._refresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async _refresh() {
    const client = this.client;
    if (!client?.child) throw new Error('请先连接本机 Codex。');
    const result = await client.request('thread/list', { limit: 50, sortKey: 'updated_at', sortDirection: 'desc', archived: false });
    if (this.client !== client || !client.child) return this.snapshot();
    const candidates = new Set();
    for (const thread of result.data || []) {
      const fresh = !this.sessions.has(thread.id);
      const session = fresh ? this._session(thread.id, { source: 'history', phase: '正在同步会话' }) : this.sessions.get(thread.id);
      session.cwd = thread.cwd || session.cwd;
      session.title = bounded(thread.name || thread.preview || path.basename(session.cwd) || session.title, 100);
      const stamp = typeof thread.updatedAt === 'number' ? thread.updatedAt * (thread.updatedAt < 1e12 ? 1000 : 1) : 0;
      if (stamp && !this.controlled.has(session.id)) session.updatedAt = stamp;
      if (!this.controlled.has(session.id) && (fresh || !this.listedAt.has(thread.id) || this.listedAt.get(thread.id) !== stamp)) candidates.add(thread.id);
      // Record the listing only after a successful history read, so failures retry.
      session.listStamp = stamp;
    }
    for (const session of this.sessions.values()) {
      if (!this.controlled.has(session.id) && (session.id === this.selectedId || ACTIVE.has(session.status))) candidates.add(session.id);
    }
    // Bound IO concurrency even with a large existing session list.
    const ids = [...candidates];
    const results = await Promise.allSettled(Array.from({ length: Math.min(3, ids.length) }, async () => {
      while (ids.length && this.client === client && client.child) {
        const id = ids.shift();
        try { await this._syncHistory(id, id === this.selectedId); } catch { /* Error is shown on the session and retried. */ }
      }
    }));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    if (this.client === client && client.child) this._changed();
    return this.snapshot();
  }
  async _syncHistory(id, messages = true) {
    const existing = this.historyReads.get(id);
    if (existing) {
      await existing.promise;
      if (messages && !existing.messages) return this._syncHistory(id, true);
      return;
    }
    const client = this.client, session = this.sessions.get(id);
    if (!client?.child || !session) return;
    const revision = this.revisions.get(id), turnId = session.turnId, stamp = session.listStamp;
    const entry = { messages };
    entry.promise = (async () => {
      try {
        const result = await readHistory(client, id, { messages });
        if (this.client !== client || !client.child || this.revisions.get(id) !== revision || session.turnId !== turnId || this.controlled.has(id)) return;
        const latest = result.latest, previous = this.historyState.get(id);
        const afterTurn = this.hookHistoryAfter.get(id);
        if (afterTurn && latest?.id === afterTurn) return;
        if (afterTurn && latest?.id) this.hookHistoryAfter.delete(id);
        // Hooks may arrive before Codex flushes its history to disk.
        if (session.source === 'hook' && ACTIVE.has(session.status) && session.turnId && latest?.id !== session.turnId) return;
        const terminal = ['completed', 'failed', 'interrupted'];
        if (latest && previous?.turnId === latest.id && terminal.includes(previous.status) && latest.status === 'inProgress') return;
        if (messages) {
          const queued = session.messages.filter(message => message.id.startsWith('queued:') && !result.items.some(item =>
            item.type === 'userMessage' && (item.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n') === message.text));
          session.messages = [];
          for (const item of result.items) this._hydrate(session, item);
          for (const message of queued) session.messages.push(message);
        }
        session.historyError = null; session.syncedAt = Date.now();
        if (stamp !== undefined) this.listedAt.set(id, stamp);
        if (!latest?.status) { this._changed(); return; }
        const status = latest.status === 'inProgress' ? 'running' : terminal.includes(latest.status) ? latest.status : null;
        if (!status) { this._changed(); return; }
        const hasRequest = [...this.pending.values()].some(request => request.sessionId === id);
        if (!hasRequest) {
          session.turnId = latest.id; session.status = status;
          session.phase = { running: 'Codex 正在处理', completed: '本轮已完成', failed: '本轮遇到问题', interrupted: '本轮已停止' }[status];
          if (status !== 'running') { session.activity = ''; session.plan = []; }
          if (latest.error?.message) this._message(session, 'system', latest.error.message, `error:${latest.id}`);
        }
        this.historyState.set(id, { turnId: latest.id, status });
        // Initial history is a baseline; only subsequently observed endings notify.
        if (!hasRequest && terminal.includes(status) && previous &&
            (previous.turnId !== latest.id || previous.status === 'running' || previous.status === 'inProgress')) this._attention(session, status);
        this._changed();
      } catch (error) {
        if (this.client === client && client.child && this.revisions.get(id) === revision) {
          session.historyError = '会话同步暂时失败，将自动重试。'; this._changed();
        }
        throw error;
      }
    })();
    this.historyReads.set(id, entry);
    try { return await entry.promise; }
    finally { if (this.historyReads.get(id) === entry) this.historyReads.delete(id); }
  }
  async login() {
    if (!this.client?.child) await this.connect();
    return this.client.request('account/login/start', { type: 'chatgpt' });
  }
  async newSession(cwd) {
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('请选择有效的本机项目目录。');
    if (!this.client?.child) await this.connect();
    if (this.connection.authenticated !== true) throw new Error('请先使用 ChatGPT 账号登录 Codex。');
    const { thread } = await this.client.request('thread/start', { cwd });
    this.controlled.add(thread.id); this.selectedId = thread.id;
    this._session(thread.id, { cwd, title: path.basename(cwd) || cwd, source: 'app-server' }); this._changed(); return thread.id;
  }
  async select(id) {
    if (typeof id !== 'string' || !this.sessions.has(id)) throw new Error('会话不存在，请刷新列表。');
    this.selectedId = id; this._changed();
    if (this.client?.child && !this.controlled.has(id)) {
      try { await this._syncHistory(id, true); } catch { /* Keep the existing messages and expose the retry status. */ }
    }
  }
  _hydrate(session, item) {
    if (item.type === 'agentMessage') this._message(session, 'assistant', item.text, item.id, item.phase);
    if (item.type === 'userMessage') this._message(session, 'user', (item.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n'), item.id);
  }
  async send({ sessionId, text }) {
    const session = this.sessions.get(sessionId); text = bounded(text, 30000).trim();
    if (!session || !text) throw new Error('请选择会话并输入消息。');
    if (this.sending.has(sessionId)) throw new Error('消息正在提交，请稍候。');
    if (session.status === 'disconnected') throw new Error('会话已断开，请重新连接或回原会话继续。');
    if (['waiting_approval', 'waiting_input'].includes(session.status)) throw new Error('请先处理当前确认或提问。');
    if (!this.client?.child || this.connection.authenticated !== true) throw new Error('请先连接 Codex，并使用 ChatGPT 账号登录。');
    this.sending.add(sessionId);
    try {
      if (session.source !== 'app-server') return await this._queue(session, text);
      if (!this.controlled.has(sessionId)) {
        await this.client.request('thread/resume', { threadId: sessionId, excludeTurns: true }); this.controlled.add(sessionId);
      }
      const input = [{ type: 'text', text }], messageId = randomUUID();
      this._message(session, 'user', text, messageId); this._changed();
      try {
        if (session.status === 'running' && session.turnId) await this.client.request('turn/steer', { threadId: sessionId, expectedTurnId: session.turnId, input });
        else {
          const { turn } = await this.client.request('turn/start', { threadId: sessionId, input });
          // An approval/completion notification can precede the RPC response.
          if (session.turnId !== turn.id) { session.turnId = turn.id; session.status = 'running'; session.phase = 'Codex 正在处理你的消息'; }
        }
      } catch (error) { session.messages = session.messages.filter(message => message.id !== messageId); this._changed(); throw error; }
      this._changed(); return true;
    } finally { this.sending.delete(sessionId); }
  }
  _queue(session, text) {
    return new Promise((resolve, reject) => {
      this.execute(this.command.file, [...this.command.args, 'queue', `--thread=${session.id}`, `--message=${text}`, '--resume'],
        { env: this.command.env, windowsHide: true, timeout: 20000, maxBuffer: 256000 }, (error, stdout, stderr) => {
          if (error) { reject(new Error('这个 Codex 版本未能接收队列消息。请更新 CLI，或回原会话继续。')); return; }
          const warning = /warn|failed|unable|could not|失败|未能/i.test(`${stdout}\n${stderr}`);
          this._message(session, 'user', text, `queued:${randomUUID()}`);
          this._message(session, 'system', warning ? '消息已排队，但未确认成功恢复。请检查原 Codex 会话。' : '消息已交给 Codex 队列，等待原会话处理。');
          this._changed(); resolve({ queued: true, resumed: !warning });
        });
    });
  }
  async interrupt(id) {
    const session = this.sessions.get(id);
    if (!session || !this.controlled.has(id) || !ACTIVE.has(session.status) || !session.turnId) throw new Error('请在原 Codex 窗口停止这个会话。');
    await this.client.request('turn/interrupt', { threadId: id, turnId: session.turnId });
  }
  _nativeEvent({ method, params = {} }) {
    if (['account/updated', 'account/login/completed'].includes(method)) {
      this._readAccount().then(() => this._changed()).catch(() => {}); return;
    }
    if (method === 'serverRequest/resolved') {
      for (const [id, request] of this.pending) if (request.source === 'native' && request.sessionId === params.threadId && idKey(request.rpcId) === idKey(params.requestId)) this._removePending(id);
      return;
    }
    const id = params.threadId || params.thread?.id; if (!id) return;
    this.revisions.set(id, (this.revisions.get(id) || 0) + 1);
    const session = this._session(id), item = params.item;
    if (params.thread) {
      session.cwd = params.thread.cwd || session.cwd;
      session.title = bounded(params.thread.name || params.thread.preview || path.basename(session.cwd) || session.title, 100);
    }
    if (method === 'thread/started') { this.controlled.add(id); session.source = 'app-server'; }
    if (session.source === 'hook' && !this.controlled.has(id)) return;
    if (method === 'turn/started') {
      this.attentionKeys.delete(id); this._clearSessionRequests(id); session.turnId = params.turn.id; session.status = 'running';
      session.phase = '正在处理'; session.activity = ''; session.plan = [];
    } else if (method === 'thread/status/changed' && params.status?.type === 'active') {
      const flags = params.status.activeFlags || [];
      session.status = flags.includes('waitingOnApproval') ? 'waiting_approval' : flags.includes('waitingOnUserInput') ? 'waiting_input' : 'running';
    } else if (method === 'turn/plan/updated') session.plan = (params.plan || []).slice(0, 20);
    else if (method === 'item/started' && item) {
      const phases = { commandExecution: '正在执行命令', fileChange: '正在修改文件', mcpToolCall: '正在调用工具', webSearch: '正在搜索', reasoning: '正在思考', contextCompaction: '正在整理上下文' };
      if (phases[item.type]) {
        session.phase = phases[item.type];
        session.activity = bounded(item.type === 'fileChange' ? (item.changes || []).map(change => `${change.path || ''}\n${change.diff || plain(change.kind || '')}`).join('\n\n') : item.command || item.tool || '');
        if (['fileChange', 'commandExecution'].includes(item.type)) this.items.set(`${id}:${item.id}`, session.activity);
      }
    } else if (method === 'item/agentMessage/delta') {
      const previous = session.messages.find(message => message.id === params.itemId)?.text || '';
      this._message(session, 'assistant', previous + params.delta, params.itemId);
    } else if (method === 'item/completed' && item) {
      const text = (item.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
      if (item.type !== 'userMessage' || !session.messages.some(message => message.role === 'user' && message.text === text)) this._hydrate(session, item);
    } else if (method === 'turn/completed') {
      if (session.turnId && session.turnId !== params.turn.id) return;
      this._clearSessionRequests(id);
      session.status = params.turn.status === 'completed' ? 'completed' : params.turn.status === 'interrupted' ? 'interrupted' : 'failed';
      session.phase = { completed: '本轮已完成', interrupted: '本轮已停止', failed: '本轮遇到问题' }[session.status];
      session.activity = ''; session.plan = [];
      if (params.turn.error?.message) this._message(session, 'system', params.turn.error.message);
      this._attention(session, session.status);
    } else if (method === 'error') {
      session.activity = bounded(params.error?.message || 'Codex 返回错误');
      if (!params.willRetry) session.phase = '遇到问题，等待 Codex 最终状态';
    }
    this._changed();
  }
  _nativeRequest({ id: rpcId, method, params = {}, epoch }) {
    const known = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput'];
    if (!known.includes(method) || typeof params.threadId !== 'string') { this.client.rejectRequest(rpcId, '小黑暂不支持此交互，请在完整 Codex 客户端处理。', epoch); return; }
    const previous = this.sessions.get(params.threadId);
    if (previous?.turnId && previous.turnId !== params.turnId) { this.client.rejectRequest(rpcId, '任务轮次已失效。', epoch); return; }
    const session = this._session(params.threadId, { source: 'app-server', turnId: params.turnId }); this.controlled.add(session.id);
    const kind = method.includes('requestUserInput') ? 'input' : method.includes('permissions/') ? 'permissions' : method.includes('fileChange') ? 'file' : 'command';
    const id = `native:${epoch}:${idKey(rpcId)}`, item = this.items.get(`${session.id}:${params.itemId}`);
    const detail = kind === 'input' ? '' : kind === 'permissions' ? plain(params.permissions || {}) : kind === 'command'
      ? params.networkApprovalContext ? plain(params.networkApprovalContext) : params.command || item || ''
      : item || (params.grantRoot ? `授权目录：${params.grantRoot}` : '');
    const publicRequest = { id, kind, context: `${session.title} · ${params.cwd || session.cwd}`,
      title: { input: 'Codex 想确认一下', permissions: '授予本轮所需权限', file: '允许这次文件操作？', command: params.networkApprovalContext ? '允许访问这个网络地址？' : '允许执行这次命令？' }[kind],
      reason: bounded(params.reason), detail: bounded(detail || '未收到对应操作的详情，请回 Codex 核对。'),
      questions: kind === 'input' ? params.questions : undefined,
      canAccept: (['input', 'permissions'].includes(kind) || Boolean(detail)) && (!Array.isArray(params.availableDecisions) || params.availableDecisions.includes('accept')) };
    this.pending.set(id, { source: 'native', sessionId: session.id, turnId: params.turnId, rpcId, epoch, method, params, publicRequest });
    session.status = kind === 'input' ? 'waiting_input' : 'waiting_approval'; session.phase = publicRequest.title;
    this.revisions.set(session.id, (this.revisions.get(session.id) || 0) + 1);
    this.selectedId = session.id; this._attention(session, session.status, publicRequest.title, publicRequest.id); this._changed();
  }
  _hookEvent(event) {
    const id = event.session_id; if (this.controlled.has(id)) return;
    const previous = this.sessions.get(id);
    if (previous?.turnId && event.turn_id && previous.turnId !== event.turn_id && ['Stop', 'Interrupt', 'PostToolUse'].includes(event.hook_event_name)) return;
    this.revisions.set(id, (this.revisions.get(id) || 0) + 1);
    const session = this._session(id, { source: 'hook', cwd: bounded(event.cwd), turnId: event.turn_id || null });
    if (event.cwd) session.title = path.basename(event.cwd) || '终端 Codex';
    const type = event.hook_event_name;
    if (type === 'SessionStart') { session.status = 'idle'; session.phase = 'Codex 会话已接入'; }
    if (type === 'UserPromptSubmit') {
      const history = this.historyState.get(id);
      if (!event.turn_id && history?.status === 'completed') this.hookHistoryAfter.set(id, history.turnId);
      this.attentionKeys.delete(id); this._clearSessionRequests(id); session.status = 'running'; session.phase = 'Codex 正在处理'; this._message(session, 'user', bounded(event.prompt));
    }
    if (['PreToolUse', 'PostToolUse'].includes(type)) {
      session.status = 'running'; session.phase = type === 'PreToolUse' ? `正在调用 ${bounded(event.tool_name, 80)}` : '操作返回，继续处理';
      session.activity = bounded(event.tool_input?.command || event.tool_input?.description || plain(event.tool_input || {}));
    }
    if (['Stop', 'Interrupt', 'SessionEnd'].includes(type)) {
      this.bridge.cancelSession(id); this._clearSessionRequests(id);
      session.status = type === 'Stop' ? 'completed' : type === 'Interrupt' ? 'interrupted' : 'disconnected';
      session.phase = type === 'Stop' ? '本轮已完成' : type === 'Interrupt' ? '本轮已停止' : 'Codex 会话已结束';
      this._message(session, 'assistant', event.last_assistant_message);
      session.activity = ''; session.plan = [];
      if (type === 'Stop') this._attention(session, 'completed');
    }
    if (!this.selectedId) this.selectedId = id; this._changed();
  }
  _hookApproval({ id: bridgeId, event }) {
    if (this.controlled.has(event.session_id)) { this.bridge.cancelSession(event.session_id, event.turn_id); return; }
    const previous = this.sessions.get(event.session_id);
    if (previous && ACTIVE.has(previous.status) && previous.turnId && event.turn_id && previous.turnId !== event.turn_id) { this.bridge.cancelSession(event.session_id, event.turn_id); return; }
    const session = this._session(event.session_id, { source: 'hook', cwd: bounded(event.cwd), turnId: event.turn_id || null,
      status: 'waiting_approval', phase: 'Codex 需要你的确认' });
    session.title = path.basename(session.cwd) || 'Codex 会话'; const id = `hook:${bridgeId}`;
    const detail = bounded(event.tool_input?.command || plain(event.tool_input || {}));
    const publicRequest = { id, kind: 'command', title: '允许这次 Codex 操作？', reason: bounded(event.tool_input?.description), detail,
      context: `${session.title} · ${session.cwd}`, canAccept: Boolean(detail && detail !== '{}') };
    this.pending.set(id, { source: 'hook', sessionId: session.id, turnId: session.turnId, bridgeId, publicRequest });
    this.revisions.set(session.id, (this.revisions.get(session.id) || 0) + 1);
    this.selectedId = session.id; this._attention(session, session.status, publicRequest.title, publicRequest.id); this._changed();
  }
  respond({ id, decision, answers }) {
    const request = this.pending.get(id);
    if (!request || !['accept', 'decline'].includes(decision)) throw new Error('这次确认已处理或过期，请查看最新状态。');
    const session = this.sessions.get(request.sessionId);
    if (!session || session.turnId !== request.turnId) { this._removePending(id); throw new Error('任务轮次已改变，确认已失效。'); }
    if (decision === 'accept' && request.publicRequest.canAccept === false) throw new Error('缺少完整操作详情，暂不能授权。');
    if (request.source === 'hook') this.bridge.respond(request.bridgeId, decision === 'accept' ? 'allow' : 'deny');
    else {
      const available = request.params.availableDecisions;
      const wireDecision = decision === 'decline' && Array.isArray(available) && !available.includes('decline') && available.includes('cancel') ? 'cancel' : decision;
      if (available && !available.includes(wireDecision)) throw new Error('Codex 没有提供这种确认方式，请回原会话处理。');
      let result = { decision: wireDecision };
      if (request.method === 'item/permissions/requestApproval') result = { permissions: decision === 'accept' ? request.params.permissions || {} : {}, scope: 'turn' };
      if (request.method === 'item/tool/requestUserInput') {
        if (decision === 'accept' && (request.params.questions || []).some(question => !Array.isArray(answers?.[question.id]?.answers) || !answers[question.id].answers.some(answer => typeof answer === 'string' && answer.trim()))) throw new Error('请回答所有问题。');
        result = { answers: decision === 'accept' ? answers : {} };
      }
      this.client.respond(request.rpcId, result, request.epoch);
    }
    this.pending.delete(id);
    const next = [...this.pending.values()].find(other => other.sessionId === session.id);
    session.status = next ? next.publicRequest.kind === 'input' ? 'waiting_input' : 'waiting_approval' : 'running';
    session.phase = next ? '还有操作需要你确认' : decision === 'accept' ? '已回传确认，等待 Codex 继续' : '已拒绝，等待 Codex 返回';
    this._changed(); return true;
  }
  _removePending(id, keepStatus = false) {
    const request = this.pending.get(id); if (!this.pending.delete(id)) return;
    const session = request && this.sessions.get(request.sessionId);
    if (!keepStatus && session && ['waiting_approval', 'waiting_input'].includes(session.status) && ![...this.pending.values()].some(other => other.sessionId === session.id)) {
      session.status = 'running'; session.phase = '确认请求已结束，等待 Codex 继续';
    }
    this._changed();
  }
  _clearSessionRequests(id) {
    for (const [key, request] of this.pending) if (request.sessionId === id) this.pending.delete(key);
    for (const key of this.items.keys()) if (key.startsWith(`${id}:`)) this.items.delete(key);
  }
  installHooks(enabled) {
    if (enabled && this.bridgeError) throw new Error(this.bridgeError);
    const result = this.bridge.install(enabled); this._changed(); return result;
  }
  hasActiveTasks() { return [...this.controlled].some(id => ACTIVE.has(this.sessions.get(id)?.status)); }
  stop() { clearTimeout(this.pollTimer); this.pollInterval = 0; this.bridge.stop(); this.client?.stop(); }
}
module.exports = { CodexService };
