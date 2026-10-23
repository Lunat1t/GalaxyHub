import { CodexAppServer } from '../src/codex.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const client = new CodexAppServer();
const rpc = client.rpc.bind(client);
client.rpc = (method, params = {}) => rpc(method, method === 'initialize' ? { ...params, capabilities: { experimentalApi: true } } : params);
try {
  await client.status();
  const { thread } = await client.rpc('thread/start', { ephemeral: true, sandbox: 'read-only',
    cwd: fileURLToPath(new URL('../', import.meta.url)), config: { mcp_servers: {
      ...client.mcpConfig, galaxyhub_knowledge: { enabled: true }
    } } });
  const toolResult = await client.rpc('mcpServer/tool/call', { threadId: thread.id,
    server: 'galaxyhub_knowledge', tool: 'search_knowledge', arguments: { room: 'cafe', query: 'голосовой чат' } });
  // App Server wraps the MCP CallToolResult in result.
  const data = toolResult.result ?? toolResult;
  const content = data.structuredContent ?? JSON.parse(data.content?.find(c => c.type === 'text')?.text ?? '{}');
  if (data.isError || !content.passages?.length) throw new Error('Codex MCP call did not return knowledge passages');
  const status = await client.rpc('mcpServerStatus/list', { threadId: thread.id, detail: 'toolsAndAuthOnly' });
  const server = status.data.find(s => s.name === 'galaxyhub_knowledge');
  if (!server || !Object.keys(server.tools).some(name => name.includes('search_knowledge'))) throw new Error('Codex tool discovery failed');
  const report = { testedAt: new Date().toISOString(), codexConnection: 'passed',
    server: 'galaxyhub_knowledge', tools: Object.keys(server.tools), modelCalls: 0,
    passages: content.passages.map(({ text, ...meta }) => meta) };
  await writeFile(new URL('../reports/codex-mcp-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await client.rpc('thread/unsubscribe', { threadId: thread.id });
} finally { client.close(); }
