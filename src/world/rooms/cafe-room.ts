import { Room, type Client } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { advancePlayer, PLAYER_COLORS } from '../../shared/cafe-map';
import { randomUUID } from 'node:crypto';
import { CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, nearbyTable, type ChatChannel, type ChatMessage, type TableChannel } from '../../shared/cafe-chat';

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
  private chatHistory = new Map<ChatChannel, ChatMessage[]>();
  private lastChat = new Map<string, number>();
  private chatZones = new Map<string, TableChannel | null>();

  onCreate() {
    this.setState(new CafeState());
    this.setPatchRate(33);
    this.onMessage('chat:sync', client => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const channel = nearbyTable(player);
      client.send('chat:sync', { channel, general: this.chatHistory.get('general') ?? [], nearby: channel ? this.chatHistory.get(channel) ?? [] : [] });
    });
    this.onMessage('chat:send', (client, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      const requestId = typeof value.requestId === 'string' && value.requestId.length <= 64 ? value.requestId : undefined;
      const reject = (message: string) => client.send('chat:error', { requestId, message });
      const player = this.state.players.get(client.sessionId);
      if (!player || !requestId || typeof value.text !== 'string' || typeof value.channel !== 'string') return reject('Не удалось отправить сообщение.');
      if (value.text.length > CHAT_MAX_LENGTH) return reject(`Максимум ${CHAT_MAX_LENGTH} символов.`);
      const text = value.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
      if (!text) return reject('Введите текст сообщения.');
      const channel = value.channel;
      if (channel !== 'general' && channel !== nearbyTable(player)) return reject('Подойдите к столу, чтобы участвовать в разговоре.');
      const now = Date.now();
      if (now - (this.lastChat.get(client.sessionId) ?? 0) < 750) return reject('Подождите немного перед следующим сообщением.');
      this.lastChat.set(client.sessionId, now);
      const message: ChatMessage = { id: randomUUID(), requestId, channel: channel as ChatChannel, authorId: client.sessionId, authorName: player.name, text, sentAt: now };
      const history = this.chatHistory.get(message.channel) ?? [];
      history.push(message);
      this.chatHistory.set(message.channel, history.slice(-CHAT_HISTORY_LIMIT));
      for (const recipient of this.clients) {
        const recipientPlayer = this.state.players.get(recipient.sessionId);
        if (channel === 'general' || (recipientPlayer && nearbyTable(recipientPlayer) === channel)) recipient.send('chat:message', message);
      }
    });
    this.onMessage('move', (client, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      if (typeof value.x !== 'number' || typeof value.y !== 'number' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
      const now = Date.now();
      const length = Math.hypot(value.x, value.y);
      const x = value.x / Math.max(1, length), y = value.y / Math.max(1, length);
      const previous = this.inputs.get(client.sessionId);
      // Never discard a direction change or release immediately after a press.
      if (previous?.x === x && previous?.y === y && now - (this.lastMessage.get(client.sessionId) ?? 0) < 30) return;
      this.lastMessage.set(client.sessionId, now);
      this.inputs.set(client.sessionId, { x, y, receivedAt: now });
    });
    this.setSimulationInterval(delta => {
      const now = Date.now();
      this.state.players.forEach((player, id) => {
        const input = this.inputs.get(id);
        const active = input && now - input.receivedAt < 250;
        const oldX = player.x, oldY = player.y;
        const next = advancePlayer(player, active ? input : { x: 0, y: 0 }, delta);
        player.x = next.x; player.y = next.y;
        player.moving = Math.hypot(player.x - oldX, player.y - oldY) > 0.01;
        const channel = nearbyTable(player);
        if (this.chatZones.get(id) !== channel) {
          this.chatZones.set(id, channel);
          this.clients.find(client => client.sessionId === id)?.send('chat:zone', { channel, messages: channel ? this.chatHistory.get(channel) ?? [] : [] });
        }
      });
    }, 1000 / 60);
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
    this.chatZones.set(client.sessionId, nearbyTable(player));
  }
  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.lastMessage.delete(client.sessionId);
    this.lastChat.delete(client.sessionId);
    this.chatZones.delete(client.sessionId);
  }
}
