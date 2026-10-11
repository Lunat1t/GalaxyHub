'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PwaInstall } from '@/components/pwa';
import type { ProjectRoom } from '@/shared/project-rooms';
import { failureText, roomRequest, useRoomAccount } from './room-client';

export default function Rooms() {
  const { user, ready } = useRoomAccount();
  const router = useRouter();
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setRooms([]); setError('');
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    void roomRequest<{ rooms: ProjectRoom[] }>('/api/rooms', 'GET', undefined, controller.signal).then(data => { if (!controller.signal.aborted) setRooms(data.rooms); })
      .catch(error => { if (!controller.signal.aborted) setError(failureText(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id, attempt]);
  async function create(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await roomRequest<{ room: ProjectRoom; inviteToken: string }>('/api/rooms', 'POST', { name, description });
      router.push(`/rooms/${result.room.id}?invite=${result.inviteToken}`);
    } catch (error) { setError(failureText(error)); }
    finally { setBusy(false); }
  }
  return <main className="rooms-page">
    <nav><Link href="/">Профиль</Link><Link href="/cafe">Café</Link></nav>
    <h1>Комнаты проектов</h1><p>Команда, переписка и материалы в одном месте. Комнату можно открыть по прямой ссылке.</p><PwaInstall />
    {!ready ? <p role="status">Проверяем вход…</p> : !user ? <p><Link href="/?next=%2Frooms">Войти или зарегистрироваться</Link>, чтобы создать комнату или принять приглашение.</p> : <>
      {error && <p className="error" role="alert">{error}</p>}
      <section><h2>Мои комнаты</h2>{loading ? <p role="status">Загружаем комнаты…</p> : rooms.length ? <ul className="rooms-list">{rooms.map(room => <li key={room.id}><Link href={`/rooms/${room.id}`}><strong>{room.name}</strong></Link><p>{room.description || 'Без описания.'}</p></li>)}</ul> : <p>Комнат пока нет. Создайте свою или откройте приглашение от команды.</p>}
        <button disabled={loading} onClick={() => setAttempt(value => value + 1)}>Обновить список</button>
      </section>
      <section><h2>Создать комнату</h2><form onSubmit={create}><fieldset className="form-fields" disabled={busy}>
        <label>Название<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
        <label>Описание<textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} /></label>
        <p>Комната доступна только участникам. Другие люди смогут вступить с аккаунтом по вашей ссылке-приглашению.</p>
        <button>{busy ? 'Создаём…' : 'Создать комнату'}</button>
      </fieldset></form></section>
    </>}
  </main>;
}
