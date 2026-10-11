import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, reply, RoomFailure, roomError, roomId, text } from '@/lib/project-rooms';
import { LINK_COLUMNS, UUID_PATTERN } from '@/shared/project-rooms';
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const id = roomId((await context.params).id);
    const input = await body(request);
    const url = text(input.url, 1800, 'Ссылка');
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); }
    catch { throw new RoomFailure(400, 'Введите ссылку http:// или https:// без логина и пароля.'); }
    const { client, user } = await accountForRoom();
    const count = await client.from('project_links').select('id', { count: 'exact', head: true }).eq('room_id', id);
    databaseError(count.error);
    if ((count.count ?? 0) >= 100) throw new RoomFailure(400, 'В комнате уже 100 ссылок. Удалите ненужные.');
    const result = await client.from('project_links').insert({ room_id: id, added_by: user.id, label: text(input.label, 80, 'Название ссылки'), url }).select(LINK_COLUMNS).single();
    databaseError(result.error);
    return reply({ link: result.data }, 201);
  } catch (error) { return roomError(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const id = roomId((await context.params).id);
    const input = await body(request);
    if (typeof input.id !== 'string' || !UUID_PATTERN.test(input.id)) throw new RoomFailure(400, 'Ссылка не найдена.');
    const { client } = await accountForRoom();
    const result = await client.from('project_links').delete().eq('room_id', id).eq('id', input.id).select('id');
    databaseError(result.error);
    if (!result.data?.length) throw new RoomFailure(403, 'Удалить ссылку может её автор или создатель комнаты.');
    return reply({ removed: true });
  } catch (error) { return roomError(error); }
}
