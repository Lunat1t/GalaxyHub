import type { Client } from '@colyseus/core';
import { authenticateCafe, cafeAccountClient, type CafeIdentity } from './cafe-identity';
import type { ChatMessage } from '../shared/cafe-chat';
import { REPORT_REASONS, type CafeSafetyState } from '../shared/safety';
import { UUID_PATTERN } from '../shared/project-rooms';

type Muted = { name: string; userId?: string; persistent: boolean };
type Context = {
  roomId: string;
  identity: (id: string) => CafeIdentity | undefined;
  identities: () => IterableIterator<[string, CafeIdentity]>;
  player: (id: string) => { name: string } | undefined;
  message: (id: string, recipient: string) => ChatMessage | undefined;
  messageUser: (id: string) => string | undefined;
  history: () => ChatMessage[];
  syncChat: (client: Client) => void;
};

export class CafeSafety {
  private muted = new Map<string, Map<string, Muted>>();
  private active = new Set<string>();
  private lastAction = new Map<string, number>();
  constructor(private context: Context) {}

  allows(recipient: string, message: ChatMessage) {
    if (message.authorId === recipient) return true;
    const muted = this.muted.get(recipient)?.get(message.authorId);
    if (muted && (!muted.persistent || (muted.userId && this.context.identity(recipient)?.blockedIds?.includes(muted.userId)))) return false;
    const author = this.context.messageUser(message.id);
    return !author || !this.context.identity(recipient)?.blockedIds?.includes(author);
  }
  state(recipient: string): CafeSafetyState {
    const blocks = this.context.identity(recipient)?.blockedIds ?? [];
    const rows = new Map([...this.muted.get(recipient) ?? []].filter(([, row]) => !row.persistent || Boolean(row.userId && blocks.includes(row.userId))));
    for (const [sessionId, identity] of this.context.identities()) if (identity.userId && blocks.includes(identity.userId)) rows.set(sessionId, { name: this.context.player(sessionId)?.name ?? 'Участник', persistent: true, userId: identity.userId });
    for (const message of this.context.history()) {
      const userId = this.context.messageUser(message.id);
      if (userId && blocks.includes(userId)) rows.set(message.authorId, { name: message.authorName, persistent: true, userId });
    }
    return { blocked: [...rows].map(([sessionId, row]) => ({ sessionId, name: row.name, persistent: row.persistent })) };
  }
  forget(id: string) { this.muted.delete(id); this.active.delete(id); this.lastAction.delete(id); }
  sync(client: Client) { client.send('safety:state', this.state(client.sessionId)); this.context.syncChat(client); }

  async action(client: Client, payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const value = payload as Record<string, unknown>;
    if (typeof value.requestId !== 'string' || !UUID_PATTERN.test(value.requestId)) return;
    const id = client.sessionId; const requestId = value.requestId;
    if (this.active.has(id) || Date.now() - (this.lastAction.get(id) ?? 0) < 750) { client.send('safety:result', { requestId, error: 'Подождите немного и повторите действие.' }); return; }
    this.active.add(id); this.lastAction.set(id, Date.now());
    try {
      const actor = this.context.identity(id);
      if (!actor) throw new Error('Посещение завершено.');
      const account = actor.account && actor.userId && actor.accessToken && actor.expiresAt! > Date.now();
      if (value.action === 'sync') { this.sync(client); return; }
      if (value.action === 'refresh') {
        if (account) {
          const fresh = await authenticateCafe(actor.accessToken);
          const current = this.context.identity(id);
          if (current && current.userId === fresh.userId) current.blockedIds = fresh.blockedIds;
          // Remove obsolete persistent entries after unblocking from profiles.
          for (const [target, row] of this.muted.get(id) ?? []) if (row.persistent && row.userId && !fresh.blockedIds?.includes(row.userId)) this.muted.get(id)?.delete(target);
        }
        this.sync(client); return;
      }
      const target = value.target as Record<string, unknown> | undefined;
      if (!target || !['cafe_player', 'cafe_message'].includes(String(target.kind)) || typeof target.sessionId !== 'string' || target.sessionId.length > 64 || target.sessionId === id) throw new Error('Выберите другого участника.');
      const message = target.kind === 'cafe_message' && typeof target.messageId === 'string' ? this.context.message(target.messageId, id) : undefined;
      if (target.kind === 'cafe_message' && (!message || message.authorId !== target.sessionId)) throw new Error('Сообщение больше недоступно в этом разговоре.');
      const previous = this.muted.get(id)?.get(target.sessionId);
      const player = this.context.player(target.sessionId);
      const targetUser = message ? this.context.messageUser(message.id) : this.context.identity(target.sessionId)?.userId ?? previous?.userId;
      if (targetUser && targetUser === actor.userId) throw new Error('Это ваш аккаунт.');
      if (!message && !player && !previous) throw new Error('Участник уже вышел.');
      const name = message?.authorName ?? player?.name ?? previous?.name ?? 'Участник';
      const db = account ? cafeAccountClient(actor.accessToken!) : null;
      let notice = '';
      if (value.action === 'block' || value.action === 'unblock') {
        const remove = value.action === 'unblock';
        if (!remove && (this.muted.get(id)?.size ?? 0) >= 200 && !this.muted.get(id)?.has(target.sessionId)) throw new Error('Лимит — 200 скрытых собеседников.');
        const persistent = Boolean(db && targetUser);
        if (persistent) {
          const result = remove
            ? await db!.from('user_blocks').delete().eq('blocker_id', actor.userId!).eq('blocked_id', targetUser!)
            : await db!.from('user_blocks').insert({ blocker_id: actor.userId!, blocked_id: targetUser! });
          if (result.error && !(result.error.code === '23505' && !remove)) throw new Error(result.error.code === '23514' ? 'Лимит — 200 блокировок.' : 'Не удалось сохранить блокировку. Повторите попытку.');
          if (!this.context.identity(id)) return;
          const current = this.context.identity(id);
          if (current && current.userId === actor.userId) current.blockedIds = remove ? (current.blockedIds ?? []).filter(userId => userId !== targetUser) : [...new Set([...(current.blockedIds ?? []), targetUser!])];
        }
        if (remove) {
          this.muted.get(id)?.delete(target.sessionId);
          if (persistent) for (const [session, row] of this.muted.get(id) ?? []) if (row.userId === targetUser) this.muted.get(id)?.delete(session);
        } else {
          const rows = this.muted.get(id) ?? new Map<string, Muted>();
          rows.set(target.sessionId, { name, userId: targetUser, persistent }); this.muted.set(id, rows);
        }
        notice = remove ? 'Блокировка снята.' : persistent ? 'Блокировка аккаунта сохранена. Его сообщения скрыты для вас.' : 'Сообщения собеседника скрыты до конца вашего посещения Café.';
      } else if (value.action === 'report') {
        if (!db) throw new Error('Для жалобы войдите в Café с аккаунтом.');
        if (typeof value.reason !== 'string' || !Object.hasOwn(REPORT_REASONS, value.reason) || typeof value.details !== 'string' || value.details.length > 2000) throw new Error('Проверьте причину и подробности жалобы.');
        const result = await db.from('safety_reports').insert({ reporter_id: actor.userId!, kind: target.kind, target_user_id: targetUser ?? null, cafe_room_id: this.context.roomId, cafe_session_id: target.sessionId, cafe_message_id: message?.id ?? null, reason: value.reason, details: value.details.trim(), evidence: message ? { text: message.text, author: message.authorName, channel: message.channel, sent_at: message.sentAt } : { name } });
        if (result.error && result.error.code !== '23505') throw new Error(result.error.code === 'P0001' ? 'Не больше 10 жалоб в час. Попробуйте позже.' : 'Не удалось сохранить жалобу. Повторите попытку.');
        notice = result.error ? 'Жалоба на этот объект уже принята сегодня.' : 'Жалоба сохранена для разбора владельцем проекта.';
      } else throw new Error('Неизвестное действие.');
      client.send('safety:result', { requestId, notice });
      if (value.action === 'block' || value.action === 'unblock') this.sync(client);
    } catch (error) { client.send('safety:result', { requestId, error: error instanceof Error ? error.message : 'Не удалось выполнить действие.' }); }
    finally { this.active.delete(id); }
  }
}
