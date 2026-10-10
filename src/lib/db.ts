import { Pool } from "pg";
import { databaseUrl } from "./env";
const globals = globalThis as unknown as { galaxyPool?: Pool };
export function getDatabase(): Pool {
  if (!globals.galaxyPool) {
    globals.galaxyPool = new Pool({ connectionString: databaseUrl(), max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, query_timeout: 5000 });
    globals.galaxyPool.on("error", () => console.error("PostgreSQL idle connection failed."));
  }
  return globals.galaxyPool;
}
