import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Retrieval } from '../src/retrieval.mjs';
import { codexProvider } from '../src/codex.mjs';
import { apiServer } from '../src/server.mjs';
import { GalaxyKnowledgeClient } from '../sdk/galaxy-code.mjs';

const provider = codexProvider();
let engine, server;
try {
  console.log('Checking Codex browser login…');
  console.log(await provider.status());
  const persist = process.argv.includes('--persist');
  engine = new Retrieval({ provider, ...(persist ? {
    path: process.env.GALAXY_DB ?? './data/codex-retrieval.sqlite',
    chunkSize: Number(process.env.CHUNK_SIZE ?? 400), overlap: Number(process.env.CHUNK_OVERLAP ?? 80)
  } : { chunkSize: 2000, overlap: 0 }) });
  const principal = { token: 'codex-local-check-secret-24-characters', tenant: 'galaxyhub', rooms: ['cafe'], role: 'writer' };
  server = apiServer(engine, [principal]);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const client = new GalaxyKnowledgeClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, token: principal.token });
  console.log('Indexing GalaxyHub document with real Codex…');
  const indexed = await client.indexDocument({ room: 'cafe', id: 'concept', title: 'GalaxyHub — концепция',
    source: 'Galaxy-Hub.md', version: '2026-10-09', kind: 'product-plan',
    text: await readFile(new URL('../Galaxy-Hub.md', import.meta.url), 'utf8') });
  console.log('Searching and generating a cited answer…');
  const result = await client.answer({ room: 'cafe', query: 'Как включается голосовой чат в Café?', topK: 1 });
  if (!result.citationIds.length || !result.answer.includes('[1]')) throw new Error('Smoke check failed: answer has no citations');
  const report = { testedAt: new Date().toISOString(), authMode: 'chatgpt', persistentIndex: persist,
    model: (await provider.status()).model, indexed,
    query: 'Как включается голосовой чат в Café?', answer: result.answer,
    citationIds: result.citationIds, sources: result.context.passages.map(({ text, ...source }) => source), diagnostics: result.diagnostics };
  await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await writeFile(new URL('../reports/codex-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  provider.close(); engine?.close();
}
