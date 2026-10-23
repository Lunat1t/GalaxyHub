import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Retrieval, HttpError } from './retrieval.mjs';
import { demoProvider, remoteProvider } from './providers.mjs';
import { codexProvider } from './codex.mjs';

function same(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function loadPrincipals(raw) {
  let entries;
  try { entries = JSON.parse(raw ?? 'null'); } catch { throw new Error('GALAXY_TOKENS must be valid JSON'); }
  if (!Array.isArray(entries) || !entries.length || entries.some(p =>
    typeof p.token !== 'string' || p.token.length < 24 || typeof p.tenant !== 'string' || !p.tenant ||
    !Array.isArray(p.rooms) || !p.rooms.length || p.rooms.some(r => typeof r !== 'string' || !r) ||
    !['reader', 'writer'].includes(p.role)) || new Set(entries.map(p => p.token)).size !== entries.length) {
    throw new Error('GALAXY_TOKENS requires unique tokens (24+ characters), tenant, rooms and reader/writer role');
  }
  return entries;
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Use application/json');
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 1024 * 1024) throw new HttpError(413, 'Request exceeds 1 MiB');
    parts.push(part);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(parts).toString()); } catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Expected JSON object');
  return data;
}
export function apiServer(retrieval, principals, { maxConcurrent = 4 } = {}) {
  let active = 0;
  return createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    let admitted = false;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
        return res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
          <title>GalaxyHub — поиск по материалам</title><style>body{font:18px/1.6 system-ui;background:#101524;color:#eef2ff;max-width:760px;margin:64px auto;padding:24px}a{color:#a9c4ff}code,pre{background:#202b42;padding:12px;border-radius:8px}pre{white-space:pre-wrap}</style>
          <h1>GalaxyHub — поиск по материалам</h1><p>Сервис запущен. Это сервер поиска; интерфейс чата в браузере пока не подключён.</p>
          <p>Чтобы задать вопрос, открой терминал в папке GalaxyHub и выполни:</p>
          <pre>npm run ask -- "Как включается голосовой чат в Café?"</pre>
          <p>Команда сама использует ключ из локальных настроек и покажет ответ с источниками.</p>
          <p><a href="/health">Проверить состояние сервиса</a></p>
          <p>Адреса /v1/ предназначены для приложений. Для них нужен ключ доступа; обычное открытие в браузере вернёт ошибку авторизации.</p></html>`);
      }
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok', mode: retrieval.provider.mode });
      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
      const principal = principals.find(p => same(p.token, bearer));
      if (!principal) throw new HttpError(401, 'Valid bearer token required');
      if (active >= maxConcurrent) throw new HttpError(429, 'Service busy; retry later');
      active++; admitted = true;
      if (req.method === 'POST' && url.pathname === '/v1/documents') return send(200, await retrieval.index(principal, await body(req)));
      if (req.method === 'POST' && url.pathname === '/v1/search') return send(200, await retrieval.search(principal, await body(req)));
      if (req.method === 'POST' && url.pathname === '/v1/answer') return send(200, await retrieval.answer(principal, await body(req)));
      if (req.method === 'GET' && url.pathname === '/v1/documents') return send(200, { documents: retrieval.list(principal, url.searchParams.get('room')) });
      if (req.method === 'DELETE' && url.pathname === '/v1/documents') {
        return send(200, await retrieval.remove(principal, url.searchParams.get('room'), url.searchParams.get('id')));
      }
      throw new HttpError(404, 'Route not found');
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Retrieval request failed:', error.message);
      if (!res.headersSent && !res.destroyed) send(error.status ?? 502, { error: error instanceof HttpError ? error.message : 'Retrieval provider or storage failed' });
    } finally { if (admitted) active--; }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.env.GALAXY_MODE ?? 'remote';
  if (!['demo', 'remote', 'codex'].includes(mode)) throw new Error('GALAXY_MODE must be demo, remote or codex');
  const principals = loadPrincipals(process.env.GALAXY_TOKENS);
  const provider = mode === 'demo' ? demoProvider() : mode === 'codex' ? codexProvider() : remoteProvider();
  if (mode === 'codex') await provider.status();
  const retrieval = new Retrieval({ path: process.env.GALAXY_DB ?? './data/retrieval.sqlite',
    provider,
    chunkSize: Number(process.env.CHUNK_SIZE ?? 400), overlap: Number(process.env.CHUNK_OVERLAP ?? 80) });
  const server = apiServer(retrieval, principals);
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8787);
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(port, host, () => console.log(`Galaxy retrieval (${mode}): http://${host}:${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => {
    retrieval.provider.close?.(); retrieval.close(); process.exit(0);
  }));
}
