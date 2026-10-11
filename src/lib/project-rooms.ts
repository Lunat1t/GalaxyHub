import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from './supabase/server';
import { UUID_PATTERN } from '@/shared/project-rooms';

export class RoomFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function accountForRoom() {
  const client = await getSupabaseServer();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.is_anonymous) throw new RoomFailure(401, 'Войдите в аккаунт, чтобы открыть комнаты проектов.');
  return { client, user };
}
export function roomId(value: string) {
  if (!UUID_PATTERN.test(value)) throw new RoomFailure(404, 'Комната не найдена.');
  return value;
}
export function invite() {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}
export async function body(request: NextRequest): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin');
  const expected = process.env.SITE_URL ?? new URL(request.url).origin;
  if (origin !== expected) throw new RoomFailure(403, 'Запрос отправлен с другого сайта. Обновите страницу.');
  const raw = await request.text();
  if (raw.length > 12000) throw new RoomFailure(400, 'Слишком большой запрос.');
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new RoomFailure(400, 'Некорректный запрос.'); }
}
export function text(value: unknown, max: number, label: string, required = true) {
  if (typeof value !== 'string') throw new RoomFailure(400, `Проверьте поле «${label}».`);
  const clean = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (clean.length > max || (required && !clean)) throw new RoomFailure(400, `${label}: ${required ? 'от 1 до' : 'до'} ${max} символов.`);
  return clean;
}
export function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
export function roomError(error: unknown) {
  if (error instanceof RoomFailure) return reply({ error: error.message }, error.status);
  return reply({ error: 'Нет связи с комнатой. Повторите попытку.' }, 503);
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === 'P0001') throw new RoomFailure(429, 'Сообщения отправляются слишком часто. Подождите немного.');
  if (error.code === '42501' || error.code === 'PGRST116') throw new RoomFailure(403, 'Нет доступа к этому действию.');
  if (error.code === '23514') throw new RoomFailure(400, 'Проверьте размер данных и лимит комнаты.');
  throw new RoomFailure(503, 'Не удалось сохранить данные. Повторите попытку.');
}
