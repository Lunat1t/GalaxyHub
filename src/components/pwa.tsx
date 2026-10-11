'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
        const announce = () => { if (registration.waiting) window.dispatchEvent(new Event('galaxy-update-ready')); };
        announce();
        registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', announce));
      }).catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [update, setUpdate] = useState(false);
  const [ios, setIos] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setIos(!installed && /iPad|iPhone|iPod/.test(navigator.userAgent));
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const clear = () => setPrompt(null);
    const available = () => setUpdate(true);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', clear);
    window.addEventListener('galaxy-update-ready', available);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration().then(registration => { if (registration?.waiting) setUpdate(true); }).catch(() => {});
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', clear); window.removeEventListener('galaxy-update-ready', available); };
  }, []);
  async function install() {
    if (!prompt) return;
    try { setError(''); await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    catch { setError('Не удалось открыть установку. Попробуйте снова.'); }
  }
  async function refresh() {
    try {
    setError('');
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.waiting) { window.location.reload(); return; }
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    registration.waiting.postMessage('SKIP_WAITING');
    } catch { setError('Не удалось обновить приложение. Обновите страницу вручную.'); }
  }
  return <div className="pwa-actions">
    {prompt && <button onClick={() => void install()}>Установить Galaxy Hub</button>}
    {update && <button onClick={() => void refresh()}>Обновить приложение</button>}
    {ios && <small>На iPhone: «Поделиться» → «На экран Домой».</small>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
