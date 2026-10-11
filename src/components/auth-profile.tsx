'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { supabaseConfig } from '@/lib/supabase/config';
import { AVATARS, PROFILE_COLUMNS, authErrorMessage, type Profile } from '@/lib/profiles';

type Screen = 'login' | 'register' | 'forgot';
type Draft = Omit<Profile, 'id' | 'interests'> & { interests: string };
function toDraft(profile: Profile): Draft {
  return { name: profile.name, avatar: profile.avatar, bio: profile.bio, visible: profile.visible, interests: profile.interests.join(', ') };
}

export default function AuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('login');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const emailInput = useRef<HTMLInputElement>(null);
  const configured = Boolean(supabaseConfig());

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has('auth_error')) setError('Ссылка недействительна или истекла. Запросите новое письмо.');
    if (query.has('password_updated')) setNotice('Пароль изменён. Войдите с новым паролем.');
    if (!configured) { setReady(true); return; }
    const client = getSupabaseBrowser();
    let alive = true;
    let authChanged = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      if (alive) { setUser(session?.user ?? null); setReady(true); }
    });
    client.auth.getUser().then(({ data, error: authError }) => {
      if (!alive || authChanged) return;
      setUser(data.user);
      if (authError && authError.name !== 'AuthSessionMissingError') setError(authErrorMessage(authError.code));
      setReady(true);
    }).catch(() => { if (alive) { setError('Не удалось проверить вход. Попробуйте обновить страницу.'); setReady(true); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [configured]);

  const userId = user?.id;
  useEffect(() => {
    setProfile(null); setDraft(null); setPeople([]);
    if (!userId) return;
    let alive = true;
    const client = getSupabaseBrowser();
    async function load() {
      try {
        const [own, list] = await Promise.all([
          client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single(),
          client.from('profiles').select(PROFILE_COLUMNS).eq('visible', true).order('name').limit(100),
        ]);
        if (!alive) return;
        if (own.error || !own.data) { setError('Не удалось загрузить профиль. Проверьте, применена ли миграция profiles в Supabase.'); return; }
        const saved = own.data as Profile;
        setProfile(saved); setDraft(toDraft(saved));
        if (list.error) setError('Не удалось загрузить список участников. Повторите попытку.');
        else setPeople((list.data ?? []) as Profile[]);
      } catch { if (alive) setError('Нет соединения с Supabase. Повторите попытку.'); }
    }
    void load();
    return () => { alive = false; };
  }, [userId, refresh]);

  function changeScreen(next: Screen) { setScreen(next); setError(''); setNotice(''); }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    const password = String(data.get('password') ?? '');
    const name = String(data.get('name') ?? '').trim();
    if (screen === 'register' && (!name || name.length > 50)) { setError('Введите имя: от 1 до 50 символов.'); return; }
    if (screen === 'register' && password !== data.get('confirm')) { setError('Пароли не совпадают.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const client = getSupabaseBrowser();
      const redirect = `${window.location.origin}/auth/callback`;
      if (screen === 'forgot') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${redirect}?next=/reset-password` });
        if (error) { setError(authErrorMessage(error.code)); return; }
        setNotice('Если аккаунт существует, письмо для восстановления отправлено. Проверьте почту.');
      } else if (screen === 'register') {
        const { data: result, error } = await client.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirect } });
        if (error) { setError(authErrorMessage(error.code)); return; }
        if (result.session) { setUser(result.session.user); setNotice('Аккаунт создан. Заполните профиль.'); }
        else setNotice('Проверьте почту и подтвердите email. Если аккаунт уже существует, войдите или восстановите пароль.');
      } else {
        const { data: result, error } = await client.auth.signInWithPassword({ email, password });
        if (error) { setError(authErrorMessage(error.code)); return; }
        setUser(result.user); setNotice('Вы вошли в аккаунт.');
      }
    } catch { setError('Нет соединения с Supabase. Повторите попытку.'); }
    finally { setBusy(false); }
  }

  async function resendConfirmation() {
    const email = emailInput.current?.value.trim();
    if (!email || !emailInput.current?.reportValidity()) { setError('Введите email в форме.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error } = await getSupabaseBrowser().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) setError(authErrorMessage(error.code));
      else setNotice('Если подтверждение требуется, новое письмо отправлено. Проверьте почту.');
    } catch { setError('Не удалось отправить письмо. Попробуйте позже.'); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !draft || busy) return;
    const name = draft.name.trim();
    const interests = [...new Set(draft.interests.split(',').map(value => value.trim()).filter(Boolean))];
    if (!name || name.length > 50) { setError('Введите имя: от 1 до 50 символов.'); return; }
    if (interests.length > 10 || interests.some(value => value.length > 40)) { setError('До 10 интересов, каждый длиной до 40 символов.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const client = getSupabaseBrowser();
      const { data, error } = await client.from('profiles').update({ name, avatar: draft.avatar, bio: draft.bio.trim(), interests, visible: draft.visible }).eq('id', user.id).select(PROFILE_COLUMNS).single();
      if (error || !data) { setError('Не удалось сохранить профиль. Проверьте соединение и повторите попытку.'); return; }
      const saved = data as Profile;
      setProfile(saved); setDraft(toDraft(saved)); setNotice('Профиль сохранён.');
      try { localStorage.setItem('galaxy-profile-updated', String(Date.now())); } catch { /* Storage may be unavailable; the profile is already saved. */ }
      const list = await client.from('profiles').select(PROFILE_COLUMNS).eq('visible', true).order('name').limit(100);
      if (list.error) { setPeople([]); setError('Профиль сохранён, но список участников не обновился. Повторите загрузку.'); }
      else setPeople((list.data ?? []) as Profile[]);
    } catch { setError('Нет соединения с Supabase. Повторите попытку.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      const { error } = await getSupabaseBrowser().auth.signOut({ scope: 'local' });
      if (error) { setError(authErrorMessage(error.code)); return; }
      setUser(null); setProfile(null); setDraft(null); setPeople([]); changeScreen('login');
    } catch { setError('Не удалось выйти. Повторите попытку.'); }
    finally { setBusy(false); }
  }

  return <main>
    <header><h1>Galaxy Hub</h1><p>Вход и профиль</p></header>
    <nav><a href="/cafe">{user ? 'Войти в Café с профилем' : 'Открыть Café'}</a></nav>
    {!configured ? <p role="alert">Подключение Supabase ещё не настроено. Добавьте адрес проекта и публичный ключ в настройки приложения.</p>
      : !ready ? <p role="status">Проверяем вход…</p> : <>
        {user ? <nav aria-label="Аккаунт"><span>{user.email}</span><button disabled={busy} onClick={logout}>Выйти</button></nav>
          : <nav aria-label="Вход и регистрация"><button disabled={busy} aria-pressed={screen === 'login'} onClick={() => changeScreen('login')}>Вход</button><button disabled={busy} aria-pressed={screen === 'register'} onClick={() => changeScreen('register')}>Регистрация</button></nav>}
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!user && <section>
          <h2>{screen === 'register' ? 'Регистрация' : screen === 'forgot' ? 'Восстановление пароля' : 'Вход'}</h2>
          <form key={screen} onSubmit={authenticate}>
            <fieldset disabled={busy} className="form-fields">
              {screen === 'register' && <label>Имя<input name="name" required maxLength={50} autoComplete="nickname" /></label>}
              <label>Email<input ref={emailInput} name="email" type="email" required maxLength={254} autoComplete="email" /></label>
              {screen !== 'forgot' && <label>Пароль<input name="password" type="password" required minLength={screen === 'register' ? 8 : undefined} autoComplete={screen === 'register' ? 'new-password' : 'current-password'} /></label>}
              {screen === 'register' && <><small>Минимум 8 символов.</small><label>Повторите пароль<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label></>}
              <button type="submit">{busy ? 'Подождите…' : screen === 'register' ? 'Создать аккаунт' : screen === 'forgot' ? 'Отправить письмо' : 'Войти'}</button>
            </fieldset>
          </form>
          {screen === 'login' && <button disabled={busy} onClick={() => changeScreen('forgot')}>Забыли пароль?</button>}
          {screen !== 'forgot' && <p><button disabled={busy} onClick={resendConfirmation}>Отправить подтверждение email повторно</button></p>}
          {screen === 'forgot' && <p><button disabled={busy} onClick={() => changeScreen('login')}>Вернуться ко входу</button></p>}
        </section>}
        {user && !profile && <section><p>Профиль загружается. Если возникла ошибка, повторите загрузку.</p><button disabled={busy} onClick={() => { setError(''); setRefresh(value => value + 1); }}>Загрузить профиль</button></section>}
        {user && profile && draft && <>
          <section aria-labelledby="profile-title"><h2 id="profile-title">Мой профиль</h2>
            <form onSubmit={saveProfile}><fieldset disabled={busy} className="form-fields">
              <label>Имя<input required maxLength={50} autoComplete="nickname" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
              <fieldset><legend>Аватар</legend><div className="avatars">{AVATARS.map((avatar, index) => <label key={avatar}><input type="radio" name="avatar" checked={draft.avatar === avatar} onChange={() => setDraft({ ...draft, avatar })} /><span role="img" aria-label={['Человек', 'Разработчица', 'Разработчик', 'Робот', 'Кот', 'Ракета'][index]}>{avatar}</span></label>)}</div></fieldset>
              <label>О себе<textarea rows={3} maxLength={300} value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} /></label>
              <label>Интересы<input maxLength={410} aria-describedby="interests-help" placeholder="Например: TypeScript, игры, музыка" value={draft.interests} onChange={e => setDraft({ ...draft, interests: e.target.value })} /></label><small id="interests-help">Через запятую. До 10 интересов.</small>
              <fieldset><legend>Видимость</legend><label className="checkbox"><input type="checkbox" checked={draft.visible} onChange={e => setDraft({ ...draft, visible: e.target.checked })} />Показывать мой профиль другим участникам</label><p>Скрытый профиль виден только вам. В Café персонаж остаётся виден, но имя и аватар профиля заменяются нейтральными. Ранее отправленные сообщения сохраняют имя на момент отправки. Настройка применяется после сохранения.</p></fieldset>
              <button type="submit">{busy ? 'Сохраняем…' : 'Сохранить профиль'}</button>
            </fieldset></form>
          </section>
          <section><h2>Сохранённый профиль</h2><ProfileCard profile={profile} /><p>Видимость: {profile.visible ? 'виден другим участникам' : 'скрыт от других участников'}.</p></section>
          <section><h2>Участники</h2><p>Показаны до 100 видимых профилей.</p>{people.length ? <ul className="people">{people.map(item => <li key={item.id}><ProfileCard profile={item} /></li>)}</ul> : <p>Видимых участников пока нет.</p>}</section>
        </>}
      </>}
  </main>;
}
function ProfileCard({ profile }: { profile: Profile }) {
  return <article><p><span role="img" aria-label="Аватар">{profile.avatar}</span> <strong>{profile.name}</strong></p><p>{profile.bio || 'Описание пока не заполнено.'}</p><p>Интересы: {profile.interests.join(', ') || 'пока не указаны'}</p></article>;
}
