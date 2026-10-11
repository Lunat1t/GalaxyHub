import 'dotenv/config';
import assert from 'node:assert/strict';
import { Client, type Room } from 'colyseus.js';
import { canStandAt, WALK_SPEED } from '../src/shared/cafe-map';

type Player = { name: string; x: number; y: number };
type State = { players: Map<string, Player> };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Timed out waiting for Café state'); await pause(50); }
}
async function move(room: Room<State>, x: number, y: number, duration: number) {
  room.send('move', { x, y });
  const interval = setInterval(() => room.send('move', { x, y }), 80);
  try { await pause(duration); } finally { clearInterval(interval); }
}
async function main() {
  const client = new Client(process.env.WORLD_SERVER_URL ?? 'http://127.0.0.1:2567');
  let first: Room<State> | undefined, second: Room<State> | undefined;
  try {
    first = await client.create<State>('cafe', { name: 'Проверка A', color: 1 });
    second = await client.joinById<State>(first.roomId, { name: 'Проверка B', color: 2 });
    first.onMessage('chat:zone', () => {}); second.onMessage('chat:zone', () => {});
    await until(() => Boolean(first?.state.players?.get(second!.sessionId) && second?.state.players?.get(first!.sessionId)));
    const a = first.state.players.get(first.sessionId)!;
    const b = first.state.players.get(second.sessionId)!;
    const startX = a.x, bX = b.x;
    const began = Date.now();
    // A malicious oversized direction must not bypass the server speed limit.
    await move(first, 1000000, 0, 320);
    await until(() => a.x > startX);
    const distance = a.x - startX;
    assert(distance <= WALK_SPEED * ((Date.now() - began) / 1000 + .1));
    assert.equal(b.x, bX, 'Moving one client must not move another');
    await until(() => Math.abs(second!.state.players.get(first!.sessionId)!.x - a.x) < .1);
    await pause(450);
    const stoppedX = a.x;
    await pause(150);
    assert.equal(a.x, stoppedX, 'Stale movement input must expire');
    first.send('move', { x: 'invalid', y: null });
    await pause(100);
    assert.equal(a.x, stoppedX, 'Invalid movement must be ignored');
    await move(first, -1, 0, 1300);
    await pause(400);
    assert(canStandAt(a.x, a.y), 'Player must remain inside walkable space');
    assert(a.x >= 44, 'Player must not cross the wall');
    assert(!canStandAt(220, 280), 'Table area must block movement');
    await move(first, 1, 0, 1200);
    await pause(350);
    assert(a.x > 180 && a.x < 300, 'Test participant must be under the first table');
    await move(first, 0, -1, 1200);
    await pause(350);
    assert(a.y >= 336, 'Player must not walk through the first table');
    const secondId = second.sessionId;
    await second.leave(); second = undefined;
    await until(() => !first!.state.players.has(secondId));
    console.log('Café checks passed: two clients, presence, movement sync, speed limit, stale input, invalid messages, map bounds, table collision, departure.');
  } finally {
    if (second?.connection.isOpen) await second.leave();
    if (first?.connection.isOpen) await first.leave();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Café check failed'); process.exitCode = 1; });
