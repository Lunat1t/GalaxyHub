import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

const child = spawn(process.execPath, ['--env-file=' + fileURLToPath(new URL('../.env', import.meta.url)),
  fileURLToPath(new URL('../src/mcp.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map();
let sequence = 0;
child.stderr.on('data', () => {});
const fail = error => { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); } pending.clear(); };
child.on('error', fail);
child.on('exit', () => fail(new Error('MCP process exited')));
createInterface({ input: child.stdout }).on('line', line => {
  const message = JSON.parse(line), request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id); clearTimeout(request.timer);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
function rpc(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP check timed out')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
try {
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'galaxy-check', version: '1.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { tools } = await rpc('tools/list');
  const result = await rpc('tools/call', { name: 'search_knowledge', arguments: { room: 'cafe', query: 'голосовой чат' } });
  if (result.isError || !result.structuredContent?.passages.length) throw new Error('MCP returned no passages');
  const denied = await rpc('tools/call', { name: 'search_knowledge', arguments: { room: 'private-room', query: 'чат' } });
  if (!denied.isError) throw new Error('Room isolation failed');
  const report = { testedAt: new Date().toISOString(), server: initialized.serverInfo, tools: tools.map(t => t.name),
    modelCalls: 0, roomIsolation: 'passed', sources: result.structuredContent.passages.map(({ text, ...metadata }) => metadata) };
  await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await writeFile(new URL('../reports/mcp-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { child.stdin.end(); }
