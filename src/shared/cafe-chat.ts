import { TABLES } from './cafe-map';

export const CHAT_MAX_LENGTH = 500;
export const CHAT_HISTORY_LIMIT = 60;
export type ChatChannel = 'general' | 'table-1' | 'table-2' | 'table-3';
export type TableChannel = Exclude<ChatChannel, 'general'>;
export type ChatMessage = {
  id: string;
  requestId: string;
  channel: ChatChannel;
  authorId: string;
  authorName: string;
  text: string;
  sentAt: number;
};
export type ChatSync = { channel: TableChannel | null; general: ChatMessage[]; nearby: ChatMessage[] };
export type ChatZone = { channel: TableChannel | null; messages: ChatMessage[] };
export type ChatError = { requestId?: string; message: string };

export function nearbyTable(position: { x: number; y: number }): TableChannel | null {
  const index = TABLES.findIndex(table => Math.hypot(position.x - table.x - table.width / 2, position.y - table.y - table.height / 2) < 94);
  return index < 0 ? null : `table-${index + 1}` as TableChannel;
}

export function channelName(channel: ChatChannel): string {
  return channel === 'general' ? 'Общий чат' : `Стол ${channel.slice(-1)}`;
}
