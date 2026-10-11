'use client';
import { useEffect, useState } from 'react';
import { roomRequest, failureText } from './rooms/room-client';
import { notifySafetyChanged } from './safety-actions';
import type { UserBlock } from '@/shared/safety';
export default function BlockedUsers({ userId }: { userId: string }) {
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => setAttempt(value => value + 1);
    const storage = (event: StorageEvent) => { if (event.key === 'galaxy-safety-updated') refresh(); };
    setLoading(true); setError('');
    void roomRequest<{ blocks: UserBlock[] }>('/api/safety/blocks', 'GET', undefined, controller.signal).then(data => { if (!controller.signal.aborted) setBlocks(data.blocks); }).catch(error => { if (!controller.signal.aborted) setError(failureText(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    window.addEventListener('galaxy-safety-changed', refresh); window.addEventListener('storage', storage);
    return () => { controller.abort(); window.removeEventListener('galaxy-safety-changed', refresh); window.removeEventListener('storage', storage); };
  }, [userId, attempt]);
  return <section><h2>Заблокированные участники</h2><p>Их профили, сообщения и материалы скрыты для вас. Блокировка не удаляет участника из общей комнаты и не скрывает персонажа на карте.</p>
    {loading ? <p>Загружаем…</p> : <ul>{blocks.map(block => <li key={block.blocked_id}>{block.label} <button disabled={Boolean(busy)} onClick={() => { setBusy(block.blocked_id); void roomRequest('/api/safety/blocks', 'DELETE', { userId: block.blocked_id }).then(() => notifySafetyChanged()).catch(error => setError(failureText(error))).finally(() => setBusy('')); }}>Снять блокировку</button></li>)}</ul>}
    {!loading && !blocks.length && <p>Блокировок нет.</p>}{error && <p role="alert">{error}</p>}<button disabled={loading} onClick={() => setAttempt(value => value + 1)}>Обновить список</button>
  </section>;
}
