import "dotenv/config";
import { getDatabase } from "../src/lib/db";
async function main() {
  const pool = getDatabase();
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    console.log("PostgreSQL connected. Migration registry ready.");
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Database initialization failed. Check DATABASE_URL and npm run db:up."); process.exitCode = 1; });
