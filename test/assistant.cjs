const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { CodexService } = require('../desktop/src/codex/CodexService');
const { assistantFlow } = require('./assistant-flow.cjs');

async function main() {
  const root = path.resolve(__dirname, '..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-assistant-browser-'));
  const artifacts = path.join(root, 'test-results/assistant'); fs.mkdirSync(artifacts, { recursive: true });
  const service = new CodexService({ directory, codexHome: path.join(directory, 'codex'),
    binary: path.join(__dirname, 'fixtures/codex-server.cjs'), hookCommand: [process.execPath, 'test-hook.js'] });
  let browser;
  try {
    await service.start();
    browser = await chromium.launch({ headless: true,
      ...(process.env.PET_BUDDY_CHROMIUM ? { executablePath: process.env.PET_BUDDY_CHROMIUM } : {}),
      args: ['--no-sandbox', '--allow-file-access-from-files', ...JSON.parse(process.env.PET_BUDDY_CHROMIUM_ARGS || '[]')] });
    const context = await browser.newContext({ viewport: { width: 400, height: 650 }, deviceScaleFactor: 1.5 });
    await context.exposeBinding('__assistant', async (_source, method, payload) => {
      const methods = { getState: () => service.snapshot(), connect: () => service.connect(), refresh: () => service.refresh(),
        newProject: () => service.newSession(directory), select: () => service.select(payload), send: () => service.send(payload),
        respond: () => service.respond(payload), interrupt: () => service.interrupt(payload), hide: () => true,
        installHooks: () => service.installHooks(true), uninstallHooks: () => service.installHooks(false) };
      if (!methods[method]) throw new Error('Unsupported browser test operation'); return methods[method]();
    });
    await context.addInitScript(() => {
      window.petBuddy = { assistant: Object.fromEntries(['getState', 'connect', 'refresh', 'newProject', 'select', 'send', 'respond', 'interrupt', 'hide', 'installHooks', 'uninstallHooks']
        .map(method => [method, payload => window.__assistant(method, payload)])) };
      petBuddy.assistant.onChange = cb => {
        const listener = event => cb(event.detail); addEventListener('test-assistant-state', listener);
        return () => removeEventListener('test-assistant-state', listener);
      };
      petBuddy.assistant.onPlacement = () => () => {};
    });
    service.on('change', state => {
      for (const page of context.pages()) page.evaluate(state => dispatchEvent(new CustomEvent('test-assistant-state', { detail: state })), state).catch(() => {});
    });
    const page = await context.newPage(), errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(path.join(root, 'desktop/assistant/assistant.html')).href);
    await assistantFlow(page, { artifacts, infoPath: service.bridge.infoPath, cwd: directory, compact: true });
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    console.log('PASS: rendered assistant, continued input, scoped approvals/denials, questions, per-session drafts, real hook HTTP round trip, hide/interrupt, MiniMax isolation and compact settings');
    console.log('NOTE: only the Electron IPC facade is substituted in this browser check. Native flow runs in test:desktop.');
  } finally { service.stop(); await browser?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
