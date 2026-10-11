'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS } from '@/shared/cafe-map';
import { supabaseConfig } from '@/lib/supabase/config';
import { PROFILE_COLUMNS, type Profile } from '@/lib/profiles';
import { preloadCafe } from './load-cafe';

const CafeWorld = dynamic(() => import('./cafe-world'), { ssr: false, loading: () => <p role="status">Загружаем Café…</p> });
async function supabaseClient() {
  const { getSupabaseBrowser } = await import('@/lib/supabase/browser');
  return getSupabaseBrowser();
}
export default function Cafe() {
  const [name, setName] = useState('');
  const [color, setColor] = useState(0);
  const [joined, setJoined] = useState<'guest' | 'account' | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const configured = Boolean(supabaseConfig());

  useEffect(() => {
    if (!configured) { setReady(true); return; }
    let alive = true;
    let unsubscribe = () => {};
    void supabaseClient().then(client => {
      if (!alive) return;
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!alive) return;
        const id = session?.user.id ?? null;
        if (id !== userRef.current && userRef.current) setJoined(null);
        if (event === 'SIGNED_OUT') setJoined(previous => previous === 'account' ? null : previous);
        userRef.current = id; setUserId(id); setReady(true);
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch(() => { if (alive) { setError('Не удалось проверить вход. Обновите страницу.'); setReady(true); } });
    return () => { alive = false; unsubscribe(); };
  }, [configured]);

  useEffect(() => {
    setProfile(null); setError('');
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const client = await supabaseClient();
        const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
        if (!alive) return;
        if (error || !data) setError('Не удалось загрузить профиль. Повторите загрузку или войдите заново.');
        else setProfile(data as Profile);
      } catch { if (alive) setError('Нет связи с Supabase. Повторите загрузку.'); }
    })();
    return () => { alive = false; };
  }, [userId, refresh]);

  useEffect(() => {
    const update = (event: StorageEvent) => { if (event.key === 'galaxy-profile-updated') setRefresh(value => value + 1); };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setName(name.trim()); setJoined('guest');
  }
  return <main className={joined ? 'cafe-page cafe-page-playing' : 'cafe-page'}>
    {!joined && <><nav><a href="/">Вход и профиль</a></nav>
    <h1>Café</h1><p>Войдите с сохранённым профилем или посетите Café как гость.</p></>}
    {!joined ? <>
      <section><h2>Вход с аккаунтом</h2>
        {!ready ? <p role="status">Проверяем вход…</p> : !userId ? <p><a href="/">Войти или зарегистрироваться</a></p> : profile ? <>
          <p>{profile.avatar} <strong>{profile.name}</strong></p>
          <p>{profile.visible ? 'Ваше имя и аватар будут видны в Café.' : 'Профиль скрыт: в Café и чате вы будете под нейтральным именем. Сам персонаж остаётся виден.'}</p>
          <button onPointerEnter={preloadCafe} onFocus={preloadCafe} onClick={() => { preloadCafe(); setJoined('account'); }}>Войти с профилем</button>
        </> : <><p role={error ? 'alert' : 'status'}>{error || 'Загружаем профиль…'}</p>{error && <button onClick={() => setRefresh(value => value + 1)}>Повторить загрузку</button>}</>}
      </section>
      <section><h2>Гостевой вход</h2><form onSubmit={enter} onFocus={preloadCafe}>
      <label>Имя гостя<input required maxLength={24} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} /></label>
      <fieldset><legend>Цвет аватара</legend><div className="avatars">{PLAYER_COLORS.map((value, index) => <label key={value}>
        <input type="radio" name="color" checked={index === color} onChange={() => setColor(index)} /><span className="avatar-color" style={{ backgroundColor: `#${value.toString(16).padStart(6, '0')}` }} aria-label={`Цвет ${index + 1}`} />
      </label>)}</div></fieldset>
      <button type="submit">Войти в Café</button>
    </form></section></> : <CafeWorld name={joined === 'account' ? 'Участник' : name} color={color} useAccount={joined === 'account'} onLeave={() => setJoined(null)} />}
  </main>;
}
