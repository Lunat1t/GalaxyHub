import { getDatabase } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const checks = await Promise.allSettled([
    Promise.resolve().then(() => getDatabase().query("SELECT 1")),
    fetch(`${process.env.WORLD_SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? 2567}`}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).then(r => { if (!r.ok) throw new Error("World unavailable"); }),
  ]);
  const database = checks[0].status === "fulfilled";
  const world = checks[1].status === "fulfilled";
  return Response.json({ status: database && world ? "ok" : "degraded", services: { web: true, database, world } }, { status: database && world ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
