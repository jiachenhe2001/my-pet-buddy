const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Resolve npm's Windows shim to JS rather than putting prompts into a shell.
function resolveCodex(configured = '', env = process.env) {
  const directories = [...(env.PATH || '').split(path.delimiter), '/opt/homebrew/bin',
    '/usr/local/bin', path.join(os.homedir(), '.local/bin'),
    path.join(os.homedir(), '.npm-global/bin'), path.join(os.homedir(), '.volta/bin')];
  if (env.APPDATA) directories.push(path.join(env.APPDATA, 'npm'));
  const names = process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
  const candidates = configured ? [configured] : directories.flatMap(dir => names.map(name => path.join(dir, name)));
  for (let executable of candidates) {
    if (!path.isAbsolute(executable) || !fs.existsSync(executable) || !fs.statSync(executable).isFile()) continue;
    if (/\.cmd$/i.test(executable)) {
      executable = path.join(path.dirname(executable), 'node_modules/@openai/codex/bin/codex.js');
      if (!fs.existsSync(executable)) continue;
    }
    if (/\.(?:c?js|mjs)$/i.test(executable)) return {
      file: process.execPath, args: [executable], env: { ...env, ELECTRON_RUN_AS_NODE: '1' }
    };
    return { file: executable, args: [], env: { ...env } };
  }
  throw new Error('没有找到 Codex CLI。请在连接设置中选择本机 codex 程序。');
}
module.exports = { resolveCodex };
