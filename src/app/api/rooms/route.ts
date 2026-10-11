import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, invite, reply, roomError, text } from '@/lib/project-rooms';
import { ROOM_COLUMNS } from '@/shared/project-rooms';

export async function GET() {
  try {
    const { client } = await accountForRoom();
    const result = await client.from('project_rooms').select(ROOM_COLUMNS).order('created_at', { ascending: false }).limit(100);
    databaseError(result.error);
    return reply({ rooms: result.data ?? [] });
  } catch (error) { return roomError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const input = await body(request);
    const { client, user } = await accountForRoom();
    const invitation = invite();
    const result = await client.from('project_rooms').insert({ owner_id: user.id, name: text(input.name, 80, 'Название'), description: text(input.description ?? '', 1000, 'Описание', false), invite_hash: invitation.hash }).select(ROOM_COLUMNS).single();
    databaseError(result.error);
    return reply({ room: result.data, inviteToken: invitation.token }, 201);
  } catch (error) { return roomError(error); }
}
