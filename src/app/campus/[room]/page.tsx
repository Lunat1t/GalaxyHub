import { notFound } from 'next/navigation';
import Campus from '@/components/campus/campus';
import { CAMPUS_ROOMS, type PrototypeRoomId } from '@/shared/campus-map';
export function generateStaticParams() { return CAMPUS_ROOMS.filter(room => room.id !== 'cafe').map(room => ({ room: room.id })); }
export default async function CampusPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!CAMPUS_ROOMS.some(item => item.id === room && item.id !== 'cafe')) notFound();
  return <Campus room={room as PrototypeRoomId} />;
}
