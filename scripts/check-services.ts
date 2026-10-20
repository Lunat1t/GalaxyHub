import 'dotenv/config';
import assert from 'node:assert/strict';

async function main() {
  const response = await fetch(`${process.env.WEB_SERVER_URL ?? 'http://127.0.0.1:3000'}/api/health`, { signal: AbortSignal.timeout(15000) });
  const status = await response.json();
  assert(response.ok && status.status === 'ok');
  assert(status.services.web && status.services.personalRoom);
  console.log('Personal room web service is healthy.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Service check failed'); process.exitCode = 1; });
