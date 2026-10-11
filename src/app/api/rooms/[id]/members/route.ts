import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, reply, RoomFailure, roomError, roomId } from '@/lib/project-rooms';
import { UUID_PATTERN } from '@/shared/project-rooms';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = roomId((await context.params).id);
    const input = await body(request);
    if (typeof input.userId !== 'string' || !UUID_PATTERN.test(input.userId)) throw new RoomFailure(400, 'Участник не найден.');
    const { client } = await accountForRoom();
    const result = await client.from('project_members').delete().eq('room_id', id).eq('user_id', input.userId).select('user_id');
    databaseError(result.error);
    if (!result.data?.length) throw new RoomFailure(403, 'Нельзя удалить этого участника. Создатель остаётся в комнате.');
    return reply({ removed: true });
  } catch (error) { return roomError(error); }
}
