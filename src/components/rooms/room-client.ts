'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase/config';

export class RoomRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function roomRequest<T>(path: string, method = 'GET', input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
    ...(input !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new RoomRequestError(response.status, data.error || 'Не удалось выполнить действие.');
  return data as T;
}
export function failureText(error: unknown): string {
  return error instanceof RoomRequestError ? error.message : 'Нет соединения. Повторите попытку.';
}
export function useRoomAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true; let unsubscribe = () => {};
    if (!supabaseConfig()) { setReady(true); return; }
    void import('@/lib/supabase/browser').then(({ getSupabaseBrowser }) => {
      if (!alive) return;
      const { data: { subscription } } = getSupabaseBrowser().auth.onAuthStateChange((_event, session) => { if (alive) { setUser(session?.user ?? null); setReady(true); } });
      unsubscribe = () => subscription.unsubscribe();
    }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; unsubscribe(); };
  }, []);
  return { user, ready };
}
