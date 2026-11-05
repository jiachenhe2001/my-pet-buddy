(async () => {
  'use strict';
  const api = window.petBuddy.assistant, $ = id => document.getElementById(id);
  let state, mode = 'codex', busy = false, displayedId = null, lastRequest = null, lastMessages = '';
  const drafts = new Map(), key = () => mode === 'chat' ? 'chat' : `codex:${displayedId || ''}`;
  const current = () => state?.sessions.find(session => session.id === state.selectedId);
  const text = (tag, value, className) => {
    const node = document.createElement(tag); node.textContent = value || ''; if (className) node.className = className; return node;
  };
  function notice(value = '') { $('notice').textContent = value; $('notice').hidden = !value; }
  async function run(action) {
    try { notice(); return await action(); } catch (error) { notice(error.message || '操作未完成，请重试。'); return null; }
  }
  function preferences(open) {
    $('preferences').hidden = !open; document.body.classList.toggle('preferences-open', open);
    $('preferences-toggle').setAttribute('aria-expanded', String(open));
  }
  function switchMode(next, redraw = true) {
    if (mode !== next) {
      drafts.set(key(), $('message').value); mode = next; $('message').value = drafts.get(key()) || '';
    }
    preferences(false); if (redraw) render();
  }
  function scrollDown() { const box = $('conversation'); box.scrollTop = box.scrollHeight; }
  function renderRequest(request) {
    const box = $('approval'); box.hidden = !request;
    if (!request) { box.replaceChildren(); delete box.dataset.id; return; }
    if (box.dataset.id === request.id) return;
    box.dataset.id = request.id;
    box.replaceChildren(text('div', request.kind === 'input' ? '✧  有个问题想问你' : '◈  等待你的确认', 'approval-label'), text('h2', request.title), text('p', request.reason || '请确认下面这次操作。'));
    if (request.context) box.append(text('p', request.context));
    if (request.detail && request.kind !== 'input') box.append(text('pre', request.detail));
    const controls = Object.create(null);
    for (const question of request.questions || []) {
      const row = text('div', '', 'question'), label = text('label', question.question);
      const input = document.createElement(question.options?.length ? 'select' : 'input');
      input.id = `answer-${question.id}`; label.htmlFor = input.id; input.required = true;
      if (question.isSecret && input.tagName === 'INPUT') input.type = 'password';
      if (question.options?.length) {
        input.append(new Option('请选择…', ''));
        for (const option of question.options) input.append(new Option(`${option.label}${option.description ? ' · ' + option.description : ''}`, option.label));
      }
      controls[question.id] = input; row.append(label, input); box.append(row);
    }
    const actions = text('div', '', 'approval-actions');
    for (const [decision, title] of [['decline', request.kind === 'input' ? '暂不回答' : '拒绝'], ['accept', request.kind === 'input' ? '发送回答' : '允许此次']]) {
      const button = text('button', title, decision === 'accept' ? 'primary' : 'secondary'); button.type = 'button';
      button.disabled = decision === 'accept' && request.canAccept === false;
      button.addEventListener('click', () => run(async () => {
        const answers = Object.create(null);
        if (decision === 'accept') for (const [id, input] of Object.entries(controls)) {
          if (!input.value.trim()) { input.reportValidity(); return; }
          answers[id] = { answers: [input.value.trim()] };
        }
        actions.querySelectorAll('button').forEach(node => { node.disabled = true; });
        try { await api.respond({ id: request.id, decision, answers }); }
        finally { actions.querySelectorAll('button').forEach(node => { node.disabled = node.dataset.decision === 'accept' && request.canAccept === false; }); }
      }));
      button.dataset.decision = decision; actions.append(button);
    }
    box.append(actions); requestAnimationFrame(scrollDown);
  }
  function render() {
    if (!state) return;
    if (displayedId !== state.selectedId) {
      drafts.set(key(), $('message').value); displayedId = state.selectedId; $('message').value = drafts.get(key()) || '';
    }
    const session = current(), request = session?.pending?.[0];
    if (request?.id && request.id !== lastRequest) { switchMode('codex', false); preferences(false); }
    lastRequest = request?.id || null;
    const isCodex = mode === 'codex', connected = state.connection.status === 'connected';
    document.body.classList.toggle('has-request', isCodex && Boolean(request));
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    $('codex-context').hidden = !isCodex; $('chat-context').hidden = isCodex;
    const optionsKey = JSON.stringify(state.sessions.map(item => [item.id, item.title, item.status]));
    if ($('sessions').dataset.key !== optionsKey) {
      $('sessions').replaceChildren(new Option('选择一个会话', ''));
      for (const item of state.sessions) $('sessions').append(new Option(`${item.title}${['waiting_approval', 'waiting_input'].includes(item.status) ? ' · 待确认' : ''}`, item.id));
      $('sessions').dataset.key = optionsKey;
    }
    $('sessions').value = state.selectedId || '';
    $('phase').textContent = session?.phase || (connected ? '已连接，选择一个项目开始' : '还没有连接 Codex');
    $('status-dot').className = `status-dot ${session?.status || ''}`;
    $('source').textContent = session ? { hook: '已接入会话', history: '历史会话', 'app-server': '小黑会话' }[session.source] || '' : '';
    $('connection-detail').textContent = state.connection.error || (connected ? '已连接 · 沿用本机 Codex 登录与配置' : '沿用 Codex 当前的登录与配置。');
    $('connect').textContent = state.connection.status === 'connecting' ? '正在连接…' : connected ? state.connection.authenticated === false ? '登录 Codex' : '刷新连接' : '连接 Codex';
    $('connect').disabled = state.connection.status === 'connecting';
    $('hooks-detail').textContent = state.hooks?.installed ? '已写入接入配置。请在 Codex /hooks 中信任新增 hooks，并重启旧会话。' : '接入后，需在 Codex 的 /hooks 中信任新增配置。';
    $('install-hooks').textContent = state.hooks?.installed ? '更新会话接入' : '接入已有会话';
    $('uninstall-hooks').hidden = !state.hooks?.installed;
    $('hooks-error').textContent = state.hooks?.error || ''; $('hooks-error').hidden = !state.hooks?.error;
    $('account-label').textContent = isCodex ? connected ? state.connection.authenticated ? '本机连接 · 沿用 Codex 登录' : '等待 ChatGPT 登录' : '本机 Codex · 未连接' : 'MiniMax · 下一步接入';
    const messages = isCodex ? session?.messages || [] : [], messageKey = JSON.stringify([mode, displayedId, messages]);
    const box = $('conversation'), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    if (messageKey !== lastMessages) {
      $('messages').replaceChildren(...messages.map(message => {
        const node = text('article', '', `message ${message.role}`);
        if (message.role === 'assistant') node.append(text('span', 'CODEX', 'message-label'));
        node.append(document.createTextNode(message.text)); return node;
      }));
      lastMessages = messageKey; if (atBottom) requestAnimationFrame(scrollDown);
    }
    $('empty').hidden = Boolean(messages.length || (isCodex && (session?.activity || request)));
    $('empty-title').textContent = isCodex ? session ? '准备好，继续这项任务' : '把任务交给 Codex' : '和小黑聊一会儿';
    $('empty-description').textContent = isCodex ? '我帮你留意进度，需要你时轻轻提醒一下。' : '这里会直连你的 MiniMax 模型，只做简单问答。当前还未接入。';
    $('empty-connect').hidden = !isCodex || Boolean(session);
    $('empty-connect').textContent = connected ? '选择项目，开始新任务 ↗' : '连接本机 Codex ↗';
    $('activity').hidden = !isCodex || !session?.activity; $('activity-detail').textContent = isCodex ? session?.activity || '' : '';
    $('plan').hidden = !session?.plan?.length;
    $('plan').replaceChildren(...(session?.plan || []).map(step => text('li', `${step.status === 'completed' ? '✓' : step.status === 'in_progress' ? '◉' : '○'} ${step.step}`)));
    renderRequest(isCodex ? request : null);
    const canSend = isCodex && connected && state.connection.authenticated && session && !['waiting_approval', 'waiting_input', 'disconnected'].includes(session.status);
    $('message').disabled = !canSend || busy; $('send').disabled = !canSend || busy || !$('message').value.trim();
    $('message').placeholder = isCodex ? '继续这项任务…' : 'MiniMax 问答将在下一步接入';
    $('interrupt').disabled = !isCodex || busy || session?.source !== 'app-server' || !['running', 'waiting_approval', 'waiting_input'].includes(session?.status);
    $('refresh').disabled = !connected; $('new-project').disabled = !connected || !state.connection.authenticated;
  }
  async function connect() {
    if (state?.connection.status === 'connected' && !state.connection.authenticated) return api.login();
    return api.connect();
  }
  $('preferences-toggle').addEventListener('click', () => preferences($('preferences').hidden));
  $('hide').addEventListener('click', () => api.hide());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') api.hide(); });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  $('connect').addEventListener('click', () => run(connect));
  $('choose-binary').addEventListener('click', () => run(() => api.chooseBinary()));
  $('install-hooks').addEventListener('click', () => run(() => api.installHooks()));
  $('uninstall-hooks').addEventListener('click', () => run(() => api.uninstallHooks()));
  $('refresh').addEventListener('click', () => run(() => api.refresh()));
  $('new-project').addEventListener('click', () => run(() => api.newProject()));
  $('empty-connect').addEventListener('click', () => run(() => state?.connection.status === 'connected' ? state.connection.authenticated ? api.newProject() : api.login() : api.connect()));
  $('sessions').addEventListener('change', () => { if ($('sessions').value) run(() => api.select($('sessions').value)); });
  $('interrupt').addEventListener('click', () => run(() => api.interrupt(state.selectedId)));
  $('message').addEventListener('input', () => { drafts.set(key(), $('message').value); render(); });
  $('message').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); }
  });
  $('composer').addEventListener('submit', event => {
    event.preventDefault(); if ($('send').disabled || mode !== 'codex') return;
    const sessionId = state.selectedId, message = $('message').value, sentKey = key(); busy = true; render();
    run(async () => {
      const result = await api.send({ sessionId, text: message }); drafts.delete(sentKey);
      if (key() === sentKey && $('message').value === message) $('message').value = '';
      return result;
    }).finally(() => { busy = false; render(); if (!$('message').disabled) $('message').focus(); });
  });
  const removeChange = api.onChange(snapshot => { state = snapshot; render(); });
  const removePlacement = api.onPlacement(placement => {
    document.body.classList.toggle('below', placement.placement === 'below');
    document.documentElement.style.setProperty('--tail-x', `${placement.tailX - 12}px`);
  });
  window.addEventListener('beforeunload', () => { removeChange(); removePlacement(); });
  await run(async () => { state = await api.getState(); render(); });
})();
