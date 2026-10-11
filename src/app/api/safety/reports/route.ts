import type { NextRequest } from 'next/server';
import { accountForRoom, body, reply, RoomFailure, roomError, text } from '@/lib/project-rooms';
import { UUID_PATTERN } from '@/shared/project-rooms';
import { REPORT_REASONS } from '@/shared/safety';

export async function POST(request: NextRequest) {
  try {
    const input = await body(request);
    const { client, user } = await accountForRoom();
    const target = input.target as Record<string, unknown> | undefined;
    if (!target || typeof input.reason !== 'string' || !Object.hasOwn(REPORT_REASONS, input.reason)) throw new RoomFailure(400, 'Выберите причину жалобы.');
    const uuid = (value: unknown) => { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new RoomFailure(400, 'Некорректный адрес жалобы.'); return value; };
    const row: Record<string, unknown> = { reporter_id: user.id, reason: input.reason, details: text(input.details ?? '', 2000, 'Подробности', false), kind: target.kind };
    if (target.kind === 'profile') row.target_user_id = uuid(target.userId);
    else if (target.kind === 'project_message') row.message_id = uuid(target.messageId);
    else if (target.kind === 'project_room') row.room_id = uuid(target.roomId);
    else if (target.kind === 'project_member') { row.room_id = uuid(target.roomId); row.target_user_id = uuid(target.userId); }
    else throw new RoomFailure(400, 'Жалобы на Café отправляются из самой комнаты.');
    const result = await client.from('safety_reports').insert(row);
    if (result.error?.code === '23505') return reply({ notice: 'Жалоба на этот объект уже принята сегодня.' });
    if (result.error?.code === 'P0001') throw new RoomFailure(429, 'Не больше 10 жалоб в час. Попробуйте позже.');
    if (result.error) throw new RoomFailure(result.error.code === '42501' ? 403 : 503, 'Не удалось отправить жалобу. Проверьте доступ и повторите попытку.');
    return reply({ notice: 'Жалоба сохранена для разбора владельцем проекта.' }, 201);
  } catch (error) { return roomError(error); }
}
