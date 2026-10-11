import type { NextRequest } from 'next/server';
import { accountForRoom, body, databaseError, invite, reply, RoomFailure, roomError, roomId, text } from '@/lib/project-rooms';
import { LINK_COLUMNS, MESSAGE_COLUMNS, ROOM_COLUMNS } from '@/shared/project-rooms';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const id = roomId((await context.params).id);
    const { client, user } = await accountForRoom();
    const room = await client.from('project_rooms').select(ROOM_COLUMNS).eq('id', id).maybeSingle();
    databaseError(room.error);
    if (!room.data) throw new RoomFailure(404, 'Комната недоступна. Войдите по ссылке-приглашению.');
    const [members, messages, links] = await Promise.all([
      client.from('project_members').select('user_id,joined_at,profiles(name,avatar,visible)').eq('room_id', id).order('joined_at').limit(50),
      client.from('project_messages').select(MESSAGE_COLUMNS).eq('room_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50),
      client.from('project_links').select(LINK_COLUMNS).eq('room_id', id).order('created_at').limit(100),
    ]);
    for (const result of [members, messages, links]) databaseError(result.error);
    const roster = (members.data ?? []).map(member => {
      const profile = member.profiles as unknown as { name: string; avatar: string; visible: boolean } | null;
      return { user_id: member.user_id, joined_at: member.joined_at, name: profile?.visible || member.user_id === user.id ? profile?.name ?? 'Участник' : 'Участник', avatar: profile?.visible || member.user_id === user.id ? profile?.avatar ?? '' : '' };
    });
    return reply({ room: room.data, members: roster, messages: (messages.data ?? []).reverse(), hasOlder: messages.data?.length === 50, links: links.data ?? [], userId: user.id });
  } catch (error) { return roomError(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const id = roomId((await context.params).id);
    const input = await body(request);
    const { client, user } = await accountForRoom();
    const invitation = input.rotateInvite === true ? invite() : null;
    const updates = invitation ? { invite_hash: invitation.hash } : { name: text(input.name, 80, 'Название'), description: text(input.description ?? '', 1000, 'Описание', false) };
    const result = await client.from('project_rooms').update(updates).eq('id', id).eq('owner_id', user.id).select(ROOM_COLUMNS).maybeSingle();
    databaseError(result.error);
    if (!result.data) throw new RoomFailure(403, 'Изменять комнату может только её создатель.');
    return reply({ room: result.data, ...(invitation ? { inviteToken: invitation.token } : {}) });
  } catch (error) { return roomError(error); }
}
