import { createClient } from '@supabase/supabase-js';
import { ServerError } from '@colyseus/core';
import { supabaseConfig } from '../lib/supabase/config';
import { supabaseServerFetch } from '../lib/supabase/server-fetch';
import { AVATARS } from '../lib/profiles';

export type CafeIdentity = { account: boolean; userId?: string; name?: string; avatar?: string; color?: number; visible?: boolean; expiresAt?: number; accessToken?: string; blockedIds?: string[] };

export function cafeAccountClient(token: string) {
  const config = supabaseConfig();
  if (!config) throw new ServerError(503, 'Нет связи с Supabase.');
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: supabaseServerFetch, headers: { Authorization: `Bearer ${token}` } } });
}

export async function authenticateCafe(token: unknown): Promise<CafeIdentity> {
  if (token === undefined || token === null) return { account: false };
  if (typeof token !== 'string' || token.length > 8192 || !token) throw new ServerError(401, 'Сессия недействительна. Войдите снова.');
  const config = supabaseConfig();
  if (!config) throw new ServerError(503, 'Вход с аккаунтом временно недоступен.');
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: supabaseServerFetch, headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    // Identity is confirmed by Auth, never inferred from client-supplied metadata.
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user || user.is_anonymous) throw new ServerError(401, 'Сессия недействительна. Войдите снова.');
    const [profile, blocks] = await Promise.all([
      client.from('profiles').select('name,avatar,visible').eq('id', user.id).single(),
      client.from('user_blocks').select('blocked_id').eq('blocker_id', user.id),
    ]);
    if (profile.error || !profile.data) throw new ServerError(503, 'Не удалось загрузить профиль. Повторите вход в Café.');
    if (blocks.error) throw new ServerError(503, 'Не удалось загрузить блокировки. Повторите вход в Café.');
    // Read expiry only after the token has been validated by Supabase.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number };
    if (!Number.isFinite(claims.exp) || claims.exp! * 1000 <= Date.now()) throw new ServerError(401, 'Сессия истекла. Войдите снова.');
    const avatarIndex = AVATARS.findIndex(avatar => avatar === profile.data.avatar);
    return { account: true, userId: user.id, name: profile.data.name, avatar: profile.data.avatar, visible: profile.data.visible, color: Math.max(0, avatarIndex), expiresAt: claims.exp! * 1000, accessToken: token, blockedIds: (blocks.data ?? []).map(block => block.blocked_id) };
  } catch (error) {
    if (error instanceof ServerError) throw error;
    throw new ServerError(503, 'Нет связи с Supabase. Повторите вход в Café.');
  }
}
