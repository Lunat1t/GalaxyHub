import { Room, type Client } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { advancePlayer, PLAYER_COLORS } from '../../shared/cafe-map';
import { MAX_PENDING_STEPS, MOVEMENT_STEP_MS, movementStep, type MovementFrame } from '../../shared/cafe-movement';
import { randomUUID } from 'node:crypto';
import { CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, nearbyTable, type ChatChannel, type ChatMessage, type TableChannel } from '../../shared/cafe-chat';
import { authenticateCafe, type CafeIdentity } from '../cafe-identity';
import { CafeSafety } from '../cafe-safety';

// Schema fields use accessors; tsconfig disables define-style class fields.
class CafePlayer extends Schema {
  name = 'Гость';
  color = 0;
  x = 400;
  y = 460;
  moving = false;
  avatar = '';
  account = false;
  inputSeq = 0;
}
defineTypes(CafePlayer, { name: 'string', color: 'uint8', x: 'float32', y: 'float32', moving: 'boolean', avatar: 'string', account: 'boolean', inputSeq: 'uint32' });
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
  private identities = new Map<string, CafeIdentity>();
  private refreshing = new Set<string>();
  private lastRefresh = new Map<string, number>();
  private movementQueues = new Map<string, { received: number; frames: MovementFrame[] }>();
  private chatAuthors = new Map<string, string>();
  private safety!: CafeSafety;

  private syncChat(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const channel = nearbyTable(player);
    client.send('chat:sync', { channel, general: (this.chatHistory.get('general') ?? []).filter(message => this.safety.allows(client.sessionId, message)), nearby: channel ? (this.chatHistory.get(channel) ?? []).filter(message => this.safety.allows(client.sessionId, message)) : [] });
  }

  async onAuth(_client: Client, options: unknown) {
    const value = options && typeof options === 'object' ? options as Record<string, unknown> : {};
    return authenticateCafe(value.accessToken);
  }

  private applyIdentity(client: Client, identity: CafeIdentity) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !identity.account) return;
    player.account = true;
    player.name = identity.visible ? identity.name!.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 50) || 'Участник' : `Участник ${client.sessionId.slice(-4)}`;
    player.avatar = identity.visible ? identity.avatar! : '';
    player.color = identity.visible ? identity.color! : 0;
  }

  onCreate() {
    this.setState(new CafeState());
    this.setSeatReservationTime(30);
    this.setPatchRate(33);
    this.safety = new CafeSafety({ roomId: this.roomId, identity: id => this.identities.get(id), identities: () => this.identities.entries(), player: id => this.state.players.get(id), messageUser: id => this.chatAuthors.get(id), history: () => [...this.chatHistory.values()].flat(), syncChat: client => this.syncChat(client), message: (id, recipient) => {
      const player = this.state.players.get(recipient);
      const found = [...this.chatHistory.values()].flat().find(message => message.id === id);
      return player && found && (found.channel === 'general' || found.channel === nearbyTable(player)) ? found : undefined;
    } });
    this.onMessage('safety:action', (client, payload) => { void this.safety.action(client, payload); });
    this.onMessage('identity:refresh', async (client, payload: unknown) => {
      const current = this.identities.get(client.sessionId);
      if (!current?.account || this.refreshing.has(client.sessionId)) return;
      const now = Date.now();
      if (now - (this.lastRefresh.get(client.sessionId) ?? 0) < 3000) return;
      this.lastRefresh.set(client.sessionId, now); this.refreshing.add(client.sessionId);
      try {
        const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
        const identity = await authenticateCafe(value.accessToken);
        if (!identity.account || identity.userId !== current.userId) { client.leave(4001); return; }
        if (!this.state.players.has(client.sessionId)) return;
        this.identities.set(client.sessionId, identity); this.applyIdentity(client, identity);
        client.send('identity:updated');
      } catch { client.send('identity:error', { message: 'Не удалось обновить профиль или сессию. Повторите вход в Café.' }); }
      finally { this.refreshing.delete(client.sessionId); }
    });
    this.onMessage('chat:sync', client => this.syncChat(client));
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
      const message: ChatMessage = { id: randomUUID(), requestId, channel: channel as ChatChannel, authorId: client.sessionId, authorName: player.name, authorAvatar: player.avatar, account: player.account, text, sentAt: now };
      const author = this.identities.get(client.sessionId)?.userId;
      if (author) this.chatAuthors.set(message.id, author);
      const history = this.chatHistory.get(message.channel) ?? [];
      history.push(message);
      for (const evicted of history.slice(0, Math.max(0, history.length - CHAT_HISTORY_LIMIT))) this.chatAuthors.delete(evicted.id);
      this.chatHistory.set(message.channel, history.slice(-CHAT_HISTORY_LIMIT));
      for (const recipient of this.clients) {
        const recipientPlayer = this.state.players.get(recipient.sessionId);
        if ((channel === 'general' || (recipientPlayer && nearbyTable(recipientPlayer) === channel)) && this.safety.allows(recipient.sessionId, message)) recipient.send('chat:message', message);
      }
    });
    this.onMessage('move', (client, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      const queue = this.movementQueues.get(client.sessionId);
      if (queue) {
        if (!Array.isArray(value.frames) || !value.frames.length || value.frames.length > 16) return;
        if (queue.frames.length + value.frames.length > MAX_PENDING_STEPS) { client.leave(4002); return; }
        const frames: MovementFrame[] = [];
        let expected = queue.received + 1;
        for (const input of value.frames) {
          if (!input || typeof input !== 'object' || input.seq !== expected || expected > 0xffffffff ||
            typeof input.x !== 'number' || typeof input.y !== 'number' || !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
            Math.abs(input.x) > 1 || Math.abs(input.y) > 1) return;
          frames.push({ seq: expected++, x: input.x, y: input.y });
        }
        queue.received = expected - 1;
        queue.frames.push(...frames);
        return;
      }
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
    let elapsed = 0;
    this.setSimulationInterval(delta => {
      elapsed += Math.min(Math.max(delta, 0), 250);
      while (elapsed >= MOVEMENT_STEP_MS) {
        elapsed -= MOVEMENT_STEP_MS;
        const now = Date.now();
        this.state.players.forEach((player, id) => {
          const identity = this.identities.get(id);
          if (identity?.account && identity.expiresAt! <= now) { this.clients.find(client => client.sessionId === id)?.leave(4001); return; }
          const queue = this.movementQueues.get(id);
          const frame = queue?.frames.shift();
          const input = this.inputs.get(id);
          const active = input && now - input.receivedAt < 250;
          const oldX = player.x, oldY = player.y;
          // Consume at most one client step per server step. A client cannot speed
          // up by flooding the input queue. An empty queue never repeats movement.
          const next = queue ? (frame ? movementStep(player, frame) : player) : advancePlayer(player, active ? input : { x: 0, y: 0 }, MOVEMENT_STEP_MS);
          player.x = next.x; player.y = next.y;
          if (frame) player.inputSeq = frame.seq;
          player.moving = Math.hypot(player.x - oldX, player.y - oldY) > 0.01;
          const channel = nearbyTable(player);
          if (this.chatZones.get(id) !== channel) {
            this.chatZones.set(id, channel);
            this.clients.find(client => client.sessionId === id)?.send('chat:zone', { channel, messages: channel ? (this.chatHistory.get(channel) ?? []).filter(message => this.safety.allows(id, message)) : [] });
          }
        });
      }
    }, 1000 / 60);
  }

  onJoin(client: Client, options: unknown, identity: CafeIdentity) {
    const value = options && typeof options === 'object' ? options as Record<string, unknown> : {};
    if (value.movementVersion === 2) this.movementQueues.set(client.sessionId, { received: 0, frames: [] });
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
    this.identities.set(client.sessionId, identity);
    this.applyIdentity(client, identity);
    this.chatZones.set(client.sessionId, nearbyTable(player));
  }
  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.movementQueues.delete(client.sessionId);
    this.safety.forget(client.sessionId);
    this.lastMessage.delete(client.sessionId);
    this.lastChat.delete(client.sessionId);
    this.chatZones.delete(client.sessionId);
    this.identities.delete(client.sessionId);
    this.refreshing.delete(client.sessionId);
    this.lastRefresh.delete(client.sessionId);
  }
}
