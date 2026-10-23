import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CodexAppServer, codexProvider } from '../src/codex.mjs';
import { Retrieval } from '../src/retrieval.mjs';

const fixture = fileURLToPath(new URL('./fixtures/codex-app-server.mjs', import.meta.url));
const principal = { tenant: 'hub', rooms: ['cafe'], role: 'writer' };
const doc = { room: 'cafe', id: 'voice', title: 'Café', source: 'cafe.md', text: 'Голосовой чат включается за столиком.' };
function client(t, mode) {
  const codex = new CodexAppServer({ timeoutMs: mode === 'timeout' ? 500 : 5000,
    spawnImpl(binary, args, options) {
      assert.ok(args.includes('features.shell_tool=false'));
      assert.ok(args.includes('features.multi_agent=false'));
      return spawn(process.execPath, [fixture, mode ?? 'normal'], options);
    } });
  t.after(() => codex.close()); return codex;
}

test('Codex handshake, browser auth, model pinning, ephemeral threads and fast completion', async t => {
  const codex = client(t);
  const provider = codexProvider({}, codex);
  assert.deepEqual(await provider.status(), { authMode: 'chatgpt', model: 'fixture-model' });
  assert.match(provider.id, /fixture-model/);
  const retrieval = new Retrieval({ provider }); t.after(() => retrieval.close());
  await retrieval.index(principal, doc);
  const result = await retrieval.answer(principal, { room: 'cafe', query: 'голосовой чат' });
  assert.match(result.answer, /столиком \[1\]/);
  assert.equal(result.diagnostics.strategy, 'bm25');
  assert.equal(result.diagnostics.mode, 'codex');
  assert.equal(result.context.passages[0].text, doc.text);
  await assert.rejects(retrieval.search(principal, { room: 'cafe', query: 'чат', strategy: 'dense' }), { status: 400 });
});

for (const [mode, error] of [['signed-out', /codex login/], ['failed', /fixture outage/],
  ['invalid-json', /structured output/], ['tool', /tool operation/], ['timeout', /timed out/]]) {
  test(`Codex fails safely: ${mode}`, async t => {
    const codex = client(t, mode);
    await assert.rejects(codex.generate('{}', {}), error);
  });
}

test('answer generation cannot bypass ACL or invent source IDs; no matches need no model', async t => {
  let calls = 0;
  const provider = { id: 'fixture', mode: 'codex', defaultStrategy: 'bm25', denseSupported: false,
    embed: async () => [1], context: async () => 'Café voice',
    answer: async () => { calls++; return { answer: 'Invented [99]', citationIds: ['[99]'] }; } };
  const retrieval = new Retrieval({ provider }); t.after(() => retrieval.close());
  await retrieval.index(principal, doc);
  await assert.rejects(retrieval.answer({ ...principal, rooms: [] }, { room: 'cafe', query: 'чат' }), { status: 403 });
  assert.equal(calls, 0);
  const empty = await retrieval.answer(principal, { room: 'cafe', query: 'неизвестно' });
  assert.equal(empty.citationIds.length, 0); assert.equal(calls, 0);
  await assert.rejects(retrieval.answer(principal, { room: 'cafe', query: 'чат' }), /citation IDs/);
});
