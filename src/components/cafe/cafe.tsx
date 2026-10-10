'use client';
import { useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS } from '@/shared/cafe-map';

const CafeWorld = dynamic(() => import('./cafe-world'), { ssr: false, loading: () => <p role="status">Загружаем Café…</p> });
export default function Cafe() {
  const [name, setName] = useState('');
  const [color, setColor] = useState(0);
  const [joined, setJoined] = useState(false);
  function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setName(name.trim()); setJoined(true);
  }
  return <main className="cafe-page">
    <nav><a href="/">Вход и профиль</a></nav>
    <h1>Café</h1><p>Небольшое пространство для встреч. Сейчас доступен гостевой вход.</p>
    {!joined ? <section><h2>Войти в Café</h2><form onSubmit={enter}>
      <label>Имя гостя<input required maxLength={24} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} /></label>
      <fieldset><legend>Цвет аватара</legend><div className="avatars">{PLAYER_COLORS.map((value, index) => <label key={value}>
        <input type="radio" name="color" checked={index === color} onChange={() => setColor(index)} /><span className="avatar-color" style={{ backgroundColor: `#${value.toString(16).padStart(6, '0')}` }} aria-label={`Цвет ${index + 1}`} />
      </label>)}</div></fieldset>
      <button type="submit">Войти в Café</button>
    </form></section> : <>
      <CafeWorld name={name} color={color} />
      <p><button onClick={() => setJoined(false)}>Выйти из Café</button></p>
    </>}
  </main>;
}
