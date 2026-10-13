'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CAMPUS_ROOMS, type CampusRoomId } from '@/shared/campus-map';

export default function CampusMap({ current, onOpenChange }: { current: CampusRoomId; onOpenChange?: (open: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const onChange = useRef(onOpenChange);
  useEffect(() => { onChange.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
    onChange.current?.(open);
  }, [open]);
  return <>
    <button ref={trigger} onClick={() => setOpen(true)}>Карта кампуса</button>
    <dialog ref={dialog} className="campus-map" aria-labelledby="campus-map-title" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <header><div><h2 id="campus-map-title">Карта кампуса</h2><p>Выберите комнату для перехода.</p></div><button autoFocus onClick={() => setOpen(false)} aria-label="Закрыть карту">×</button></header>
      <nav className="campus-map-grid" aria-label="Комнаты кампуса">{CAMPUS_ROOMS.map(room => <Link key={room.id} href={room.href} aria-current={current === room.id ? 'location' : undefined} onClick={() => setOpen(false)}>
        <strong>{room.name}</strong><span>{room.detail}</span><small>{current === room.id ? 'Вы здесь' : room.id === 'cafe' ? 'Открыть Café' : 'Открыть макет'}</small>
      </Link>)}</nav>
      <p>Библиотека, клубы, игровая и сад пока пустые. Их содержимое появится позже.</p>
    </dialog>
  </>;
}
