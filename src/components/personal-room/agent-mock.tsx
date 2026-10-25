'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Material = { id: string; title: string; source: string; task: string; addedAt: string };
const STORAGE_KEY = 'galaxy-agent-mock-materials';

export default function AgentMock() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'new' | 'materials'>('new');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [task, setTask] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) setMaterials(stored.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string'));
    } catch { /* A broken draft must not block opening the agent. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(materials)); }
      catch { /* The wireframe still works for the current page session. */ }
    }
  }, [loaded, materials]);

  function addMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const link = url.trim();
    if (!link && !file) { setError('Добавьте ссылку или PDF.'); return; }
    if (link && file) { setError('Для макета отправьте один материал за раз.'); return; }
    let title = file?.name || '';
    if (link) {
      try {
        const parsed = new URL(link);
        if (parsed.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) throw Error();
        title = parsed.hostname + parsed.pathname;
      } catch { setError('Укажите ссылку YouTube с https://.'); return; }
    }
    if (file && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Выберите PDF-файл.'); return; }
    const item = { id: crypto.randomUUID(), title, source: link || 'Локальный PDF: файл не загружен', task: task.trim(), addedAt: new Date().toLocaleString('ru-RU') };
    setMaterials(current => [item, ...current]);
    setSelected(item.id); setTab('materials'); setUrl(''); setFile(null); setTask(''); setError('');
    if (fileInput.current) fileInput.current.value = '';
    setNotice(item.id);
  }

  function removeMaterial(id: string) {
    setMaterials(current => current.filter(item => item.id !== id));
    if (selected === id) setSelected(null);
    if (notice === id) setNotice(null);
  }

  async function pasteLink() {
    try {
      const value = await navigator.clipboard.readText();
      setUrl(value.trim()); setFile(null); setError('');
      if (fileInput.current) fileInput.current.value = '';
    } catch { setError('Буфер обмена недоступен. Вставьте ссылку в поле вручную.'); }
  }

  const active = materials.find(item => item.id === selected);
  return <div className="agent-mock" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setOpen(false); }}>
    {notice && !open && <button className="agent-mock-notice" onClick={() => { setOpen(true); setTab('materials'); setSelected(notice); setNotice(null); }}>
      Макет уведомления: материал добавлен. Открыть агента
    </button>}
    <button className="agent-mock-launcher" aria-expanded={open} aria-controls="agent-mock-panel" onClick={() => { setOpen(value => !value); setNotice(null); }}>
      Агент
    </button>
    {open && <section id="agent-mock-panel" className="agent-mock-panel" aria-label="Макет агента Galaxy">
      <header><strong>Агент Galaxy</strong><button onClick={() => setOpen(false)} aria-label="Закрыть агента">×</button></header>
      <p className="agent-mock-note">Макет интерфейса. Материалы не загружаются и агент пока не выполняет задачи.</p>
      <nav aria-label="Разделы агента"><button aria-current={tab === 'new' ? 'page' : undefined} onClick={() => setTab('new')}>Новая задача</button><button aria-current={tab === 'materials' ? 'page' : undefined} onClick={() => setTab('materials')}>Материалы ({materials.length})</button></nav>
      {tab === 'new' ? <form onSubmit={addMaterial} className="agent-mock-form">
        <label>Ссылка на YouTube<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://youtu.be/…" /></label>
        <button type="button" onClick={() => void pasteLink()}>Вставить из буфера</button>
        <span>или</span>
        <label>PDF-файл<input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
        <label>Задача агенту<textarea value={task} onChange={event => setTask(event.target.value)} rows={3} placeholder="Например: выдели главные идеи и подготовь вопросы" /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Добавить в макет</button>
      </form> : <div className="agent-mock-library">
        {materials.length === 0 ? <p>Вы ещё не добавили материалы.</p> : <ul>{materials.map(item => <li key={item.id}>
          <button onClick={() => setSelected(item.id)} aria-current={selected === item.id ? 'true' : undefined}>{item.title}</button>
          <small>{item.addedAt}</small>
          <button onClick={() => removeMaterial(item.id)} aria-label={`Убрать ${item.title}`}>Убрать</button>
        </li>)}</ul>}
        {active && <article><h3>Материал</h3><p>{active.source}</p><h3>Задача</h3><p>{active.task || 'Задача ещё не задана.'}</p><h3>Будущая Markdown-заметка</h3><pre>{`# ${active.title}\n\n## Выводы\nПосле подключения обработки здесь появится ответ со ссылками на источник.`}</pre></article>}
      </div>}
      <footer>Данные макета хранятся только в этом браузере. PDF-файл не сохраняется.</footer>
    </section>}
  </div>;
}
