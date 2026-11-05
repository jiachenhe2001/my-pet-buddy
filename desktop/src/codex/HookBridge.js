const { EventEmitter } = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');

const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];
const MARKER = '--pet-buddy-hook';
const quote = value => process.platform === 'win32' ? `"${value.replace(/"/g, '')}"` : `'${value.replace(/'/g, `'"'"'`)}'`;
function stripOwnHooks(config) {
  const hooks = { ...(config.hooks || {}) };
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) throw new Error('现有 hooks 配置格式不支持，已保留原文件。');
    hooks[event] = groups.map(group => {
      if (!group || !Array.isArray(group.hooks)) throw new Error('现有 hooks 配置格式不支持，已保留原文件。');
      return { ...group, hooks: group.hooks.filter(hook => !(typeof hook.command === 'string' && hook.command.includes(MARKER))) };
    }).filter(group => group.hooks.length);
    if (!hooks[event].length) delete hooks[event];
  }
  return { ...config, hooks };
}
class HookBridge extends EventEmitter {
  constructor({ directory, codexHome, command, approvalTimeout = 480000 }) {
    super(); this.directory = directory; this.codexHome = codexHome; this.command = command;
    this.approvalTimeout = approvalTimeout; this.pending = new Map();
    this.infoPath = path.join(directory, 'codex-hook-bridge.json');
  }
  async start() {
    if (this.server) return;
    this.token = randomBytes(32).toString('hex');
    const server = http.createServer((req, res) => this._receive(req, res)); this.server = server;
    server.requestTimeout = 0; server.headersTimeout = 10000; server.maxConnections = 32;
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.infoPath, JSON.stringify({ port: server.address().port, token: this.token }), { mode: 0o600 });
      fs.chmodSync(this.infoPath, 0o600); server.unref();
    } catch (error) { server.close(); this.server = null; throw error; }
  }
  _receive(req, res) {
    const finish = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
    };
    const given = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${this.token}`);
    if (req.headers.origin || given.length !== expected.length || !timingSafeEqual(given, expected)) { finish(403, {}); return; }
    if (req.method !== 'POST' || req.url !== '/event') { finish(404, {}); return; }
    let raw = '', oversized = false;
    req.setEncoding('utf8'); req.on('error', () => finish(400, {}));
    req.on('data', chunk => { raw += chunk; if (raw.length > 1024 * 1024) { oversized = true; finish(413, {}); req.destroy(); } });
    req.on('end', () => {
      if (oversized) return;
      let event;
      try { event = JSON.parse(raw); } catch { finish(400, {}); return; }
      if (!event || !EVENTS.includes(event.hook_event_name) || typeof event.session_id !== 'string' || !event.session_id || event.session_id.length > 256) { finish(400, {}); return; }
      if (event.hook_event_name !== 'PermissionRequest') { this.emit('event', event); finish(200, {}); return; }
      const id = randomUUID();
      const cancel = () => {
        const entry = this.pending.get(id); if (!entry) return;
        this.pending.delete(id); clearTimeout(entry.timer); this.emit('expired', id);
      };
      const timer = setTimeout(() => { cancel(); finish(200, { behavior: 'fallback' }); }, this.approvalTimeout);
      timer.unref?.(); this.pending.set(id, { event, finish, timer });
      res.on('close', cancel); this.emit('approval', { id, event });
    });
  }
  respond(id, behavior) {
    const entry = this.pending.get(id);
    if (!entry || !['allow', 'deny'].includes(behavior)) throw new Error('确认已过期，请查看 Codex 原来的确认窗口。');
    this.pending.delete(id); clearTimeout(entry.timer); entry.finish(200, { behavior });
  }
  cancelSession(sessionId, turnId) {
    for (const [id, entry] of this.pending) if (entry.event.session_id === sessionId && (!turnId || entry.event.turn_id === turnId)) {
      this.pending.delete(id); clearTimeout(entry.timer); entry.finish(200, { behavior: 'fallback' }); this.emit('expired', id);
    }
  }
  isInstalled() {
    try { return fs.readFileSync(path.join(this.codexHome, 'hooks.json'), 'utf8').includes(MARKER); } catch { return false; }
  }
  install(enabled = true) {
    if (enabled && (!this.server || !this.command?.length)) throw new Error('本机接入服务尚未启动。');
    const target = path.join(this.codexHome, 'hooks.json'); let original = '', config = {};
    if (fs.existsSync(target)) {
      original = fs.readFileSync(target, 'utf8');
      try { config = JSON.parse(original); } catch { throw new Error('现有 hooks.json 不是有效 JSON，已保留原文件。'); }
      if (!config || typeof config !== 'object' || Array.isArray(config) || (config.hooks && (typeof config.hooks !== 'object' || Array.isArray(config.hooks)))) throw new Error('现有 hooks 配置格式不支持，已保留原文件。');
    }
    const next = stripOwnHooks(config);
    if (enabled) {
      const command = [...this.command, MARKER, this.infoPath].map(quote).join(' ');
      for (const event of EVENTS) next.hooks[event] = [...(next.hooks[event] || []), {
        hooks: [{ type: 'command', command, timeout: event === 'PermissionRequest' ? 510 : 3 }]
      }];
    }
    fs.mkdirSync(this.codexHome, { recursive: true, mode: 0o700 });
    if (original) fs.writeFileSync(`${target}.pet-buddy-backup-${Date.now()}`, original, { mode: 0o600 });
    const temp = `${target}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, target);
    return { installed: enabled };
  }
  stop() {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.finish(200, { behavior: 'fallback' }); }
    this.pending.clear(); this.server?.close(); this.server = null;
    try { fs.unlinkSync(this.infoPath); } catch { /* Already removed. */ }
  }
}
module.exports = { HookBridge, EVENTS, stripOwnHooks };
