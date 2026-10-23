import { createInterface } from 'node:readline';
const send = message => process.stdout.write(JSON.stringify(message) + '\n');
let thread = 0;
const mode = process.argv[2];
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (!message.id) return;
  let result = {};
  if (message.method === 'account/read') result = { account: mode === 'signed-out' ? null : { type: 'chatgpt' } };
  if (message.method === 'config/read') result = { config: { model: 'fixture-model', mcp_servers: { private: { enabled: true } } } };
  if (message.method === 'thread/start') {
    if (!message.params.ephemeral || message.params.sandbox !== 'read-only' || message.params.config.mcp_servers.private.enabled !== false) {
      return send({ id: message.id, error: { code: -1, message: 'Isolation configuration missing' } });
    }
    result = { thread: { id: `thread-${++thread}` } };
  }
  if (message.method === 'turn/start') {
    const threadId = message.params.threadId;
    if (mode === 'timeout') return send({ id: message.id, result: { turn: { id: 'turn', status: 'inProgress' } } });
    const data = JSON.parse(message.params.input[0].text);
    const text = mode === 'invalid-json' ? 'broken' : JSON.stringify(data.query ?
      { answer: 'Голосовой чат включается за столиком [1].', citationIds: ['[1]'] } : { context: 'GalaxyHub Café — голосовой чат за столиком.' });
    const item = { type: 'agentMessage', id: 'final', text, phase: 'final_answer' };
    // Completion before the RPC response deliberately exercises the transport race.
    if (mode === 'tool') send({ method: 'item/started', params: { threadId, item: { type: 'commandExecution' } } });
    else send({ method: 'turn/completed', params: { threadId, turn: { id: 'turn',
      status: mode === 'failed' ? 'failed' : 'completed', error: { message: 'fixture outage' }, items: [item] } } });
    result = { turn: { id: 'turn', status: 'inProgress' } };
  }
  send({ id: message.id, result });
});
