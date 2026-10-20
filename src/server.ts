import 'dotenv/config';
import { createServer } from 'node:http';
import next from 'next';
import { version } from '../package.json';

async function start() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const hostname = process.env.HOST ?? '0.0.0.0';
  const app = next({ dev: false, hostname, port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ status: 'ok', version, services: { web: true, personalRoom: true } }));
      return;
    }
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end('Internal server error');
    });
  });
  // The personal room renders locally. Do not expose the old shared rooms.
  httpServer.on('upgrade', (_request, socket) => socket.destroy());
  const shutdown = () => {
    httpServer.close(() => { void app.close().then(() => { process.exitCode = 0; }); });
    httpServer.closeIdleConnections();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, hostname, () => { httpServer.off('error', reject); resolve(); });
  });
  console.log(`Galaxy Hub ${version} personal room listening on port ${port}`);
}
start().catch(() => { console.error('Galaxy Hub could not start. Check build output and PORT.'); process.exitCode = 1; });
