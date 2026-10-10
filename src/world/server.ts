import "dotenv/config";
import { createServer } from "node:http";
import { Room, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { worldPort } from "../lib/env";
import { CafeRoom } from "./rooms/cafe-room";
class LobbyRoom extends Room { maxClients = 20; }
const port = worldPort();
const httpServer = createServer((request, response) => {
  if (request.url === "/health" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ status: "ok", service: "world" }));
    return;
  }
  response.writeHead(404); response.end();
});
const server = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
server.define("lobby", LobbyRoom);
server.define("cafe", CafeRoom);
server.listen(port, process.env.WORLD_HOST ?? "0.0.0.0").then(() => {
  console.log(`Galaxy Hub world server listening on port ${port}`);
}).catch(() => { console.error("Could not start world server. Check port availability."); process.exitCode = 1; });
