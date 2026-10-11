import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, type Room } from 'colyseus.js';
import { MovementPrediction, movementStep, MAX_PENDING_STEPS } from '../src/shared/cafe-movement';
import { PointerDirections } from '../src/shared/cafe-controls';
import { safeAuthNext } from '../src/shared/project-rooms';
import { canStandAt } from '../src/shared/cafe-map';
import type { ChatMessage, ChatSync, ChatError } from '../src/shared/cafe-chat';
import type { SafetyResult } from '../src/shared/safety';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  const deadline = Date.now() + 8000;
  while (!check()) { assert(Date.now() < deadline, 'Timed out waiting for state'); await pause(25); }
}
function units() {
  const prediction = new MovementPrediction({ x: 96, y: 440 });
  let server = { x: 96, y: 440 };
  for (let i = 1; i <= 60; i++) {
    const frame = prediction.step({ x: 1, y: 0 })!;
    if (i <= 30) server = movementStep(server, frame);
  }
  const released = { ...prediction.position };
  prediction.reconcile(server, 30);
  assert.deepEqual(prediction.position, released, 'Reconciliation must replay pending steps');
  prediction.step({ x: 0, y: 0 });
  prediction.reconcile(released, 60);
  assert.deepEqual(prediction.position, released, 'Release must not cause rollback');
  prediction.reconcile({ x: 0, y: 0 }, 29);
  assert.deepEqual(prediction.position, released, 'Ignore stale snapshots');
  const bounded = new MovementPrediction({ x: 96, y: 440 });
  for (let i = 0; i < MAX_PENDING_STEPS; i++) assert(bounded.step({ x: 1, y: -1 }));
  assert.equal(bounded.step({ x: 1, y: 0 }), null);
  assert(canStandAt(bounded.position.x, bounded.position.y));
  const touch = new PointerDirections();
  assert.deepEqual(touch.press(1, { x: 1, y: 0 }), { x: 1, y: 0 });
  assert.deepEqual(touch.press(2, { x: 0, y: -1 }), { x: 1, y: -1 });
  assert.deepEqual(touch.release(1), { x: 0, y: -1 });
  assert.deepEqual(touch.release(1), { x: 0, y: -1 }, 'Lost capture must not stop another finger');
  assert.deepEqual(touch.clear(), { x: 0, y: 0 });
  for (const malicious of ['https://example.com', '//example.com', '/\\example.com', '/rooms/invalid', '/cafe?next=https://example.com']) assert.equal(safeAuthNext(malicious), '/');
  assert.equal(safeAuthNext('/rooms'), '/rooms');
}
type State = { players: Map<string, { x: number; y: number; inputSeq: number }> };
async function main() {
  units();
  const endpoint = process.env.WORLD_SERVER_URL ?? 'http://127.0.0.1:2567';
  const client = new Client(endpoint);
  const rooms: Room<State>[] = [];
  try {
    const a = await client.create<State>('cafe', { name: 'V1 A', movementVersion: 2 }); rooms.push(a);
    const b = await client.joinById<State>(a.roomId, { name: 'V1 B' }); rooms.push(b);
    const c = await client.joinById<State>(a.roomId, { name: 'V1 C' }); rooms.push(c);
    const messages = new Map<Room<State>, ChatMessage[]>();
    const errors: ChatError[] = [], results: SafetyResult[] = [], sync: ChatSync[] = [];
    for (const room of rooms) {
      messages.set(room, []);
      room.onMessage<ChatMessage>('chat:message', value => messages.get(room)!.push(value));
      room.onMessage<ChatError>('chat:error', value => errors.push(value));
      room.onMessage<ChatSync>('chat:sync', value => { if (room === a) sync.push(value); });
      room.onMessage('chat:zone', () => {}); room.onMessage('safety:state', () => {});
      room.onMessage<SafetyResult>('safety:result', value => results.push(value));
    }
    await until(() => a.state.players?.size === 3);
    const me = a.state.players.get(a.sessionId)!; const start = me.x;
    a.send('move', { frames: [{ seq: 2, x: 1, y: 0 }] }); await pause(70);
    assert.equal(me.inputSeq, 0, 'Reject skipped sequence');
    a.send('move', { frames: [{ seq: 1, x: 2, y: 0 }] }); await pause(70);
    assert.equal(me.inputSeq, 0, 'Reject oversized input');
    for (let seq = 1; seq <= 30; seq += 15) a.send('move', { frames: Array.from({ length: 15 }, (_, i) => ({ seq: seq + i, x: 1, y: 0 })) });
    await until(() => me.inputSeq === 30);
    assert(Math.abs(me.x - start - 75) < .01);
    const stop = me.x; await pause(300); assert.equal(me.x, stop, 'No movement without new steps');
    const text = '<img src=x onerror=alert(1)> V1';
    b.send('chat:send', { requestId: randomUUID(), channel: 'general', text, authorName: 'Spoofed' });
    await until(() => messages.get(a)!.length === 1 && messages.get(c)!.length === 1);
    assert.equal(messages.get(a)![0].authorName, 'V1 B'); assert.equal(messages.get(a)![0].text, text);
    b.send('chat:send', { requestId: randomUUID(), channel: 'general', text: 'Too fast' });
    await until(() => errors.length > 0);
    b.send('chat:send', { requestId: randomUUID(), channel: 'table-1', text: 'Unauthorized table' });
    await until(() => errors.length > 1);
    const requestId = randomUUID();
    a.send('safety:action', { requestId, action: 'block', target: { kind: 'cafe_player', sessionId: b.sessionId } });
    await until(() => results.some(row => row.requestId === requestId));
    assert(!results.find(row => row.requestId === requestId)?.error);
    await pause(800);
    b.send('chat:send', { requestId: randomUUID(), channel: 'general', text: 'Blocked message' });
    await until(() => messages.get(c)!.length === 2); await pause(100);
    assert.equal(messages.get(a)!.length, 1, 'Server must not deliver blocked messages');
    a.send('chat:sync'); await until(() => sync.length > 0); assert.equal(sync.at(-1)!.general.length, 0);
    const unblock = randomUUID();
    a.send('safety:action', { requestId: unblock, action: 'unblock', target: { kind: 'cafe_player', sessionId: b.sessionId } });
    await until(() => results.some(row => row.requestId === unblock));
    await until(() => sync.at(-1)!.general.length === 2);
    await pause(800);
    const report = randomUUID();
    a.send('safety:action', { requestId: report, action: 'report', target: { kind: 'cafe_player', sessionId: b.sessionId }, reason: 'spam', details: '' });
    await until(() => results.some(row => row.requestId === report));
    assert(results.find(row => row.requestId === report)?.error, 'Guests cannot submit reports');
    for (let i = 3; i < 20; i++) { const guest = await client.joinById<State>(a.roomId, { name: `V1 capacity ${i}` }); guest.onMessage('chat:zone', () => {}); rooms.push(guest); }
    await until(() => a.state.players.size === 20);
    await assert.rejects(() => client.joinById(a.roomId, { name: 'V1 overflow' }), 'Reject a 21st participant');
    console.log('V1 checks passed: input replay, release, queue limits, two-finger controls, safe redirects, three clients, validated movement, chat, author spoofing, table access, throttle, server blocking, unblock, guest report denial, 20-client capacity, overflow rejection.');
  } finally { for (const room of rooms.reverse()) if (room.connection.isOpen) await room.leave(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
