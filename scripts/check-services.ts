import "dotenv/config";
import { Client } from "colyseus.js";
async function main() {
  const response = await fetch(`${process.env.WEB_SERVER_URL ?? "http://127.0.0.1:3000"}/api/health`, { signal: AbortSignal.timeout(15000) });
  console.log("Service status:", await response.json());
  if (!response.ok) throw new Error("Some services unavailable");
  const client = new Client(process.env.WORLD_SERVER_URL ?? "http://127.0.0.1:2567");
  const room = await client.joinOrCreate("lobby");
  console.log("World connection established.");
  await room.leave();
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Service check failed"); process.exitCode = 1; });
