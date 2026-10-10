export const CAFE_WIDTH = 800;
export const CAFE_HEIGHT = 544;
export const PLAYER_RADIUS = 12;
export const WALK_SPEED = 150;
export const PLAYER_COLORS = [0x5577bb, 0xa5596c, 0x549071, 0xa17945, 0x8067ab, 0x398c9a];
export const TABLES = [
  { x: 192, y: 260, width: 96, height: 64, name: 'Стол 1' },
  { x: 352, y: 176, width: 96, height: 64, name: 'Стол 2' },
  { x: 544, y: 260, width: 96, height: 64, name: 'Стол 3' },
];
export const COUNTER = { x: 480, y: 80, width: 256, height: 64 };
export const OBSTACLES = [COUNTER, ...TABLES];
export function canStandAt(x: number, y: number): boolean {
  const radius = PLAYER_RADIUS;
  if (x < 32 + radius || x > CAFE_WIDTH - 32 - radius || y < 64 + radius || y > CAFE_HEIGHT - 32 - radius) return false;
  return !OBSTACLES.some(rect => x > rect.x - radius && x < rect.x + rect.width + radius && y > rect.y - radius && y < rect.y + rect.height + radius);
}
