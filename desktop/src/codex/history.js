// Read persisted conversations without resuming another Codex process.
const unsupported = error => /unsupported|not supported|unknown (method|field|variant)|method not found|invalid param/i.test(error.message || '');

async function readHistory(client, threadId, { messages = false } = {}) {
  const limit = messages ? 6 : 1;
  let turns, legacy = false;
  try {
    const result = await client.request('thread/turns/list', { threadId, limit, sortDirection: 'desc', itemsView: 'notLoaded' });
    turns = result.data || [];
  } catch (error) {
    if (!unsupported(error)) throw error;
    const result = await client.request('thread/read', { threadId, includeTurns: true });
    turns = [...(result.thread?.turns || [])].slice(-limit).reverse(); legacy = true;
  }
  const items = [];
  if (messages) for (const turn of [...turns].reverse()) {
    let entries = turn.items;
    if (!legacy) {
      entries = []; let cursor, pages = 0, count = 0;
      const seen = new Set();
      try {
        do {
          const result = await client.request('thread/items/list', { threadId, turnId: turn.id, limit: 100, sortDirection: 'desc', ...(cursor ? { cursor } : {}) });
          const batch = (result.data || []).map(entry => entry.item || entry);
          entries.push(...batch);
          count += batch.filter(item => ['agentMessage', 'userMessage'].includes(item.type)).length;
          cursor = result.nextCursor; pages++;
          if (cursor && seen.has(cursor)) break;
          seen.add(cursor);
        } while (cursor && pages < 8 && count < 60);
        entries.reverse();
      } catch (error) {
        if (!unsupported(error)) throw error;
        // Older CLI releases keep full turns in thread/read instead of item pages.
        const result = await client.request('thread/read', { threadId, includeTurns: true });
        return { latest: result.thread?.turns?.at(-1), items: (result.thread?.turns || []).slice(-limit).flatMap(entry => entry.items || []) };
      }
    }
    items.push(...(entries || []));
  }
  return { latest: turns[0], items };
}
module.exports = { readHistory };
