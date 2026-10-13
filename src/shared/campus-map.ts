export const CAMPUS_ROOMS = [
  { id: 'hall', name: 'Центральный холл', detail: 'Место появления', href: '/campus/hall' },
  { id: 'cafe', name: 'Café', detail: 'Встречи и общение', href: '/cafe?from=campus' },
  { id: 'library', name: 'Библиотека', detail: 'Будущие форум и база знаний', href: '/campus/library' },
  { id: 'clubs', name: 'Клубы', detail: 'Будущие сообщества по интересам', href: '/campus/clubs' },
  { id: 'arcade', name: 'Игровая', detail: 'Место для будущих мини-игр', href: '/campus/arcade' },
  { id: 'garden', name: 'Сад', detail: 'Место для отдыха', href: '/campus/garden' },
] as const;
export type CampusRoomId = typeof CAMPUS_ROOMS[number]['id'];
export type PrototypeRoomId = Exclude<CampusRoomId, 'cafe'>;
export const CAMPUS_WIDTH = 800;
export const CAMPUS_HEIGHT = 544;
export const CAMPUS_DOOR = { x: 680, y: 104 };
export function nearCampusDoor(x: number, y: number) { return Math.hypot(x - CAMPUS_DOOR.x, y - CAMPUS_DOOR.y) < 64; }
