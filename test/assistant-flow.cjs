const assert = require('node:assert/strict');
const path = require('node:path');
const { forwardHook } = require('../desktop/src/codex/hook-client');

// Shared browser/native UI exercise. Codex is a real stdio fixture process.
async function assistantFlow(page, { artifacts, infoPath, cwd, compact = false, show = async () => {}, hookProcess }) {
  await page.locator('#empty-connect').click();
  await page.waitForFunction(() => document.querySelector('#empty-connect').textContent.includes('选择项目'));
  await page.locator('#empty-connect').click();
  await page.waitForFunction(() => !document.querySelector('#message').disabled);
  const threadId = (await page.evaluate(() => petBuddy.assistant.getState())).selectedId;
  const send = async text => {
    await page.locator('#message').fill(text); await page.locator('#send').click();
  };
  const completed = () => page.waitForFunction(() => document.querySelector('#phase').textContent === '本轮已完成');
  await send('检查一下小黑的交互');
  await page.locator('#approval').waitFor({ state: 'visible' });
  assert.match(await page.locator('#approval pre').textContent(), /npm run test:desktop/);
  await page.screenshot({ path: path.join(artifacts, 'assistant-approval.png') });
  await page.getByRole('button', { name: '允许此次', exact: true }).click(); await completed();
  assert.match(await page.locator('#messages').textContent(), /已经完成检查/);
  await page.screenshot({ path: path.join(artifacts, 'assistant-completed.png') });
  await send('再检查一次'); await page.locator('#approval').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '拒绝', exact: true }).click(); await completed();
  assert.match(await page.locator('#messages').textContent(), /原命令没有执行/);
  await send('input'); await page.locator('#answer-choice').selectOption('气泡');
  await page.getByRole('button', { name: '发送回答', exact: true }).click(); await completed();
  await page.locator('[data-mode="chat"]').click();
  assert.equal(await page.locator('#message').isDisabled(), true); assert.equal(await page.locator('#send').isDisabled(), true);
  assert.match(await page.locator('#empty-description').textContent(), /MiniMax/);
  await page.screenshot({ path: path.join(artifacts, 'assistant-chat-placeholder.png') });
  await page.locator('[data-mode="codex"]').click();
  await page.locator('#message').fill('保留在小黑会话里的草稿');
  await page.locator('#sessions').selectOption('history');
  await page.waitForFunction(() => !document.querySelector('#message').disabled);
  await page.locator('#message').fill('另一份草稿');
  await page.locator('#sessions').selectOption(threadId);
  await page.waitForFunction(() => document.querySelector('#message').value === '保留在小黑会话里的草稿');
  await page.locator('#preferences-toggle').click();
  const event = { hook_event_name: 'PermissionRequest', session_id: 'hook-ui', turn_id: 'hook-turn', cwd,
    tool_name: 'Bash', tool_input: { command: 'echo terminal-check', description: '<img src=x onerror=alert(1)>' } };
  // Native mode also starts the installed executable's hook-client entry point.
  const response = hookProcess ? hookProcess(event) : forwardHook({ infoPath, input: event });
  response.catch(() => {}); // Keep teardown errors handled while UI assertions run.
  await page.locator('#approval').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#preferences').isVisible(), false);
  assert.equal(await page.locator('#approval img').count(), 0);
  assert.equal(await page.locator('#message').inputValue(), '', 'incoming task cannot inherit another session draft');
  await page.getByRole('button', { name: '允许此次', exact: true }).click();
  assert.equal((await response).hookSpecificOutput.decision.behavior, 'allow');
  await forwardHook({ infoPath, input: { ...event, hook_event_name: 'Stop', last_assistant_message: '终端任务已完成' } });
  await completed();
  await page.locator('#sessions').selectOption(threadId);
  await page.waitForFunction(() => document.querySelector('#message').value === '保留在小黑会话里的草稿');
  await send('running');
  await page.waitForFunction(() => document.querySelector('#phase').textContent === '正在思考');
  await page.locator('#hide').click();
  const snapshot = await page.evaluate(() => petBuddy.assistant.getState());
  assert.equal(snapshot.sessions.find(session => session.id === threadId).status, 'running', 'hiding does not stop a task');
  await show(); await page.locator('#interrupt').click();
  await page.waitForFunction(() => document.querySelector('#phase').textContent === '本轮已停止');
  if (compact) {
    await page.setViewportSize({ width: 320, height: 420 });
    const composer = await page.locator('#composer').boundingBox(); assert.ok(composer && composer.y + composer.height < 420);
    await page.screenshot({ path: path.join(artifacts, 'assistant-compact.png') });
  }
  await page.locator('#preferences-toggle').click();
  assert.equal(await page.locator('#composer').isVisible(), false);
  await page.locator('#install-hooks').click();
  await page.waitForFunction(() => !document.querySelector('#uninstall-hooks').hidden);
  await page.screenshot({ path: path.join(artifacts, 'assistant-settings.png') });
  await page.locator('#uninstall-hooks').click();
  await page.waitForFunction(() => document.querySelector('#uninstall-hooks').hidden);
  assert.equal(await page.locator('#notice').isVisible(), false, 'no swallowed IPC or protocol errors');
}
module.exports = { assistantFlow };
