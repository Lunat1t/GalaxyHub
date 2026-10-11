import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, reply, RoomFailure, roomError, roomId, text } from '@/lib/project-rooms';
import { MESSAGE_COLUMNS, UUID_PATTERN } from '@/shared/project-rooms';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const id = roomId((await context.params).id);
    const before = request.nextUrl.searchParams.get('before');
    const beforeId = request.nextUrl.searchParams.get('beforeId');
    if (!before || !beforeId || !UUID_PATTERN.test(beforeId) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before) || !Number.isFinite(Date.parse(before))) throw new RoomFailure(400, 'Некорректная страница сообщений.');
    const date = before;
    const { client } = await accountForRoom();
    const result = await client.from('project_messages').select(MESSAGE_COLUMNS).eq('room_id', id).or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${beforeId})`).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
    databaseError(result.error);
    return reply({ messages: (result.data ?? []).reverse(), hasOlder: result.data?.length === 50 });
  } catch (error) { return roomError(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const id = roomId((await context.params).id);
    const input = await body(request);
    if (typeof input.id !== 'string' || !UUID_PATTERN.test(input.id)) throw new RoomFailure(400, 'Некорректное сообщение.');
    const content = text(input.content, 2000, 'Сообщение');
    const { client, user } = await accountForRoom();
    const existing = await client.from('project_messages').select(MESSAGE_COLUMNS).eq('id', input.id).eq('room_id', id).eq('author_id', user.id).maybeSingle();
    databaseError(existing.error);
    if (existing.data) return reply({ message: existing.data });
    const result = await client.from('project_messages').insert({ id: input.id, room_id: id, author_id: user.id, content }).select(MESSAGE_COLUMNS).single();
    databaseError(result.error);
    return reply({ message: result.data }, 201);
  } catch (error) { return roomError(error); }
}
