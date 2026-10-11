'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Room } from 'colyseus.js';
import { CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, channelName, type ChatChannel, type ChatError, type ChatMessage, type ChatSync, type ChatZone, type TableChannel } from '@/shared/cafe-chat';
import SafetyActions from '../safety-actions';
import type { CafeSafetyState } from '@/shared/safety';

type ChatConnection = Pick<Room, 'onMessage' | 'send' | 'sessionId' | 'connection'>;

export default function CafeChat({ room, connected, onTyping, safety, account }: { room: ChatConnection; connected: boolean; onTyping: (typing: boolean) => void; safety: CafeSafetyState; account: boolean }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [unread, setUnread] = useState(0);
  const [table, setTable] = useState<TableChannel | null>(null);
  const [selected, setSelected] = useState<'general' | 'nearby'>('general');
  const [messages, setMessages] = useState<Partial<Record<ChatChannel, ChatMessage[]>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ChatChannel, string>>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef<{ id: string; channel: ChatChannel; text: string } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const channel = selected === 'nearby' && table ? table : 'general';
  const history = (messages[channel] ?? []).filter(message => !safety.blocked.some(row => row.sessionId === message.authorId));

  useEffect(() => {
    const clearPending = () => {
      if (timeout.current) clearTimeout(timeout.current);
      pendingRef.current = null;
      setPending(false);
    };
    setMessages({}); setTable(null); setError(''); clearPending();
    const handlers = [
      room.onMessage<ChatSync>('chat:sync', data => {
        setTable(data.channel);
        setMessages({ general: data.general, ...(data.channel ? { [data.channel]: data.nearby } : {}) });
      }),
      room.onMessage<ChatZone>('chat:zone', data => {
        setTable(data.channel);
        setMessages(previous => ({ general: previous.general ?? [], ...(data.channel ? { [data.channel]: data.messages } : {}) }));
        if (!data.channel) setSelected('general');
      }),
      room.onMessage<ChatMessage>('chat:message', message => {
        setMessages(previous => {
          const existing = previous[message.channel] ?? [];
          if (existing.some(item => item.id === message.id)) return previous;
          return { ...previous, [message.channel]: [...existing, message].slice(-CHAT_HISTORY_LIMIT) };
        });
        if (!openRef.current && message.authorId !== room.sessionId) setUnread(value => value + 1);
        const sending = pendingRef.current;
        if (message.authorId === room.sessionId && message.requestId === sending?.id) {
          setDrafts(previous => previous[sending.channel] === sending.text ? { ...previous, [sending.channel]: '' } : previous);
          setError(''); clearPending();
        }
      }),
      room.onMessage<ChatError>('chat:error', data => {
        if (data.requestId === pendingRef.current?.id) { setError(data.message); clearPending(); }
      }),
    ];
    if (room.connection.isOpen) room.send('chat:sync');
    return () => { handlers.forEach(unsubscribe => unsubscribe()); if (timeout.current) clearTimeout(timeout.current); };
  }, [room]);

  useEffect(() => {
    if (!connected && pendingRef.current) {
      if (timeout.current) clearTimeout(timeout.current);
      pendingRef.current = null; setPending(false);
      setError('Соединение закрыто. Текст остался в поле ввода.');
    }
  }, [connected]);

  useEffect(() => { follow.current = true; if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [open, channel]);
  useEffect(() => { if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages]);

  function send(event: FormEvent) {
    event.preventDefault();
    const text = (drafts[channel] ?? '').trim();
    if (!text || pendingRef.current || !connected || !room.connection.isOpen) return;
    const id = crypto.randomUUID();
    pendingRef.current = { id, channel, text: drafts[channel] ?? '' };
    setPending(true); setError('');
    try { room.send('chat:send', { requestId: id, channel, text }); }
    catch { pendingRef.current = null; setPending(false); setError('Не удалось отправить. Проверьте соединение.'); return; }
    timeout.current = setTimeout(() => {
      pendingRef.current = null; setPending(false);
      setError('Нет подтверждения отправки. Проверьте сообщения и соединение.');
    }, 8000);
  }

  function toggle() {
    const next = !open;
    setOpen(next); openRef.current = next;
    if (next) setUnread(0);
    else onTyping(false);
  }

  return <aside className={`cafe-chat ${open ? 'cafe-chat-open' : ''}`} aria-label="Чат Café">
    <button className="cafe-chat-toggle" aria-expanded={open} aria-controls="cafe-chat-panel" onClick={toggle}>{open ? 'Скрыть чат' : `Чат${unread ? ` (${unread})` : ''}`}</button>
    {open && <div id="cafe-chat-panel" className="cafe-chat-panel">
      <div className="cafe-chat-tabs" aria-label="Каналы чата">
        <button aria-pressed={selected === 'general'} onClick={() => { setSelected('general'); setError(''); }}>Общий</button>
        <button aria-pressed={selected === 'nearby'} disabled={!table} onClick={() => { setSelected('nearby'); setError(''); }}>{table ? channelName(table) : 'У стола'}</button>
      </div>
      <p className="cafe-chat-hint">{channel === 'general' ? 'Сообщения видны всем в этой комнате Café.' : 'Разговор видят участники рядом с этим столом.'}{!table && ' Подойдите к столу для отдельного разговора.'}</p>
      <div ref={list} className="cafe-chat-messages" role="log" aria-label={channelName(channel)} aria-live="polite" aria-relevant="additions" onScroll={() => {
        const element = list.current;
        if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
      }}>
        {!history.length && <p className="cafe-chat-empty">Начните разговор.</p>}
        {history.map(message => <div className="cafe-chat-message" key={message.id}>
          <div><strong>{message.authorAvatar && `${message.authorAvatar} `}{message.authorName}{message.authorId === room.sessionId ? ' (вы)' : ''}{message.account ? ' · аккаунт' : ' · гость'}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</time></div>
          <p>{message.text}</p>
          {message.authorId !== room.sessionId && <SafetyActions target={{ kind: 'cafe_message', messageId: message.id, sessionId: message.authorId }} cafe={room} account={account} onTyping={onTyping} />}
        </div>)}
      </div>
      <form onSubmit={send} className="cafe-chat-form">
        <label htmlFor="cafe-message">Сообщение — {channelName(channel)}</label>
        <textarea id="cafe-message" rows={2} maxLength={CHAT_MAX_LENGTH} value={drafts[channel] ?? ''} disabled={!connected} placeholder="Написать сообщение…"
          onFocus={() => onTyping(true)} onBlur={() => onTyping(false)}
          onChange={event => setDrafts(previous => ({ ...previous, [channel]: event.target.value }))}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} />
        <div><small>{(drafts[channel] ?? '').length}/{CHAT_MAX_LENGTH}</small><button disabled={!connected || pending || !(drafts[channel] ?? '').trim()}>{pending ? 'Отправляем…' : 'Отправить'}</button></div>
        {error && <p className="cafe-chat-error" role="alert">{error}</p>}
      </form>
    </div>}
  </aside>;
}
