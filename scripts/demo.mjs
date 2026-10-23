import { readFile } from 'node:fs/promises';
import { Retrieval } from '../src/retrieval.mjs';
import { demoProvider } from '../src/providers.mjs';
import { apiServer } from '../src/server.mjs';
import { GalaxyKnowledgeClient } from '../sdk/galaxy-code.mjs';

const principal = { token: 'local-demo-secret-not-for-deployment', tenant: 'galaxyhub', rooms: ['cafe'], role: 'writer' };
const engine = new Retrieval({ provider: demoProvider() });
const server = apiServer(engine, [principal]);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
  const client = new GalaxyKnowledgeClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, token: principal.token });
  console.log(await client.indexDocument({ room: 'cafe', id: 'galaxyhub-concept', title: 'Galaxy Hub — концепция',
    source: 'Galaxy-Hub.md', kind: 'product-plan', version: '2026-10-09',
    text: await readFile(new URL('../Galaxy-Hub.md', import.meta.url), 'utf8') }));
  console.log(JSON.stringify(await client.getContext({ room: 'cafe', query: 'Как устроены комнаты проектов Project Rooms?', topK: 2 }), null, 2));
} finally { await new Promise(resolve => server.close(resolve)); engine.close(); }
