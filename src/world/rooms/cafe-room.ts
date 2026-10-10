import { Room, type Client } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { canStandAt, PLAYER_COLORS, WALK_SPEED } from '../../shared/cafe-map';

// Schema fields use accessors; tsconfig disables define-style class fields.
class CafePlayer extends Schema {
  name = 'Гость';
  color = 0;
  x = 400;
  y = 460;
  moving = false;
}
defineTypes(CafePlayer, { name: 'string', color: 'uint8', x: 'float32', y: 'float32', moving: 'boolean' });
class CafeState extends Schema { players = new MapSchema<CafePlayer>(); }
defineTypes(CafeState, { players: { map: CafePlayer } });

type Input = { x: number; y: number; receivedAt: number };
export class CafeRoom extends Room<CafeState> {
  maxClients = 20;
  private inputs = new Map<string, Input>();
  private lastMessage = new Map<string, number>();

  onCreate() {
    this.setState(new CafeState());
    this.setPatchRate(50);
    this.onMessage('move', (client, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      if (typeof value.x !== 'number' || typeof value.y !== 'number' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
      const now = Date.now();
      if (now - (this.lastMessage.get(client.sessionId) ?? 0) < 30) return;
      this.lastMessage.set(client.sessionId, now);
      const length = Math.hypot(value.x, value.y);
      this.inputs.set(client.sessionId, { x: value.x / Math.max(1, length), y: value.y / Math.max(1, length), receivedAt: now });
    });
    this.setSimulationInterval(delta => {
      const step = WALK_SPEED * Math.min(delta, 100) / 1000;
      const now = Date.now();
      this.state.players.forEach((player, id) => {
        const input = this.inputs.get(id);
        const active = input && now - input.receivedAt < 250;
        const dx = active ? input.x * step : 0;
        const dy = active ? input.y * step : 0;
        const oldX = player.x, oldY = player.y;
        if (canStandAt(player.x + dx, player.y)) player.x += dx;
        if (canStandAt(player.x, player.y + dy)) player.y += dy;
        player.moving = Math.hypot(player.x - oldX, player.y - oldY) > 0.01;
      });
    }, 50);
  }

  onJoin(client: Client, options: unknown) {
    const value = options && typeof options === 'object' ? options as Record<string, unknown> : {};
    const player = new CafePlayer();
    if (typeof value.name === 'string') player.name = value.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Гость';
    if (typeof value.color === 'number' && Number.isInteger(value.color) && value.color >= 0 && value.color < PLAYER_COLORS.length) player.color = value.color;
    for (let slot = 0; slot < 20; slot++) {
      const x = 96 + (slot % 10) * 64;
      const y = 440 + Math.floor(slot / 10) * 36;
      const occupied = [...this.state.players.values()].some(p => Math.hypot(p.x - x, p.y - y) < 28);
      if (!occupied) { player.x = x; player.y = y; break; }
    }
    this.state.players.set(client.sessionId, player);
  }
  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.lastMessage.delete(client.sessionId);
  }
}
