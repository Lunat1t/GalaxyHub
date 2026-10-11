import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, reply, RoomFailure, roomError } from '@/lib/project-rooms';
import { UUID_PATTERN } from '@/shared/project-rooms';

export async function GET() {
  try {
    const { client, user } = await accountForRoom();
    const result = await client.from('user_blocks').select('blocked_id,label,created_at').eq('blocker_id', user.id).order('created_at', { ascending: false });
    databaseError(result.error); return reply({ blocks: result.data ?? [] });
  } catch (error) { return roomError(error); }
}
async function change(request: NextRequest, remove: boolean) {
  try {
    const input = await body(request);
    const { client, user } = await accountForRoom();
    if (typeof input.userId !== 'string' || !UUID_PATTERN.test(input.userId) || input.userId === user.id) throw new RoomFailure(400, 'Выберите другого участника.');
    if (remove) {
      const result = await client.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', input.userId);
      databaseError(result.error);
    } else {
      const existing = await client.from('user_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', input.userId).maybeSingle();
      databaseError(existing.error);
      if (!existing.data) { const result = await client.from('user_blocks').insert({ blocker_id: user.id, blocked_id: input.userId }); if (result.error?.code !== '23505') databaseError(result.error); }
    }
    return reply({ notice: remove ? 'Блокировка снята.' : 'Профиль и сообщения участника скрыты для вас.' });
  } catch (error) { return roomError(error); }
}
export function POST(request: NextRequest) { return change(request, false); }
export function DELETE(request: NextRequest) { return change(request, true); }
