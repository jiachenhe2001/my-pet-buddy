// Native Electron by default; the optional browser mode only substitutes IPC.
const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { SettingsStore } = require('../desktop/src/store/SettingsStore');
const { DEFAULTS } = require('../desktop/src/store/defaults');

async function main() {
    const root = path.resolve(__dirname, '..');
    const artifacts = path.join(root, 'test-results', 'desktop');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-buddy-desktop-'));
    const emulate = process.env.PET_BUDDY_EMULATE_DESKTOP === '1';
    const errors = [], network = [], mainLog = [];
    let app, browser, context, popup, overlay;
    execFileSync(process.execPath, [path.join(root, 'desktop/scripts/copy-assets.js')]);
    fs.mkdirSync(artifacts, { recursive: true });
    try {
        if (emulate) {
            browser = await chromium.launch({ headless: true,
                ...(process.env.PET_BUDDY_CHROMIUM ? { executablePath: process.env.PET_BUDDY_CHROMIUM } : {}),
                // Match Electron's local-file origin behavior in browser mode.
                args: ['--no-sandbox', '--allow-file-access-from-files', ...JSON.parse(process.env.PET_BUDDY_CHROMIUM_ARGS || '[]')] });
            context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
            const data = {};
            const store = new SettingsStore({ get: key => data[key], set: (key, value) => { data[key] = value; } }, DEFAULTS);
            await context.exposeBinding('__settings', async (_source, method, values) => {
                if (method === 'getAll') return store.getAll();
                const changes = [];
                const collect = payload => changes.push({ ...payload, settings: store.getAll() });
                store.on('change', collect); store.setMany(values); store.removeListener('change', collect);
                for (const page of context.pages()) {
                    await page.evaluate(events => events.forEach(detail => dispatchEvent(new CustomEvent('test-settings', { detail }))), changes);
                }
                return true;
            });
            await context.addInitScript(() => {
                window.petBuddy = {
                    settings: {
                        getAll: () => window.__settings('getAll'),
                        set: (key, value) => window.__settings('setMany', { [key]: value }),
                        setMany: values => window.__settings('setMany', values),
                        onChange(cb) {
                            const listener = e => cb(e.detail); addEventListener('test-settings', listener);
                            return () => removeEventListener('test-settings', listener);
                        }
                    },
                    overlay: {
                        setInteractive: value => { window.__testInteractive = value; },
                        onCursor(cb) { window.__testCursor = cb; return () => {}; }
                    }
                };
            });
            popup = await context.newPage(); await popup.setViewportSize({ width: 400, height: 800 }); overlay = await context.newPage();
        } else {
            const executablePath = require('../desktop/node_modules/electron');
            app = await electron.launch({ executablePath,
                args: ['--no-sandbox', path.join(__dirname, 'fixtures/desktop-main.cjs')],
                env: { ...process.env, PET_BUDDY_TEST_PROFILE: profile }, timeout: 30000 });
            app.process().stdout.on('data', data => mainLog.push(data.toString()));
            app.process().stderr.on('data', data => mainLog.push(data.toString()));
            context = app.context();
        }
        const observe = page => {
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
        };
        context.pages().forEach(observe); context.on('page', observe);
        if (emulate) {
            await popup.goto(pathToFileURL(path.join(root, 'desktop/settings/popup.html')).href);
            await overlay.goto(pathToFileURL(path.join(root, 'desktop/overlay/overlay.html')).href);
        } else {
            for (let i = 0; i < 100; i++) {
                popup = app.windows().find(page => /\/settings\/popup.html$/.test(page.url()));
                overlay = app.windows().find(page => /\/overlay\/overlay.html$/.test(page.url()));
                if (popup && overlay) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!popup || !overlay) console.error('Native startup:', await app.evaluate(({ app, BrowserWindow }) => ({
                ready: app.isReady(), name: app.getName(), path: app.getAppPath(),
                windows: BrowserWindow.getAllWindows().map(win => ({ url: win.webContents.getURL(), visible: win.isVisible() }))
            })), mainLog.join(''));
            assert.ok(popup && overlay, 'both native windows opened');
        }
        const front = async page => {
            if (app && page === popup) await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/settings/popup.html')).show());
            await page.bringToFront();
        };
        const canvas = overlay.locator('#my-pet-observer canvas');
        const waitAction = action => overlay.waitForFunction(action => document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas').dataset.action === action, action);
        const saved = () => popup.evaluate(() => petBuddy.settings.getAll());
        await front(popup);
        await popup.locator('[data-cat="cat-1"]').waitFor();
        assert.equal((await saved()).species, 'cat', 'existing default remains available');
        assert.equal(await popup.evaluate(() => typeof require), 'undefined', 'renderer remains isolated');
        await popup.locator('#select-observer').click(); await front(overlay); await waitAction('idle');
        for (const action of ['idle', 'bounce', 'roll', 'peek', 'rain']) {
            await front(popup); await popup.locator(`button[data-action="${action}"]`).click();
            await front(overlay); await waitAction(action);
            assert.ok(await canvas.evaluate(element => {
                const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
                let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 80) count++;
                return count > 1000;
            }), `${action}: local original PNG rendered without canvas taint`);
        }
        console.log('PASS: all five shared animations render in the local desktop overlay');
        await overlay.screenshot({ path: path.join(artifacts, 'rain.png') });
        await front(popup); await popup.locator('#observer-paused').check(); await front(overlay);
        await overlay.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.paused === 'true');
        const frame = await canvas.getAttribute('data-frame');
        await overlay.waitForTimeout(500); assert.equal(await canvas.getAttribute('data-frame'), frame);
        await front(popup); await popup.locator('#observer-paused').uncheck(); await front(overlay);
        await overlay.waitForFunction(frame => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.frame !== frame, frame);
        await front(popup); await popup.locator('button[data-action="idle"]').click(); await front(overlay); await waitAction('idle');
        const point = await overlay.locator('#my-pet-observer .hit').evaluate(button => {
            const r = button.getBoundingClientRect();
            for (let y = r.top + 3; y < r.bottom; y += 6) for (let x = r.left + 3; x < r.right; x += 6) {
                if (button.getRootNode().elementFromPoint(x, y) === button) return { x, y };
            }
            throw new Error('No animated silhouette found');
        });
        await overlay.mouse.move(point.x, point.y); await overlay.mouse.down();
        await overlay.mouse.move(point.x - 120, point.y - 60, { steps: 8 }); await overlay.mouse.up();
        await popup.waitForFunction(async () => Number.isFinite((await petBuddy.settings.getAll()).observerPosition?.x));
        const position = (await saved()).observerPosition;
        if (app) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')).observerPosition, position);
        await overlay.reload(); await waitAction('idle');
        assert.deepEqual((await saved()).observerPosition, position);
        console.log('PASS: pause/resume, drag, and position persistence via the settings facade');

        // A blank point must release the native window; a silhouette must capture it.
        async function sampleCursor(point) {
            if (emulate) await overlay.evaluate(point => window.__testCursor(point), point);
            else {
                await app.evaluate(({ BrowserWindow }, point) => {
                    const bounds = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/overlay/')).getBounds();
                    global.__petTestCursor = { x: bounds.x + point.x, y: bounds.y + point.y };
                }, point);
                await overlay.waitForTimeout(150);
                return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/overlay/')).__testIgnoresMouse);
            }
        }
        const hit = await overlay.locator('#my-pet-observer .hit').evaluate(button => {
            const r = button.getBoundingClientRect();
            for (let y = r.top + 3; y < r.bottom; y += 6) for (let x = r.left + 3; x < r.right; x += 6) {
                if (button.getRootNode().elementFromPoint(x, y) === button) return { x, y };
            }
        });
        const ignoresPet = await sampleCursor(hit);
        if (app) assert.equal(ignoresPet, false);
        else assert.equal(await overlay.evaluate(() => window.__testInteractive), true);
        const ignoresBlank = await sampleCursor({ x: 2, y: 2 });
        if (app) assert.equal(ignoresBlank, true);
        else assert.equal(await overlay.evaluate(() => window.__testInteractive), false);
        console.log('PASS: transparent background releases mouse input');
        await overlay.mouse.click(hit.x, hit.y, { button: 'right' });
        await overlay.locator('#my-pet-observer select').selectOption('rain'); await waitAction('rain');
        await popup.waitForFunction(() => document.querySelector('button[data-action="rain"]').classList.contains('active'));
        const nextHit = await overlay.locator('#my-pet-observer .hit').evaluate(button => {
            const r = button.getBoundingClientRect();
            for (let y = r.top + 3; y < r.bottom; y += 6) for (let x = r.left + 3; x < r.right; x += 6) {
                if (button.getRootNode().elementFromPoint(x, y) === button) return { x, y };
            }
        });
        await overlay.mouse.click(nextHit.x, nextHit.y, { button: 'right' });
        await overlay.locator('[data-command="hide"]').click();
        await overlay.locator('#my-pet-observer').waitFor({ state: 'detached' });
        assert.equal((await saved()).enabled, false);
        await front(popup); await popup.locator('#my-pet-toggle').click(); await front(overlay); await waitAction('rain');
        await front(popup); await popup.locator('#observer-reset').click();
        assert.equal((await saved()).observerPosition, null);
        await popup.locator('[data-cat="dog-2"]').click(); await front(overlay);
        await overlay.locator('#stage').waitFor({ state: 'visible' });
        assert.ok((await overlay.locator('#pet').getAttribute('src')).endsWith('/dog-2.png'));
        assert.equal(await overlay.locator('#my-pet-observer').count(), 0);
        await front(popup); await popup.locator('#select-observer').click(); await front(overlay); await waitAction('rain');
        await front(popup); await popup.reload(); await popup.locator('#select-observer[aria-pressed="true"]').waitFor();
        assert.equal((await saved()).species, 'observer');
        await popup.screenshot({ path: path.join(artifacts, 'settings.png') });
        assert.deepEqual(errors, []); assert.deepEqual(network, [], 'no runtime HTTP requests');
        console.log('PASS: context menu sync, hide/restore, reset, legacy pets, settings reload, and offline assets');
        console.log(emulate ? 'NOTE: browser-only IPC substitute; native Electron is verified separately in CI.' : 'PASS: real Electron preload, IPC, local storage, and native click-through API');
    } catch (error) {
        console.error('Renderer errors:', errors);
        if (app) console.error('Main process:', mainLog.join(''));
        if (overlay) {
            console.error(await overlay.locator('body').evaluate(() => ({ host: !!document.querySelector('#my-pet-observer'),
                canvas: document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas').outerHTML,
                hint: document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('.hint').textContent })));
            await overlay.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
        }
        throw error;
    } finally {
        await app?.close(); await browser?.close(); fs.rmSync(profile, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
