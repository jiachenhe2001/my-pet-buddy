const http = require('node:http');
const fs = require('node:fs');

function forwardHook({ infoPath, input, timeout = input.hook_event_name === 'PermissionRequest' ? 490000 : 1800 }) {
  return new Promise(resolve => {
    let info;
    try { info = JSON.parse(fs.readFileSync(infoPath, 'utf8')); } catch { resolve(null); return; }
    if (!Number.isInteger(info.port) || info.port < 1 || info.port > 65535 || !/^[a-f0-9]{64}$/.test(info.token)) { resolve(null); return; }
    const body = JSON.stringify(input);
    const req = http.request({ host: '127.0.0.1', port: info.port, path: '/event', method: 'POST',
      headers: { Authorization: `Bearer ${info.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; if (data.length > 64000) req.destroy(); });
      res.on('error', () => resolve(null));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(res.statusCode === 200 && ['allow', 'deny'].includes(result.behavior) ? {
            hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: result.behavior } }
          } : null);
        } catch { resolve(null); }
      });
    });
    const timer = setTimeout(() => { req.destroy(); resolve(null); }, timeout);
    req.on('close', () => clearTimeout(timer)); req.on('error', () => resolve(null)); req.end(body);
  });
}
async function runHook(infoPath) {
  let input = '';
  try {
    for await (const chunk of process.stdin) {
      input += chunk; if (input.length > 1024 * 1024) return;
    }
    const result = await forwardHook({ infoPath, input: JSON.parse(input) });
    if (result) await new Promise(resolve => process.stdout.write(JSON.stringify(result), resolve));
  } catch { /* No decision lets Codex continue its original approval flow. */ }
}
module.exports = { forwardHook, runHook };
