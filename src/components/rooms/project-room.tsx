'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectDetail, ProjectMessage, ProjectRoom } from '@/shared/project-rooms';
import { failureText, roomRequest, RoomRequestError, useRoomAccount } from './room-client';

function mergeMessages(existing: ProjectMessage[], incoming: ProjectMessage[]) {
  return [...new Map([...existing, ...incoming].map(message => [message.id, message])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export default function ProjectRoomPage({ id }: { id: string }) {
  const { user, ready } = useRoomAccount();
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState('');
  const [messageId, setMessageId] = useState('');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const generation = useRef(0);
  const pendingLoad = useRef<number | null>(null);
  const actionAbort = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const hasDetail = useRef(false);
  const userId = user?.id;
  const owner = detail?.room.owner_id === userId;

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite');
    setInviteToken(token && /^[A-Za-z0-9_-]{32}$/.test(token) ? token : '');
  }, [id]);

  const load = useCallback(async (initial = false) => {
    if (!userId || pendingLoad.current === generation.current) return;
    const current = generation.current;
    pendingLoad.current = current;
    try {
      const result = await roomRequest<ProjectDetail>(`/api/rooms/${id}`);
      if (current !== generation.current) return;
      setDetail(previous => previous ? { ...result, messages: mergeMessages(previous.messages, result.messages) } : result);
      if (!hasDetail.current) setHasOlder(result.hasOlder);
      hasDetail.current = true;
      setError('');
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof RoomRequestError && [401, 403, 404].includes(error.status)) { setDetail(null); hasDetail.current = false; }
      setError(failureText(error));
    } finally { if (pendingLoad.current === current) pendingLoad.current = null; if (current === generation.current) setLoading(false); }
  }, [id, userId]);

  useEffect(() => {
    generation.current++; setDetail(null); hasDetail.current = false; setLoading(Boolean(userId)); setError(''); setInviteUrl(''); setDraft(''); setMessageId('');
    pendingLoad.current = null; actionAbort.current?.abort();
    if (!userId) return;
    void load(true);
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 15000);
    const focus = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', focus); window.addEventListener('online', focus);
    return () => { generation.current++; actionAbort.current?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', focus); window.removeEventListener('online', focus); };
  }, [load, userId]);

  useEffect(() => {
    if (!userId || !detail) return;
    let disposed = false; let cleanup = () => {}; let timer: ReturnType<typeof setTimeout> | undefined;
    void import('@/lib/supabase/browser').then(({ getSupabaseBrowser }) => {
      if (disposed) return;
      const client = getSupabaseBrowser();
      const update = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { if (!disposed) void load(); }, 150); };
      const channel = client.channel(`project-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'project_messages', filter: `room_id=eq.${id}` }, update)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_links', filter: `room_id=eq.${id}` }, update)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members', filter: `room_id=eq.${id}` }, update)
        .subscribe(status => { if (!disposed) setLive(status === 'SUBSCRIBED'); });
      cleanup = () => { void client.removeChannel(channel); };
    }).catch(() => setLive(false));
    return () => { disposed = true; if (timer) clearTimeout(timer); cleanup(); setLive(false); };
  }, [id, userId, Boolean(detail), load]);

  useEffect(() => {
    if (!detail || !inviteToken) return;
    if (owner) setInviteUrl(`${window.location.origin}/rooms/${id}?invite=${inviteToken}`);
    window.history.replaceState(null, '', `/rooms/${id}`);
    setInviteToken('');
  }, [detail, owner, id, inviteToken]);
  useEffect(() => { if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [detail?.messages]);

  async function action(key: string, execute: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; actionAbort.current = new AbortController();
    const current = generation.current;
    setBusy(key); setError(''); setNotice('');
    try { await execute(); } catch (error) { if (current === generation.current) setError(failureText(error)); }
    finally { busyRef.current = false; setBusy(''); }
  }
  function mutate<T>(path: string, method: string, input?: unknown) { return roomRequest<T>(path, method, input, actionAbort.current?.signal); }
  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    const key = messageId || crypto.randomUUID();
    setMessageId(key);
    void action('message', async () => {
      const result = await mutate<{ message: ProjectMessage }>(`/api/rooms/${id}/messages`, 'POST', { id: key, content: draft });
      setDetail(previous => previous ? { ...previous, messages: mergeMessages(previous.messages, [result.message]) } : previous);
      setDraft(''); setMessageId(''); follow.current = true;
    });
  }
  async function older() {
    const first = detail?.messages[0]; if (!first) return;
    const element = log.current; const height = element?.scrollHeight ?? 0; const top = element?.scrollTop ?? 0;
    follow.current = false;
    const result = await mutate<{ messages: ProjectMessage[]; hasOlder: boolean }>(`/api/rooms/${id}/messages?before=${encodeURIComponent(first.created_at)}&beforeId=${first.id}`, 'GET');
    setDetail(previous => previous ? { ...previous, messages: mergeMessages(previous.messages, result.messages) } : previous);
    setHasOlder(result.hasOlder);
    requestAnimationFrame(() => { if (element) element.scrollTop = top + element.scrollHeight - height; });
  }
  async function rotate() {
    const result = await mutate<{ inviteToken: string }>(`/api/rooms/${id}`, 'PATCH', { rotateInvite: true });
    setInviteUrl(`${window.location.origin}/rooms/${id}?invite=${result.inviteToken}`);
    setNotice('Новая ссылка готова. Предыдущие приглашения больше не действуют. Участники сохраняют доступ.');
  }
  async function copy(invitation = false) {
    try { await navigator.clipboard.writeText(invitation ? inviteUrl : `${window.location.origin}/rooms/${id}`); setNotice('Ссылка скопирована.'); }
    catch { setNotice('Скопируйте ссылку из поля ниже.'); }
  }
  async function removeMember(target: string) {
    await mutate(`/api/rooms/${id}/members`, 'DELETE', { userId: target });
    if (target === userId) router.push('/rooms'); else { await load(true); setNotice('Участник удалён. Создайте новую ссылку-приглашение, чтобы он не мог вернуться по старой.'); }
  }
  const loginNext = `/rooms/${id}${inviteToken ? `?invite=${inviteToken}` : ''}`;

  return <main className="project-page">
    <nav><Link href="/rooms">Мои комнаты</Link><Link href="/cafe">Café</Link><Link href="/">Профиль</Link></nav>
    {!ready ? <p role="status">Проверяем вход…</p> : !user ? <><h1>Комната проекта</h1><p><Link href={`/?next=${encodeURIComponent(loginNext)}`}>Войдите или зарегистрируйтесь</Link>, чтобы продолжить.</p></> : <>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {loading && !detail ? <p role="status">Загружаем комнату…</p> : !detail ? <>
        <h1>Комната проекта</h1>{inviteToken ? <><p>По этой ссылке можно вступить в команду. Переписка станет доступна после вступления.</p><button disabled={Boolean(busy)} onClick={() => void action('join', async () => { await mutate(`/api/rooms/${id}/join`, 'POST', { inviteToken }); await load(true); })}>{busy === 'join' ? 'Вступаем…' : 'Вступить в комнату'}</button></> : <p>Для вступления попросите ссылку-приглашение у создателя комнаты.</p>}
        <button disabled={Boolean(busy)} onClick={() => void load(true)}>Повторить загрузку</button>
      </> : <>
        <header><h1>{detail.room.name}</h1><p>{detail.room.description || 'Описание пока не добавлено.'}</p></header>
        <div className="project-actions"><button onClick={() => void copy()}>Скопировать ссылку на комнату</button><button onClick={() => void load(true)}>Обновить</button>{!owner && <button disabled={Boolean(busy)} onClick={() => void action('leave', () => removeMember(user.id))}>Покинуть комнату</button>}</div>
        {owner && <details className="room-settings"><summary>Управление комнатой</summary>
          <button disabled={Boolean(busy)} onClick={() => void action('invite', rotate)}>Создать новую ссылку-приглашение</button>
          {inviteUrl && <label>Приглашение для новых участников<input readOnly value={inviteUrl} onFocus={event => event.target.select()} /><button onClick={() => void copy(true)}>Скопировать приглашение</button></label>}
          <button onClick={() => { setEditing(!editing); setEditName(detail.room.name); setEditDescription(detail.room.description); }}>Изменить название и описание</button>
          {editing && <form onSubmit={event => { event.preventDefault(); void action('edit', async () => { const result = await mutate<{ room: ProjectRoom }>(`/api/rooms/${id}`, 'PATCH', { name: editName, description: editDescription }); setDetail(previous => previous ? { ...previous, room: result.room } : previous); setEditing(false); }); }}>
            <label>Название<input required maxLength={80} value={editName} onChange={event => setEditName(event.target.value)} /></label><label>Описание<textarea maxLength={1000} value={editDescription} onChange={event => setEditDescription(event.target.value)} /></label><button disabled={Boolean(busy)}>Сохранить</button>
          </form>}
        </details>}
        <div className="project-grid"><section className="project-conversation"><h2>Переписка</h2><small>{live ? 'Обновляется в реальном времени' : 'Обновляется автоматически каждые 15 секунд'}</small>
          {hasOlder && <button disabled={Boolean(busy)} onClick={() => void action('older', older)}>Показать более ранние сообщения</button>}
          <div ref={log} className="project-messages" role="log" aria-label="Переписка проекта" aria-live="polite" aria-relevant="additions" onScroll={() => { const element = log.current; if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40; }}>
            {!detail.messages.length && <p>Начните обсуждение проекта.</p>}
            {detail.messages.map(message => <article key={message.id}><header><strong>{message.author_avatar} {message.author_name}{message.author_id === user.id ? ' (вы)' : ''}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></header><p>{message.content}</p></article>)}
          </div>
          <form onSubmit={send} className="project-message-form"><label>Сообщение<textarea rows={3} value={draft} disabled={Boolean(busy)} maxLength={2000} onChange={event => { setDraft(event.target.value); if (messageId) setMessageId(''); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} /></label><small>{draft.length}/2000 · Enter — отправить, Shift+Enter — новая строка</small><button disabled={Boolean(busy) || !draft.trim()}>{busy === 'message' ? 'Отправляем…' : 'Отправить'}</button></form>
        </section><div>
          <section><h2>Участники · {detail.members.length}</h2><ul className="project-members">{detail.members.map(member => <li key={member.user_id}>{member.avatar} {member.name}{member.user_id === user.id ? ' (вы)' : ''}{member.user_id === detail.room.owner_id ? ' · создатель' : ''}{owner && member.user_id !== user.id && <button disabled={Boolean(busy)} onClick={() => void action('remove', () => removeMember(member.user_id))}>Убрать из комнаты</button>}</li>)}</ul></section>
          <section><h2>Материалы</h2><ul className="project-links">{detail.links.map(link => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a><small>{link.url}</small>{(owner || link.added_by === user.id) && <button disabled={Boolean(busy)} onClick={() => void action('delete-link', async () => { await mutate(`/api/rooms/${id}/links`, 'DELETE', { id: link.id }); await load(true); })}>Удалить ссылку</button>}</li>)}</ul>
            <form onSubmit={event => { event.preventDefault(); void action('link', async () => { await mutate(`/api/rooms/${id}/links`, 'POST', { label, url }); setLabel(''); setUrl(''); await load(true); }); }}><fieldset disabled={Boolean(busy)} className="form-fields"><label>Название материала<input required maxLength={80} value={label} onChange={event => setLabel(event.target.value)} /></label><label>Ссылка<input type="url" required maxLength={1800} placeholder="https://github.com/…" value={url} onChange={event => setUrl(event.target.value)} /></label><button>Добавить материал</button></fieldset></form>
          </section>
        </div></div>
      </>}
    </>}
  </main>;
}
