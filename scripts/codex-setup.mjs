import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const settings = [
  'GALAXY_MODE=codex', 'HOST=127.0.0.1', 'PORT=8787', 'GALAXY_DB=./data/codex-retrieval.sqlite',
  `GALAXY_TOKENS='${JSON.stringify([{ token: randomBytes(32).toString('hex'), tenant: 'galaxyhub', rooms: ['cafe', 'project-demo'], role: 'writer' }])}'`,
  'CODEX_BINARY=codex', 'CODEX_MODEL=gpt-6-astra', 'CODEX_TIMEOUT_MS=120000', 'CHUNK_SIZE=400', 'CHUNK_OVERLAP=80', ''
].join('\n');
try {
  await writeFile(new URL('../.env', import.meta.url), settings, { flag: 'wx', mode: 0o600 });
  console.log('Local Codex configuration created in .env. Service secret generated and kept private. Run npm start.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; existing settings preserved. Use .env.codex.example to configure Codex mode.');
}
