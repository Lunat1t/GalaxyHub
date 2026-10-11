import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, reply, RoomFailure, roomError, roomId } from '@/lib/project-rooms';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = roomId((await context.params).id);
    const input = await body(request);
    if (typeof input.inviteToken !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(input.inviteToken)) throw new RoomFailure(400, 'Ссылка-приглашение недействительна.');
    const { client } = await accountForRoom();
    const result = await client.rpc('join_project_room', { room_id: id, invite_token: input.inviteToken });
    if (result.error?.code === '42501') throw new RoomFailure(403, 'Приглашение недействительно или отозвано.');
    databaseError(result.error);
    return reply({ joined: true });
  } catch (error) { return roomError(error); }
}
