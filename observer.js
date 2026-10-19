// Shared by Chrome and Electron. Hosts provide their own asset URLs and storage.
(function(root) {
    'use strict';

    const catalog = typeof module !== 'undefined' && module.exports ? require('./pets') : root.PetBuddyPets;
    const defaultPet = catalog.get();
    const ACTIONS = defaultPet.actions;
    const pingPong = frames => frames.concat(frames.slice(1, -1).reverse());
    const DEFAULTS = { action: 'auto', size: 120, paused: false };
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const isAction = (action, pet = defaultPet) => action === 'auto' || own(pet.actions, action);
    const validSize = size => Number.isFinite(size) ? Math.max(80, Math.min(180, size)) : DEFAULTS.size;
    const frameAt = (action, elapsed, pet = defaultPet) => {
        const definition = own(pet.actions, action) ? pet.actions[action] : pet.actions.idle;
        return definition.frames[Math.floor(Math.max(0, elapsed) * definition.fps / 1000) % definition.frames.length];
    };
    const framePath = (action, frame, pet = defaultPet) => `${pet.assetRoot}/${pet.actions[action].source}/frame-${String(frame).padStart(2, '0')}.png`;

    // The anchor is the cat's resting foot position in each original canvas.
    // Keeping a common pixel scale preserves the jump/roll already in the frames.
    function placement(action, size, position, width, height, pet = defaultPet) {
        const { view: [vx, vy, vw, vh], anchor: [ax, ay] } = own(pet.actions, action) ? pet.actions[action] : pet.actions.idle;
        const scale = Math.max(0.01, Math.min(validSize(size) / 300, width / vw, height / vh));
        const px = Number.isFinite(position?.x) ? position.x : 0.84;
        const py = Number.isFinite(position?.y) ? position.y : 0.96;
        const left = Math.max(0, Math.min(width - vw * scale, px * width - (ax - vx) * scale));
        const top = Math.max(0, Math.min(height - vh * scale, py * height - (ay - vy) * scale));
        return { left, top, width: vw * scale, height: vh * scale,
            x: (left + (ax - vx) * scale) / width,
            y: (top + (ay - vy) * scale) / height };
    }

    function createPlayer(canvas, onFrame = () => {}, getURL = path => chrome.runtime.getURL(path), pet = defaultPet) {
        const ACTIONS = pet.actions;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        let current = 'idle', generation = 0, timer = null, destroyed = false;
        let paused = false, ready = false, started = 0, elapsed = 0, lastFrame = null;
        let cacheSource = null;
        const cache = new Map();
        const masks = new Map();

        function load(path) {
            if (!cache.has(path)) {
                const promise = new Promise((resolve, reject) => {
                    const image = new Image();
                    const url = getURL(path);
                    // Electron loads bundled file images from the local origin;
                    // requesting CORS there makes Chromium reject the file URL.
                    if (!url.startsWith('file:')) image.crossOrigin = 'anonymous';
                    image.onload = () => resolve(image);
                    image.onerror = () => { cache.delete(path); reject(new Error(`无法加载动作素材：${path}`)); };
                    image.src = url;
                });
                cache.set(path, promise);
            }
            return cache.get(path);
        }

        // The art is pointer-transparent. Only this polygon on a separate button
        // receives input, so the original frames' large empty margins pass clicks.
        function hitMask(action, key) {
            if (masks.has(key)) return masks.get(key);
            const { view: [vx, vy, vw, vh], hit: [x1, y1, x2, y2] } = ACTIONS[action];
            let mask;
            try {
                const pixels = context.getImageData(0, 0, vw, vh).data;
                const left = [], right = [];
                for (let y = Math.max(0, y1 - vy); y < Math.min(vh, y2 - vy); y += 8) {
                    let lo = vw, hi = 0, count = 0;
                    for (let x = Math.max(0, x1 - vx); x < Math.min(vw, x2 - vx); x += 3) {
                        if (pixels[(y * vw + x) * 4 + 3] > 70) {
                            lo = Math.min(lo, x); hi = Math.max(hi, x + 3); count++;
                        }
                    }
                    if (count >= 3) {
                        left.push(`${Math.max(0, lo - 3) / vw * 100}% ${y / vh * 100}%`);
                        right.push(`${Math.min(vw, hi + 3) / vw * 100}% ${Math.min(vh, y + 8) / vh * 100}%`);
                    }
                }
                mask = left.length ? `polygon(${left.concat(right.reverse()).join(',')})` : 'inset(45% 30% 5% 30%)';
            } catch (_) {
                // A browser that disallows pixel reads still gets a small hit area.
                mask = `inset(${Math.max(0, y1 - vy) / vh * 100}% ${Math.max(0, vx + vw - x2) / vw * 100}% ${Math.max(0, vy + vh - y2) / vh * 100}% ${Math.max(0, x1 - vx) / vw * 100}%)`;
            }
            masks.set(key, mask);
            return mask;
        }

        let images = new Map();
        function draw(frame) {
            const image = images.get(frame);
            if (!image) return;
            const [x, y, width, height] = ACTIONS[current].view;
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width; canvas.height = height;
            }
            context.clearRect(0, 0, width, height);
            context.drawImage(image, x, y, width, height, 0, 0, width, height);
            canvas.dataset.action = current;
            canvas.dataset.frame = String(frame);
            onFrame(current, hitMask(current, `${current}:${frame}`));
            lastFrame = frame;
        }

        function stopTimer() { clearTimeout(timer); timer = null; }
        function tick() {
            if (destroyed || paused || !ready) return;
            const frame = frameAt(current, elapsed + performance.now() - started, pet);
            if (frame !== lastFrame) draw(frame);
            timer = setTimeout(tick, 1000 / ACTIONS[current].fps);
        }

        return {
            async setAction(action) {
                action = own(ACTIONS, action) ? action : 'idle';
                const token = ++generation;
                stopTimer(); ready = false;
                if (cacheSource !== ACTIONS[action].source) {
                    cache.clear(); masks.clear(); cacheSource = ACTIONS[action].source;
                }
                const frames = [...new Set(ACTIONS[action].frames)];
                const loaded = await Promise.all(frames.map(frame => load(framePath(action, frame, pet))));
                if (destroyed || token !== generation) return false;
                images = new Map(frames.map((frame, i) => [frame, loaded[i]]));
                current = action; elapsed = 0; started = performance.now(); ready = true;
                lastFrame = null; draw(ACTIONS[current].frames[0]); tick();
                return true;
            },
            setPaused(value) {
                value = Boolean(value);
                canvas.dataset.paused = String(value);
                if (paused === value) return;
                if (value && ready) elapsed += performance.now() - started;
                paused = value; stopTimer();
                if (!paused) { started = performance.now(); tick(); }
            },
            destroy() {
                destroyed = true; generation++; stopTimer(); cache.clear(); images.clear(); masks.clear();
            }
        };
    }

    function mount(initial = {}, callbacks = {}) {
        const pet = catalog.get(callbacks.petId);
        const ACTIONS = pet.actions;
        const host = document.createElement('div');
        host.id = 'my-pet-observer';
        host.dataset.petId = pet.id;
        host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
        const shadow = host.attachShadow({ mode: 'open' });
        const stylesheet = new CSSStyleSheet();
        stylesheet.replaceSync(`
                :host { color-scheme: light; }
                * { box-sizing: border-box; }
                .scene { position:absolute; pointer-events:none; }
                canvas { display:block; width:100%; height:100%; pointer-events:none; }
                .hit { position:absolute; inset:0; width:100%; height:100%; padding:0; border:0; background:transparent; cursor:grab; pointer-events:auto; touch-action:none; }
                .hit:active { cursor:grabbing; }
                .hint { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); font:12px/1.5 system-ui,sans-serif; white-space:nowrap; background:#30333c; color:white; padding:7px 11px; border-radius:12px; }
                .menu { position:fixed; width:170px; padding:10px; background:#fffaf1; color:#30333c; border:1px solid #eadfc9; border-radius:14px; box-shadow:0 8px 30px #0002; pointer-events:auto; font:13px/1.5 system-ui,sans-serif; }
                .menu label { display:block; margin-bottom:7px; font-weight:600; }
                select, .menu button { width:100%; font:inherit; padding:7px; border:1px solid #e3d6bd; border-radius:8px; background:white; color:inherit; margin:0 0 6px; cursor:pointer; }
                .menu button:last-child { margin:0; }
                [hidden] { display:none!important; }
            `);
        shadow.adoptedStyleSheets = [stylesheet];
        shadow.innerHTML = `
            <div class="scene"><canvas aria-hidden="true"></canvas>
                <button class="hit" type="button" aria-label="桌宠。单击蹦跶，拖动调整位置，右键或按 M 打开动作菜单，方向键移动。"></button>
                <div class="hint" role="status" hidden></div>
            </div>
            <div class="menu" role="group" aria-label="桌宠动作" hidden>
                <label for="pet-action">今天想做什么？</label>
                <select id="pet-action" aria-label="选择动作"><option value="auto">自动活动</option>
                    ${Object.entries(ACTIONS).map(([id, action]) => `<option value="${id}">${action.name}</option>`).join('')}
                </select>
                <button type="button" data-command="pause">暂停动画</button>
                <button type="button" data-command="hide">隐藏桌宠</button>
                <button type="button" data-command="close">收起菜单</button>
            </div>`;
        document.documentElement.appendChild(host);
        const scene = shadow.querySelector('.scene'), canvas = shadow.querySelector('canvas');
        const hit = shadow.querySelector('.hit'), menu = shadow.querySelector('.menu');
        const select = shadow.querySelector('select'), hint = shadow.querySelector('.hint');
        const abort = new AbortController();
        const listen = (element, type, handler, extra = {}) => element.addEventListener(type, handler, { signal: abort.signal, ...extra });
        let options = {}, active = 'idle', position = null, drag = null, lastDragged = false;
        let destroyed = false, autoTimer = null, hintTimer = null, interactionTimer = null, actionToken = 0;
        const player = createPlayer(canvas, (action, mask) => {
            active = action; hit.style.clipPath = mask; layout();
        }, callbacks.getURL, pet);

        function layout() {
            const rect = placement(active, options.size, position, innerWidth, innerHeight, pet);
            Object.assign(scene.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
            callbacks.onHitAreaChange?.();
            return rect;
        }
        function message(text) {
            hint.textContent = text; hint.hidden = false;
            clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.hidden = true; }, 2400);
        }
        const suspended = () => options.paused || document.hidden || Boolean(drag) || !menu.hidden;
        function scheduleAuto(delay) {
            clearTimeout(autoTimer);
            if (destroyed || options.action !== 'auto' || suspended()) return;
            autoTimer = setTimeout(() => {
                const choices = Object.keys(ACTIONS).filter(action => action !== 'idle');
                const next = active === 'idle' ? choices[Math.floor(Math.random() * choices.length)] : 'idle';
                play(next);
            }, delay ?? (active === 'idle' ? 5000 + Math.random() * 5000 : Math.max(2400, ACTIONS[active].frames.length / ACTIONS[active].fps * 2000)));
        }
        async function play(action) {
            const token = ++actionToken;
            clearTimeout(autoTimer);
            try {
                const applied = await player.setAction(action);
                if (applied && !destroyed && token === actionToken) {
                    player.setPaused(suspended()); scheduleAuto(); return true;
                }
            } catch (error) {
                if (!destroyed && token === actionToken) message(error.message);
            }
            return false;
        }
        async function interact() {
            clearTimeout(interactionTimer);
            const applied = await play('bounce');
            if (!applied || destroyed || options.action === 'auto') return;
            interactionTimer = setTimeout(() => { if (!destroyed) play(options.action); }, 2000);
        }
        function syncPause() {
            player.setPaused(suspended());
            menu.querySelector('[data-command="pause"]').textContent = options.paused ? '继续动画' : '暂停动画';
            scheduleAuto();
            callbacks.onHitAreaChange?.();
        }
        function closeMenu() { menu.hidden = true; syncPause(); }
        function openMenu(x, y) {
            menu.hidden = false;
            menu.style.left = `${Math.max(8, Math.min(innerWidth - 178, x))}px`;
            menu.style.top = `${Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, y))}px`;
            select.value = options.action; syncPause(); select.focus();
        }
        function savePosition() { callbacks.onPosition?.(position); }
        function finishDrag(event, cancelled = false) {
            if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
            const completed = drag, didMove = drag.moved;
            drag = null;
            if (hit.hasPointerCapture(completed.id)) hit.releasePointerCapture(completed.id);
            lastDragged = didMove; layout(); syncPause();
            if (didMove) savePosition();
            else if (!cancelled) { message('被你发现啦！'); interact(); }
        }

        listen(hit, 'pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.stopPropagation(); closeMenu();
            const current = layout();
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, original: { x: current.x, y: current.y }, moved: false };
            hit.setPointerCapture(event.pointerId); syncPause();
        });
        listen(hit, 'pointermove', event => {
            if (!drag || drag.id !== event.pointerId) return;
            event.stopPropagation();
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (Math.hypot(dx, dy) > 4) drag.moved = true;
            if (!drag.moved) return;
            const next = placement(active, options.size, { x: drag.original.x + dx / innerWidth, y: drag.original.y + dy / innerHeight }, innerWidth, innerHeight, pet);
            position = { x: next.x, y: next.y }; layout();
        });
        listen(hit, 'pointerup', event => { event.stopPropagation(); finishDrag(event); });
        listen(hit, 'pointercancel', event => finishDrag(event, true));
        listen(hit, 'lostpointercapture', event => { if (drag) finishDrag(event, true); });
        listen(hit, 'click', event => {
            event.stopPropagation();
            if (event.detail === 0 && !lastDragged) interact();
            lastDragged = false;
        });
        listen(hit, 'contextmenu', event => { event.preventDefault(); event.stopPropagation(); openMenu(event.clientX, event.clientY); });
        listen(hit, 'keydown', event => {
            if (event.key.toLowerCase() === 'm') {
                event.preventDefault(); event.stopPropagation(); const rect = hit.getBoundingClientRect(); openMenu(rect.left, rect.top); return;
            }
            const moves = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
            if (moves[event.key]) {
                event.preventDefault(); event.stopPropagation(); const [dx, dy] = moves[event.key];
                const current = layout();
                position = { x: current.x + dx / innerWidth, y: current.y + dy / innerHeight };
                const moved = layout(); position = { x: moved.x, y: moved.y }; savePosition();
            }
        });
        listen(menu, 'pointerdown', event => event.stopPropagation());
        listen(menu, 'change', () => {
            options.action = select.value; callbacks.onSettings?.({ 'my-pet-action': options.action });
            clearTimeout(interactionTimer);
            closeMenu(); play(options.action === 'auto' ? 'idle' : options.action);
        });
        listen(menu, 'click', event => {
            event.stopPropagation();
            const command = event.target.dataset.command;
            if (command === 'pause') {
                options.paused = !options.paused; callbacks.onSettings?.({ 'my-pet-paused': options.paused }); syncPause();
            } else if (command === 'hide') callbacks.onSettings?.({ 'my-pet-enabled': false });
            else if (command === 'close') { closeMenu(); hit.focus(); }
        });
        listen(document, 'pointerdown', event => { if (!event.composedPath().includes(host) && !menu.hidden) closeMenu(); }, { capture: true });
        listen(shadow, 'keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); closeMenu(); hit.focus(); } });
        listen(window, 'resize', layout);
        listen(window, 'blur', () => { if (drag) finishDrag({ pointerId: drag.id }, true); });
        listen(document, 'visibilitychange', syncPause);

        function update(next) {
            const previous = options;
            options = { action: isAction(next.action, pet) ? next.action : DEFAULTS.action,
                size: validSize(next.size), paused: Boolean(next.paused) };
            if (own(next, 'position') && (Boolean(next.position) !== Boolean(previous.position) || next.position?.x !== previous.position?.x || next.position?.y !== previous.position?.y)) {
                position = next.position; options.position = next.position;
            } else options.position = previous.position;
            layout(); syncPause();
            if (previous.action !== options.action) {
                clearTimeout(interactionTimer); play(options.action === 'auto' ? 'idle' : options.action);
            }
        }
        update(initial);
        return {
            update,
            // Native transparent windows must also pass clicks through the OS.
            // DOM hit testing respects the animated silhouette's clip-path.
            isInteractiveAt(x, y) {
                return !destroyed && (Boolean(drag) || !menu.hidden || document.elementFromPoint(x, y) === host);
            },
            destroy() {
                destroyed = true; actionToken++; abort.abort(); clearTimeout(autoTimer); clearTimeout(hintTimer); clearTimeout(interactionTimer);
                player.destroy(); host.remove();
            }
        };
    }

    const api = { ACTIONS, DEFAULTS, frameAt, framePath, pingPong, placement, isAction, validSize, createPlayer, mount };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PetBuddyObserver = api;
})(globalThis);

