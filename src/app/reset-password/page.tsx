'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { supabaseConfig } from '@/lib/supabase/config';
import { authErrorMessage } from '@/lib/profiles';

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!supabaseConfig()) { setReady(true); return; }
    let alive = true;
    getSupabaseBrowser().auth.getUser().then(({ data }) => {
      if (alive) { setAllowed(Boolean(data.user)); setReady(true); }
    }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !allowed) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 8 || password !== form.get('confirm')) { setError('Пароли должны совпадать и содержать минимум 8 символов.'); return; }
    setBusy(true); setError('');
    try {
      const client = getSupabaseBrowser();
      const { error } = await client.auth.updateUser({ password });
      if (error) { setError(authErrorMessage(error.code)); return; }
      setSaved(true);
      const { error: logoutError } = await client.auth.signOut({ scope: 'local' });
      if (logoutError) { setError('Пароль изменён, но выйти из аккаунта не удалось. Вернитесь на главную страницу.'); return; }
      window.location.assign('/?password_updated=1');
    } catch { setError('Не удалось выполнить действие. Проверьте соединение.'); }
    finally { setBusy(false); }
  }
  return <main><h1>Новый пароль</h1>
    {!ready ? <p role="status">Проверяем ссылку…</p> : !allowed ? <p>Откройте ссылку из письма для восстановления пароля.</p>
      : saved ? <p role="status">Пароль изменён.</p> : <form onSubmit={save}><fieldset className="form-fields" disabled={busy}>
        <label>Новый пароль<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
        <label>Повторите пароль<input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></label>
        <button type="submit">{busy ? 'Сохраняем…' : 'Сохранить пароль'}</button>
      </fieldset></form>}
    {error && <p className="error" role="alert">{error}</p>}<p><a href="/">На главную</a></p>
  </main>;
}
