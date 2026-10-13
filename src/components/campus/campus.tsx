'use client';
import dynamic from 'next/dynamic';
import type { PrototypeRoomId } from '@/shared/campus-map';
const CampusWorld = dynamic(() => import('./campus-world'), { ssr: false, loading: () => <p role="status">Открываем кампус…</p> });
export default function Campus({ room }: { room: PrototypeRoomId }) { return <main className="cafe-page-playing"><CampusWorld key={room} room={room} /></main>; }
