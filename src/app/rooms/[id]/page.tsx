import ProjectRoomPage from '@/components/rooms/project-room';
import { UUID_PATTERN } from '@/shared/project-rooms';
import { notFound } from 'next/navigation';
export const metadata = { title: 'Комната проекта — Galaxy Hub', referrer: 'no-referrer' };
export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  return <ProjectRoomPage id={id} />;
}
