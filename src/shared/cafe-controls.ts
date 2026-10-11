/** Each finger owns its direction; releasing one keeps the others held. */
export class PointerDirections {
  private held = new Map<number, { x: number; y: number }>();
  press(id: number, direction: { x: number; y: number }) { this.held.set(id, direction); return this.value(); }
  release(id: number) { this.held.delete(id); return this.value(); }
  clear() { this.held.clear(); return this.value(); }
  value() {
    let x = 0, y = 0;
    for (const direction of this.held.values()) { x += direction.x; y += direction.y; }
    return { x: Math.sign(x), y: Math.sign(y) };
  }
}
