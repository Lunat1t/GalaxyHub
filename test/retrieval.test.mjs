import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Retrieval, chunkDocument, fuse, bm25 } from '../src/retrieval.mjs';
import { demoProvider, remoteProvider } from '../src/providers.mjs';
import { apiServer, loadPrincipals } from '../src/server.mjs';
import { GalaxyKnowledgeClient } from '../sdk/galaxy-code.mjs';

const alice = { token: 'test-alice-secret-24-characters', tenant: 'hub', rooms: ['project'], role: 'writer' };
const bob = { tenant: 'other', rooms: ['project'], role: 'writer' };
const reader = { ...alice, role: 'reader' };
const doc = { room: 'project', id: 'design', title: 'GalaxyCode integration', source: 'repo/design.md',
  text: '# Search\nThe editor returns original passages and citations.\n  function query() {\n    return search();\n  }', version: 'abc123' };
function engine(t, provider = demoProvider(), options = {}) {
  const e = new Retrieval({ provider, ...options }); t.after(() => e.close()); return e;
}

test('chunking retains code whitespace, source offsets, lines and overlap without redundant tail', () => {
  const text = 'one two\n  three four\n    five six';
  const chunks = chunkDocument(text, 4, 2);
  assert.equal(chunks.length, 2);
  for (const c of chunks) assert.equal(c.original, text.slice(c.start, c.end));
  assert.equal(chunks[0].original, 'one two\n  three four');
  assert.equal(chunks[1].lineStart, 2);
  assert.equal(chunks[1].lineEnd, 3);
  assert.equal(chunkDocument('  return true;\n')[0].original, '  return true;\n');
  assert.throws(() => chunkDocument(text, 4, 4), /overlap/);
});

test('context is indexed but generation passages contain exact originals with citations', async t => {
  const e = engine(t);
  await e.index(alice, doc);
  const result = await e.search(reader, { room: 'project', query: 'GalaxyCode' });
  assert.equal(result.results[0].documentId, 'design');
  assert.match(result.results[0].context, /GalaxyCode/);
  assert.equal(result.context.passages[0].text, doc.text);
  assert.equal(result.context.passages[0].citation, '[1]');
  assert.equal(result.context.passages[0].version, 'abc123');
  assert.equal(result.results[0].embedding, undefined);
  assert.equal(result.diagnostics.mode, 'demo');
});

test('tenant and room isolation is enforced before embedding, BM25 and reranking', async t => {
  let calls = 0;
  const provider = demoProvider();
  const embed = provider.embed;
  provider.embed = async text => { calls++; return embed(text); };
  provider.rerank = async (query, texts) => { assert.ok(texts.every(text => !text.includes('PRIVATE'))); return texts.map(() => 1); };
  const e = engine(t, provider);
  await e.index(bob, { ...doc, text: 'PRIVATE secret GalaxyCode' });
  const before = calls;
  assert.equal((await e.search(alice, { room: 'project', query: 'PRIVATE' })).results.length, 0);
  assert.equal(calls, before);
  await assert.rejects(e.search({ ...alice, rooms: [] }, { room: 'project', query: 'secret' }), { status: 403 });
  await assert.rejects(e.index(reader, doc), { status: 403 });
  assert.throws(() => e.list(alice, 'private'), { status: 403 });
  await assert.rejects(e.remove(reader, 'project', 'design'), { status: 403 });
});

test('identical updates are skipped; metadata edits invalidate all contextual chunks', async t => {
  let calls = 0;
  const provider = demoProvider();
  const context = provider.context;
  provider.context = async (...args) => { calls++; return context(...args); };
  const e = engine(t, provider, { chunkSize: 5, overlap: 1 });
  const first = await e.index(alice, doc);
  assert.ok(first.chunks > 1);
  assert.equal((await e.index(alice, doc)).unchanged, true);
  assert.equal(calls, first.chunks);
  await e.index(alice, { ...doc, title: 'Renamed project' });
  assert.equal(calls, first.chunks * 2);
  const results = await e.search(alice, { room: 'project', query: 'Renamed' });
  assert.ok(results.results.every(r => r.context.includes('Renamed')));
});

test('failed indexing leaves the old document intact and serial queue recovers', async t => {
  const provider = demoProvider();
  const e = engine(t, provider, { chunkSize: 5, overlap: 1 });
  const first = await e.index(alice, doc);
  const context = provider.context;
  let count = 0;
  provider.context = async (...args) => { if (++count === 2) throw new Error('outage'); return context(...args); };
  await assert.rejects(e.index(alice, { ...doc, text: doc.text + ' More contents.' }), /outage/);
  assert.equal(e.list(alice, 'project')[0].revision, first.revision);
  provider.context = context;
  await e.index(alice, { ...doc, text: 'new short contents' });
  assert.equal(e.list(alice, 'project')[0].chunks, 1);
});

test('concurrent updates commit in order and deletion removes all chunks', async t => {
  const e = engine(t);
  await Promise.all([e.index(alice, doc), e.index(alice, { ...doc, text: 'latest unique state' })]);
  assert.equal((await e.search(alice, { room: 'project', query: 'latest' })).results[0].original, 'latest unique state');
  assert.equal((await e.remove(alice, 'project', 'design')).deleted, true);
  assert.equal((await e.search(alice, { room: 'project', query: 'latest' })).results.length, 0);
  assert.equal((await e.remove(alice, 'project', 'design')).deleted, false);
});

test('SQLite persists across restart and rejects incompatible embedding profiles', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'galaxy-test-'));
  const path = join(directory, 'index.sqlite');
  try {
    const first = new Retrieval({ path, provider: demoProvider() });
    await first.index(alice, doc); first.close();
    const second = new Retrieval({ path, provider: demoProvider() });
    assert.equal(second.list(alice, 'project').length, 1); second.close();
    assert.throws(() => new Retrieval({ path, provider: { ...demoProvider(), id: 'different-model' } }), /configuration changed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('hybrid fusion deduplicates and BM25 matches technical IDs and Russian words', () => {
  const a = { id: 'a', enriched: 'GalaxyCode ошибка TS-999 приватные комнаты' };
  const b = { id: 'b', enriched: 'Other document' };
  assert.equal(bm25('TS-999 комнаты', [a, b])[0].chunk.id, 'a');
  const result = fuse([[{ chunk: a }, { chunk: b }], [{ chunk: a }]]);
  assert.equal(result.length, 2); assert.equal(result[0].chunk.id, 'a');
});

test('reranking receives enriched chunks and controls final ranking', async t => {
  const provider = demoProvider();
  provider.rerank = async (query, texts) => texts.map(text => text.includes('second') ? 10 : 0);
  const e = engine(t, provider);
  await e.index(alice, { ...doc, text: 'shared first' });
  await e.index(alice, { ...doc, id: 'second', text: 'shared second' });
  const result = await e.search(alice, { room: 'project', query: 'shared' });
  assert.equal(result.results[0].documentId, 'second');
  assert.equal(result.diagnostics.reranked, true);
});

test('invalid inputs, embedding dimensions and contextual budgets are handled', async t => {
  const provider = demoProvider();
  const e = engine(t, provider);
  await assert.rejects(e.index(alice, { ...doc, text: ' ' }), { status: 400 });
  await e.index(alice, doc);
  await assert.rejects(e.search(alice, { room: 'project', query: 'x', topK: 0 }), { status: 400 });
  await assert.rejects(e.search(alice, { room: 'project', query: 'x', strategy: 'unknown' }), { status: 400 });
  const result = await e.search(alice, { room: 'project', query: 'GalaxyCode', maxContextChars: 100 });
  assert.equal(result.context.passages.length, 0);
  provider.embed = async () => [1, 2];
  await assert.rejects(e.search(alice, { room: 'project', query: 'x' }), /dimensions/);
});

test('HTTP API authenticates server-side identity and SDK handles code documents', async t => {
  const e = engine(t);
  const server = apiServer(e, [alice, { ...reader, token: 'test-reader-secret-24-characters' }]);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const client = new GalaxyKnowledgeClient({ baseUrl, token: alice.token });
  const home = await fetch(baseUrl + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /npm run ask/);
  assert.equal((await fetch(`${baseUrl}/v1/documents?room=project`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  await client.indexCode({ room: 'project', repository: 'GalaxyCode', path: 'src/search.ts', revision: 'abc', text: 'export function retrieve() { return citations; }' });
  const result = await client.getContext({ room: 'project', query: 'retrieve' });
  assert.equal(result.passages[0].source, 'GalaxyCode@abc:src/search.ts');
  const malicious = await fetch(`${baseUrl}/v1/search`, { method: 'POST', headers: {
    authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'other', rooms: ['private'], room: 'private', query: 'secret' }) });
  assert.equal(malicious.status, 403);
  const malformed = await fetch(`${baseUrl}/v1/search`, { method: 'POST', headers: {
    authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await client.listDocuments('project')).documents.length, 1);
  await client.deleteDocument('project', 'GalaxyCode:src/search.ts');
  assert.equal((await client.listDocuments('project')).documents.length, 0);
});

test('token config fails closed and remote providers require explicit settings', () => {
  assert.throws(() => loadPrincipals(), /requires/);
  assert.throws(() => loadPrincipals('[]'), /requires/);
  assert.throws(() => loadPrincipals(JSON.stringify([{ ...alice, token: 'short' }])), /requires/);
  assert.equal(loadPrincipals(JSON.stringify([alice])).length, 1);
  assert.throws(() => remoteProvider({}), /ANTHROPIC_API_KEY/);
});

test('remote adapters send full-document cache prefixes and reject broken rerank output', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  let malformed = false;
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body); requests.push({ url, payload });
    if (url.includes('/messages')) return Response.json({ content: [{ type: 'text', text: 'Context from full document' }] });
    if (url.includes('/embeddings')) return Response.json({ data: [{ embedding: [0.5, 1] }] });
    return Response.json({ results: malformed ? [{ index: 0, relevance_score: 1 }, { index: 0, relevance_score: 2 }] :
      [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 }] });
  };
  const provider = remoteProvider({ ANTHROPIC_API_KEY: 'fixture', CONTEXT_MODEL: 'test-context',
    EMBEDDING_API_KEY: 'fixture', EMBEDDING_MODEL: 'test-embedding', EMBEDDING_URL: 'https://example.org/embeddings',
    RERANK_API_KEY: 'fixture', RERANK_MODEL: 'test-rerank' });
  assert.equal(await provider.context(doc, { original: 'passage', lineStart: 2 }), 'Context from full document');
  const prefix = requests[0].payload.messages[0].content[0];
  assert.equal(JSON.parse(prefix.text).document, doc.text);
  assert.equal(prefix.cache_control.type, 'ephemeral');
  assert.equal(requests[0].payload.model, 'test-context');
  assert.deepEqual(await provider.embed('enriched text'), [0.5, 1]);
  assert.equal(requests[1].payload.input, 'enriched text');
  assert.deepEqual(await provider.rerank('question', ['first', 'second']), [0.2, 0.9]);
  malformed = true;
  await assert.rejects(provider.rerank('question', ['first', 'second']), /indices/);
});
