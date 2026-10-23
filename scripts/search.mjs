import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { KnowledgeReader } from '../src/knowledge-reader.mjs';

const query = process.argv.slice(2).join(' ').trim();
let reader;
try {
  if (!query) throw new Error('Usage: npm run search -- "question"');
  const entries = JSON.parse(process.env.GALAXY_TOKENS ?? '[]');
  const principal = process.env.GALAXY_MCP_TOKEN ? entries.find(p => p.token === process.env.GALAXY_MCP_TOKEN) : entries.length === 1 ? entries[0] : null;
  reader = new KnowledgeReader({ path: resolve(fileURLToPath(new URL('../', import.meta.url)), process.env.GALAXY_DB ?? './data/codex-retrieval.sqlite'), principal });
  console.log(JSON.stringify(reader.search({ room: process.env.GALAXY_ROOM ?? 'cafe', query }), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { reader?.close(); }
