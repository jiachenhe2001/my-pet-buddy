const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');

class CodexClient extends EventEmitter {
  constructor({ command, timeout = 20000 }) {
    super();
    this.command = command; this.timeout = timeout;
    this.pending = new Map(); this.nextId = 0; this.epoch = 0; this.child = null;
  }
  async start() {
    if (this.child) return;
    const child = spawn(this.command.file, [...this.command.args, 'app-server', '--listen', 'stdio://'], {
      env: this.command.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    this.child = child;
    const epoch = ++this.epoch;
    let buffer = '';
    child.stdin.on('error', error => this._closed(child, error));
    child.stdout.on('error', error => this._closed(child, error));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      buffer += chunk;
      if (buffer.length > 16 * 1024 * 1024) {
        this._closed(child, new Error('Codex 响应过大，连接已关闭。')); child.kill(); return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        this._message(message, epoch);
      }
    });
    // Drain logs without exposing tokens or account details to the renderer.
    child.stderr.on('data', () => {});
    child.on('error', error => this._closed(child, new Error(`无法启动 Codex：${error.message}`)));
    child.on('exit', (code, signal) => this._closed(child, new Error(`Codex 连接已结束（${signal || code || 0}）。`)));
    await this.request('initialize', { clientInfo: { name: 'my_pet_buddy', title: '小黑助手', version: '1.5.0' }, capabilities: {} });
    this.notify('initialized');
  }
  _message(message, epoch) {
    if (message.method) {
      this.emit(message.id !== undefined ? 'request' : 'notification', { ...message, epoch }); return;
    }
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message || 'Codex 操作未完成。'));
    else request.resolve(message.result);
  }
  _write(message) {
    if (!this.child || this.child.stdin.destroyed || this.child.stdin.writableEnded) throw new Error('Codex 尚未连接。');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error(`Codex 响应超时（${method}），请核对状态后重试。`));
      }, this.timeout);
      timer.unref?.(); this.pending.set(id, { resolve, reject, timer });
      try { this._write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  notify(method, params = {}) { this._write({ method, params }); }
  respond(id, result, epoch) {
    if (epoch !== this.epoch || !this.child) throw new Error('这次确认所属的连接已过期。');
    this._write({ id, result });
  }
  rejectRequest(id, message, epoch) {
    if (epoch === this.epoch && this.child) this._write({ id, error: { code: -32601, message } });
  }
  _closed(child, error) {
    if (this.child !== child) return;
    this.child = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear(); this.emit('disconnected', error);
  }
  stop() {
    const child = this.child;
    if (child) { this._closed(child, new Error('Codex 连接已关闭。')); child.stdin.end(); child.kill(); }
  }
}
module.exports = { CodexClient };
