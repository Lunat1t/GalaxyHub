import { advancePlayer } from './cafe-map';

// Fixed input steps + server acknowledgements, inspired by Colyseus' Phaser
// Part4 tutorial. Implementation adds replay, collision and bounded queues.
export const MOVEMENT_STEP_MS = 1000 / 60;
export const MOVEMENT_BATCH_MS = 50;
export const MAX_PENDING_STEPS = 180;
export type MovementFrame = { seq: number; x: number; y: number };
export type Position = { x: number; y: number };

export function movementStep(position: Position, input: Position): Position {
  const next = advancePlayer(position, input, MOVEMENT_STEP_MS);
  // Match the float32 coordinates sent in the Colyseus schema on every step.
  return { x: Math.fround(next.x), y: Math.fround(next.y) };
}

export class MovementPrediction {
  position: Position;
  private sequence = 0;
  private acknowledged = 0;
  private pending: MovementFrame[] = [];

  constructor(position: Position) { this.position = { ...position }; }

  step(input: Position): MovementFrame | null {
    if (this.pending.length >= MAX_PENDING_STEPS) return null;
    const frame = { seq: ++this.sequence, x: input.x, y: input.y };
    this.pending.push(frame);
    this.position = movementStep(this.position, frame);
    return frame;
  }

  reconcile(position: Position, sequence: number) {
    if (!Number.isSafeInteger(sequence) || sequence < this.acknowledged || sequence > this.sequence) return;
    this.acknowledged = sequence;
    this.pending = this.pending.filter(frame => frame.seq > sequence);
    let replayed = { x: position.x, y: position.y };
    for (const frame of this.pending) replayed = movementStep(replayed, frame);
    this.position = replayed;
  }
}
