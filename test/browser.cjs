// Uses a real unpacked extension by default. Headless-shell environments can
// emulate only chrome.storage/runtime while exercising the same rendering code.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

async function main() {
    const source = path.resolve(__dirname, '..');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-buddy-extension-'));
    // Exercise an actual second registered character without shipping test art.
    for (const file of ['manifest.json', 'pets.js', 'observer.js', 'content.js', 'popup.html', 'popup.js', 'popup-controller.js', 'popup.css', 'icons', 'pets']) {
        fs.cpSync(path.join(source, file), path.join(root, file), { recursive: true });
    }
    fs.cpSync(path.join(source, 'pets/observer'), path.join(root, 'pets/test-character'), { recursive: true });
    fs.appendFileSync(path.join(root, 'pets.js'), `\n{ const catalog = typeof module !== 'undefined' && module.exports ? module.exports : globalThis.PetBuddyPets; catalog.register({ ...catalog.get(), id: 'test-character', name: '测试形象', assetRoot: 'pets/test-character', thumbnail: 'pets/test-character/roll/frame-04.png' }); }\n`);
    const artifacts = path.resolve(process.env.PET_BUDDY_ARTIFACTS || path.join(source, 'test-results'));
    fs.mkdirSync(artifacts, { recursive: true });
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-buddy-test-'));
    const emulate = process.env.PET_BUDDY_EMULATE_EXTENSION === '1';
    const server = http.createServer((request, response) => {
        if (emulate && request.url === '/test-api.js') {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(`(() => {
                const key = 'test-pet-buddy-sync', listeners = [];
                const read = () => JSON.parse(localStorage.getItem(key) || '{}');
                const emit = changes => queueMicrotask(() => listeners.forEach(listener => listener(changes, 'sync')));
                const changes = (before, after) => Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
                    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
                    .map(key => [key, { oldValue: before[key], newValue: after[key] }]));
                globalThis.chrome ||= {};
                chrome.storage = { sync: {
                    get(keys, callback) {
                        const store = read();
                        const value = keys == null ? store : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in store).map(key => [key, store[key]]));
                        if (callback) queueMicrotask(() => callback(value)); else return Promise.resolve(value);
                    },
                    set(value, callback) {
                        const before = read(), after = { ...before, ...value };
                        localStorage.setItem(key, JSON.stringify(after)); emit(changes(before, after));
                        if (callback) queueMicrotask(callback); return Promise.resolve();
                    }
                }, onChanged: { addListener(listener) { listeners.push(listener); }, removeListener(listener) { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); } } };
                chrome.runtime = { getURL: path => location.origin + '/' + path.replace(/^\\//, '') };
                addEventListener('storage', event => { if (event.key === key) emit(changes(JSON.parse(event.oldValue || '{}'), JSON.parse(event.newValue || '{}'))); });
            })();`);
            return;
        }
        if (emulate && request.url !== '/' && request.url !== '/fixture.css') {
            const relative = decodeURIComponent(request.url.split('?')[0]).replace(/^\//, '');
            const file = path.resolve(root, relative);
            if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
                response.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
                let content = fs.readFileSync(file);
                if (file.endsWith('popup.html')) content = content.toString().replace('<script src="observer.js">', '<script src="/test-api.js"></script><script src="observer.js">');
                response.end(content); return;
            }
            response.statusCode = 404; response.end(); return;
        }
        if (request.url === '/fixture.css') {
            response.setHeader('Content-Type', 'text/css');
            response.end('body{font:18px system-ui;background:#f0f4f7;color:#263849;padding:60px}canvas{display:none!important}button{background:magenta!important}');
            return;
        }
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'");
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"><title>Pet Buddy test</title></head><body><h1>小黑的网页测试</h1><p>这是一张带严格 CSP 和全局样式的普通网页。</p><button id="website-button">网页按钮</button><input placeholder="正常输入文字">' + (emulate ? '<script src="/test-api.js"></script><script src="/pets.js"></script><script src="/observer.js"></script><script src="/content.js"></script>' : '') + '</body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let context;
    const errors = [];
    try {
        context = await chromium.launchPersistentContext(profile, {
            headless: true, channel: 'chromium',
            ...(process.env.PET_BUDDY_CHROMIUM ? { executablePath: process.env.PET_BUDDY_CHROMIUM } : {}),
            ignoreDefaultArgs: ['--disable-extensions'],
            args: ['--no-sandbox', ...JSON.parse(process.env.PET_BUDDY_CHROMIUM_ARGS || '[]'), `--disable-extensions-except=${root}`, `--load-extension=${root}`],
            viewport: { width: 1280, height: 800 }
        });
        context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
        const extensionId = crypto.createHash('sha256').update(root).digest('hex').slice(0, 32)
            .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
        const popup = await context.newPage();
        const fixture = `http://127.0.0.1:${server.address().port}/`;
        await popup.goto(emulate ? fixture + 'popup.html' : `chrome-extension://${extensionId}/popup.html`);
        await popup.setViewportSize({ width: 400, height: 800 });
        assert.equal(await popup.locator('body').evaluate(element => getComputedStyle(element).width), '380px', 'shared panel stylesheet loaded');
        const page = await context.newPage();
        await page.goto(fixture);
        const canvas = page.locator('#my-pet-observer canvas');
        await canvas.waitFor();
        await page.waitForFunction(() => document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas').dataset.frame);
        assert.equal(await canvas.evaluate(element => getComputedStyle(element).display), 'block');
        console.log('PASS: clean install displays the pet under hostile CSS and strict CSP');
        await page.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.action !== 'idle', null, { timeout: 15000 });
        await page.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.action === 'idle', null, { timeout: 10000 });
        console.log('PASS: automatic mode plays an activity and returns to idle');

        async function choose(action) {
            await popup.bringToFront();
            await popup.locator(`button[data-action="${action}"]`).click();
            await page.bringToFront();
            await page.waitForFunction(action => document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas').dataset.action === action, action);
        }
        for (const action of ['idle', 'bounce', 'roll', 'peek', 'rain']) {
            await choose(action);
            const pixels = await canvas.evaluate(element => {
                const data = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
                let count = 0;
                for (let i = 3; i < data.length; i += 4) if (data[i] > 80) count++;
                return count;
            });
            assert.ok(pixels > 1000, `${action}: original art rendered`);
            await page.screenshot({ path: path.join(artifacts, `${action}.png`) });
        }
        console.log('PASS: all five actions render original frames without tainting the canvas');

        await popup.locator('#observer-paused').check();
        await page.bringToFront();
        await page.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.paused === 'true');
        const paused = await canvas.getAttribute('data-frame');
        await page.waitForTimeout(500);
        assert.equal(await canvas.getAttribute('data-frame'), paused);
        await popup.locator('#observer-paused').uncheck();
        await page.bringToFront();
        await page.waitForFunction(previous => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.frame !== previous, paused);
        console.log('PASS: pause/resume freezes and continues the animation');

        await choose('idle');
        async function hitPoint() {
            return page.locator('#my-pet-observer .hit').evaluate(button => {
                const rect = button.getBoundingClientRect(), shadow = button.getRootNode();
                for (let y = rect.top + 3; y < rect.bottom; y += 6) {
                    for (let x = rect.left + 3; x < rect.right; x += 6) {
                        if (shadow.elementFromPoint(x, y) === button) return { x, y };
                    }
                }
                throw new Error('No visible hit region');
            });
        }
        let point = await hitPoint();
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x - 130, point.y - 70, { steps: 8 });
        await page.mouse.up();
        await popup.waitForFunction(async () => Number.isFinite((await chrome.storage.sync.get('my-pet-observer-position'))['my-pet-observer-position']?.x));
        const saved = await popup.evaluate(async () => (await chrome.storage.sync.get('my-pet-observer-position'))['my-pet-observer-position']);
        assert.ok(Number.isFinite(saved.x) && Number.isFinite(saved.y));
        assert.equal(await canvas.getAttribute('data-action'), 'idle', 'drag must not trigger a click interaction');
        await page.reload();
        await canvas.waitFor();
        await page.waitForFunction(() => document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas').dataset.action === 'idle');
        const beforeAction = await canvas.boundingBox();
        await choose('roll'); await choose('rain'); await choose('idle');
        const afterAction = await canvas.boundingBox();
        assert.ok(Math.abs(beforeAction.x - afterAction.x) < 1 && Math.abs(beforeAction.y - afterAction.y) < 1,
            'wider actions must not permanently shift the saved anchor');
        point = await hitPoint();
        await page.mouse.click(point.x, point.y);
        await page.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.action === 'bounce');
        await page.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.action === 'idle');
        console.log('PASS: dragging persists; click bounces then restores the selected action');

        const blank = await canvas.boundingBox();
        await page.evaluate(({ x, y }) => {
            const button = document.querySelector('#website-button');
            Object.assign(button.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '10px', height: '10px', padding: '0' });
            window.websiteClicks = 0;
            button.addEventListener('click', () => window.websiteClicks++);
        }, { x: blank.x, y: blank.y });
        await page.mouse.click(blank.x + 2, blank.y + 2);
        assert.equal(await page.evaluate(() => window.websiteClicks), 1);
        console.log('PASS: transparent margins pass clicks to the underlying webpage');

        point = await hitPoint();
        await page.mouse.click(point.x, point.y, { button: 'right' });
        await page.locator('#my-pet-observer select').selectOption('rain');
        await page.waitForFunction(() => document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').dataset.action === 'rain');
        await page.setViewportSize({ width: 360, height: 300 });
        await page.waitForFunction(() => {
            const rect = document.querySelector('#my-pet-observer').shadowRoot.querySelector('canvas').getBoundingClientRect();
            return rect.x >= -1 && rect.y >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
        });
        const small = await canvas.boundingBox();
        assert.ok(small.x >= -1 && small.y >= -1 && small.x + small.width <= 361 && small.y + small.height <= 301);
        await page.setViewportSize({ width: 1280, height: 800 });
        await popup.reload();
        await popup.locator('#pet-selection').selectOption('test-character');
        await page.waitForFunction(() => document.querySelector('#my-pet-observer')?.dataset.petId === 'test-character');
        await page.waitForFunction(() => document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas').dataset.action === 'rain');
        await popup.reload();
        await popup.waitForFunction(() => document.querySelector('#pet-selection').value === 'test-character');
        assert.equal(await page.locator('#my-pet-observer').count(), 1, 'switching cleans up the previous player');
        await popup.evaluate(() => chrome.storage.sync.set({ 'my-pet-character': 'cat-1', 'my-pet-selected-cat': 'dog-2', 'my-pet-motion-mode': 'parade' }));
        await page.waitForFunction(() => document.querySelector('#my-pet-observer')?.dataset.petId === 'observer');
        await popup.waitForFunction(() => document.querySelector('#pet-selection').value === 'observer');
        await popup.waitForFunction(async () => (await chrome.storage.sync.get('my-pet-character'))['my-pet-character'] === 'observer');
        assert.equal(await page.locator('#my-pet-container').count(), 0);
        assert.equal(await popup.locator('option[value="cat-1"]').count(), 0);
        await popup.locator('#observer-reset').click();
        await popup.waitForFunction(async () => (await chrome.storage.sync.get('my-pet-observer-position'))['my-pet-observer-position'] === null);
        await popup.locator('#observer-size').fill('160');
        await popup.locator('#observer-size').dispatchEvent('change');
        await popup.waitForFunction(async () => (await chrome.storage.sync.get('my-pet-size'))['my-pet-size'] === 160);
        await popup.locator('#theme-toggle').click();
        await popup.screenshot({ path: path.join(artifacts, 'popup-dark.png') });
        await popup.locator('#theme-toggle').click();
        await popup.locator('#my-pet-toggle').click();
        await page.locator('#my-pet-observer').waitFor({ state: 'detached' });
        await page.waitForTimeout(400);
        assert.equal(await page.locator('#my-pet-observer').count(), 0);
        await popup.screenshot({ path: path.join(artifacts, 'popup.png') });
        assert.deepEqual(errors, []);
        console.log(emulate ? 'NOTE: Chrome storage/runtime were emulated; native extension loading is not covered by this run.' : 'PASS: native Chrome extension APIs and injection');
        console.log('PASS: right-click menu, viewport clamp, registered character switch/reload, retired selection fallback, size, reset, theme and disable cleanup');
    } finally {
        await context?.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(profile, { recursive: true, force: true });
        fs.rmSync(root, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

