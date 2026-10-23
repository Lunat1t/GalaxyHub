import { readFile } from 'node:fs/promises';
import { Retrieval } from '../src/retrieval.mjs';
import { demoProvider, remoteProvider } from '../src/providers.mjs';

const fixture = JSON.parse(await readFile(process.argv[2] ?? new URL('../test/fixtures/evaluation.json', import.meta.url), 'utf8'));
const principal = { tenant: 'evaluation', rooms: ['evaluation'], role: 'writer' };
const remote = process.env.GALAXY_MODE === 'remote';
const provider = remote ? remoteProvider() : demoProvider();
const reports = [];
for (const [name, contextual, strategy] of [['baseline-dense', false, 'dense'], ['contextual-hybrid', true, 'hybrid']]) {
  const engine = new Retrieval({ provider: contextual ? provider : { ...provider, rerank: undefined }, contextual, chunkSize: 30, overlap: 5 });
  try {
    for (const doc of fixture.documents) await engine.index(principal, { ...doc, room: 'evaluation' });
    let recall = 0, mrr = 0, ndcg = 0;
    for (const item of fixture.queries) {
      const { results } = await engine.search(principal, { room: 'evaluation', query: item.query, topK: 5 });
      // Document metrics deduplicate chunks from the same document.
      const ids = [...new Set(results.map(r => r.documentId))];
      const relevant = new Set(item.relevant);
      const hits = ids.filter(id => relevant.has(id)).length;
      recall += hits / relevant.size;
      const first = ids.findIndex(id => relevant.has(id));
      mrr += first < 0 ? 0 : 1 / (first + 1);
      const dcg = ids.reduce((sum, id, i) => sum + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
      const ideal = Array.from({ length: Math.min(5, relevant.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
      ndcg += dcg / ideal;
    }
    const count = fixture.queries.length;
    reports.push({ name, mode: provider.mode, questions: count, recallAt5: recall / count, mrrAt5: mrr / count, ndcgAt5: ndcg / count });
  } finally { engine.close(); }
}
console.log(JSON.stringify({ note: 'Small smoke fixture; not evidence of production quality gains. For a valid comparison use 100–200 labeled project questions. Reranking disabled for baseline.', reports }, null, 2));
