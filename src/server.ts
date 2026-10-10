import 'dotenv/config';
import { createServer } from 'node:http';
import next from 'next';
import { Room, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CafeRoom } from './world/rooms/cafe-room';

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
      response.end(JSON.stringify({ status: 'ok', services: { web: true, world: true } }));
      return;
    }
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end('Internal server error');
    });
  });
  class LobbyRoom extends Room { maxClients = 20; }
  const world = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  world.define('cafe', CafeRoom);
  world.define('lobby', LobbyRoom);
  world.onShutdown(() => app.close());
  await world.listen(port, hostname);
  console.log(`Galaxy Hub web and world listening on port ${port}`);
}
start().catch(() => { console.error('Galaxy Hub could not start. Check build output and PORT.'); process.exitCode = 1; });
