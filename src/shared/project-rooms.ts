export type ProjectRoom = { id: string; owner_id: string; name: string; description: string; created_at: string; updated_at: string };
export type ProjectMember = { user_id: string; joined_at: string; name: string; avatar: string };
export type ProjectMessage = { id: string; room_id: string; author_id: string | null; author_name: string; author_avatar: string; content: string; created_at: string };
export type ProjectLink = { id: string; room_id: string; added_by: string | null; label: string; url: string; created_at: string };
export type ProjectDetail = { room: ProjectRoom; members: ProjectMember[]; messages: ProjectMessage[]; links: ProjectLink[]; userId: string; hasOlder: boolean };
export const ROOM_COLUMNS = 'id,owner_id,name,description,created_at,updated_at';
export const MESSAGE_COLUMNS = 'id,room_id,author_id,author_name,author_avatar,content,created_at';
export const LINK_COLUMNS = 'id,room_id,added_by,label,url,created_at';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeAuthNext(value: string | null): string {
  if (value === '/rooms' || value === '/cafe' || value === '/reset-password') return value;
  if (value && /^\/rooms\/[0-9a-f-]{36}(?:\?invite=[A-Za-z0-9_-]{32})?$/i.test(value) && UUID_PATTERN.test(value.split('/')[2].split('?')[0])) return value;
  return '/';
}
