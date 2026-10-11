'use client';
import { useEffect, useRef, useState } from 'react';
import type { Room } from 'colyseus.js';
import { roomRequest, failureText } from './rooms/room-client';
import { REPORT_REASONS, type ReportReason, type ReportTarget, type SafetyResult } from '@/shared/safety';

export function notifySafetyChanged() {
  window.dispatchEvent(new Event('galaxy-safety-changed'));
  try { localStorage.setItem('galaxy-safety-updated', String(Date.now())); } catch {}
}
type Connection = Pick<Room, 'send' | 'onMessage' | 'connection'>;
export default function SafetyActions({ target, userId, blocked = false, cafe, account = true, onTyping }: { target: ReportTarget; userId?: string; blocked?: boolean; cafe?: Connection; account?: boolean; onTyping?: (value: boolean) => void }) {
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef<{ id: string; resolve: (result: SafetyResult) => void; reject: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const active = useRef(false);
  const focused = useRef(false);
  const typingCallback = useRef(onTyping);
  typingCallback.current = onTyping;
  useEffect(() => () => { if (focused.current) typingCallback.current?.(false); }, []);
  useEffect(() => {
    if (!cafe) return;
    const remove = cafe.onMessage<SafetyResult>('safety:result', result => { const current = pending.current; if (current?.id === result.requestId) { clearTimeout(current.timer); pending.current = null; current.resolve(result); } });
    return () => { remove(); if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(); pending.current = null; } };
  }, [cafe]);
  async function perform(action: 'block' | 'unblock' | 'report') {
    if (active.current) return;
    active.current = true; setBusy(true); setNotice('');
    try {
      let result: SafetyResult;
      if (cafe) {
        if (!cafe.connection.isOpen) throw new Error();
        const requestId = crypto.randomUUID();
        const response = new Promise<SafetyResult>((resolve, reject) => { pending.current = { id: requestId, resolve, reject: () => reject(new Error()), timer: setTimeout(() => { pending.current = null; reject(new Error()); }, 25000) }; });
        try { cafe.send('safety:action', { requestId, action, target, reason, details }); }
        catch { if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(); pending.current = null; } }
        result = await response;
        if (result.error) throw new Error(result.error);
      } else {
        result = action === 'report'
          ? await roomRequest('/api/safety/reports', 'POST', { target, reason, details })
          : await roomRequest('/api/safety/blocks', action === 'block' ? 'POST' : 'DELETE', { userId });
      }
      setNotice(result.notice ?? 'Готово.');
      if (action === 'report') { setReport(false); setDetails(''); focused.current = false; onTyping?.(false); }
      else notifySafetyChanged();
    } catch (error) { setNotice(error instanceof Error && cafe ? error.message || 'Нет связи. Повторите попытку.' : failureText(error)); }
    finally { active.current = false; setBusy(false); }
  }
  return <div className="safety-actions">
    {(userId || cafe) && <button disabled={busy} onClick={() => void perform(blocked ? 'unblock' : 'block')}>{blocked ? 'Снять блокировку' : account ? 'Заблокировать' : 'Скрыть на время посещения'}</button>}
    <button disabled={busy} onClick={() => { if (report) { focused.current = false; onTyping?.(false); } setReport(!report); setNotice(''); }}>Пожаловаться</button>
    {report && (account ? <form onSubmit={event => { event.preventDefault(); void perform('report'); }} onFocusCapture={() => { focused.current = true; onTyping?.(true); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { focused.current = false; onTyping?.(false); } }}>
      <label>Причина<select value={reason} onChange={event => setReason(event.target.value as ReportReason)}>{Object.entries(REPORT_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Подробности<textarea maxLength={2000} rows={2} value={details} onChange={event => setDetails(event.target.value)} /></label>
      <button disabled={busy}>{busy ? 'Отправляем…' : 'Отправить жалобу'}</button><button type="button" onClick={() => { setReport(false); focused.current = false; onTyping?.(false); }}>Отмена</button>
    </form> : <p>Для отправки жалобы <a href="/">войдите в аккаунт</a> и посетите Café с профилем.</p>)}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
