export type AvatarDirection = 'front' | 'left' | 'right' | 'back';

/** Presentation only. None of these offsets belong in the room's world state. */
export type FootPose = { travel: number; lift: number };

export type AvatarPose = {
  feet: readonly [FootPose, FootPose];
  direction: AvatarDirection;
  frameIndex: number;
  /** Includes the short fade to rest after world movement has stopped. */
  moving: boolean;
  blink: boolean;
  offsetX: number;
  offsetY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

const PIXELS_PER_FRAME = 6; // 48 world pixels per complete stride.
// Rendering can run faster than the world's fixed simulation tick.
const STILL_GRACE_MS = 40;
const SETTLE_MS = 160;
const TELEPORT_DISTANCE = 48;
const TAU = Math.PI * 2;

/** Distance drives the feet; elapsed time drives quiet secondary motion. */
export class AvatarMotion {
  private x?: number;
  private y?: number;
  private direction: AvatarDirection = 'front';
  private phase = 0;
  private clock = 0;
  private settled = true;
  private stillElapsed = 0;
  private lastHorizontal = 0;
  private settleElapsed = 0;
  private strideWeight = 0;
  private stopWeight = 0;
  private randomState: number;
  private blinkAt: number;
  private offsetX = 0;
  private offsetY = 0;
  private rotation = 0;
  private scaleX = 1;
  private scaleY = 1;
  private readonly breathPhase: number;

  constructor(seed = 0) {
    this.randomState = Number.isFinite(seed) ? seed >>> 0 : 0;
    this.breathPhase = this.random() * TAU;
    this.blinkAt = 3000 + this.random() * 3500;
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  update(x: number, y: number, deltaMs: number, reducedMotion = false): AvatarPose {
    const valid = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(deltaMs) && deltaMs > 0;
    const dt = valid ? Math.min(deltaMs, 100) : 0;
    this.clock += dt;
    let walking = false;
    let horizontal = this.lastHorizontal;

    if (valid) {
      const dx = this.x === undefined ? 0 : x - this.x;
      const dy = this.y === undefined ? 0 : y - this.y;
      const distance = Math.hypot(dx, dy);
      const initial = this.x === undefined;
      this.x = x;
      this.y = y;
      // Reconnects, tab resumes and correction teleports are not giant footsteps.
      if (initial || distance > TELEPORT_DISTANCE || deltaMs > 250) {
        this.phase = 0;
        this.settled = true;
        this.settleElapsed = 0;
        this.stillElapsed = 0;
        this.lastHorizontal = horizontal = 0;
      } else if (distance > .01) {
        walking = true;
        this.lastHorizontal = horizontal = dx / distance;
        this.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
        this.phase = (this.phase + distance / PIXELS_PER_FRAME) % 8;
        this.settled = false;
        this.settleElapsed = 0;
        this.stillElapsed = 0;
      } else if (!this.settled) {
        this.stillElapsed += dt;
        // Do not inject extra gait phase into render frames between simulation ticks.
        // Keep the last lean too, instead of pulsing it toward zero on those frames.
        if (this.stillElapsed > STILL_GRACE_MS) {
          if (this.settleElapsed === 0) this.stopWeight = this.strideWeight;
          this.settleElapsed = Math.min(SETTLE_MS, this.stillElapsed - STILL_GRACE_MS);
          horizontal = this.lastHorizontal * (1 - this.settleElapsed / SETTLE_MS);
          if (this.settleElapsed >= SETTLE_MS - 1e-7) {
            this.phase = 0;
            this.settled = true;
            this.lastHorizontal = horizontal = 0;
          }
        }
      }
    }

    const moving = walking || !this.settled;
    // Fade the limbs back to rest without advancing a stationary character's feet.
    if (this.settleElapsed > 0) {
      const t = this.settleElapsed / SETTLE_MS;
      this.strideWeight = this.stopWeight * (1 - t * t * (3 - 2 * t));
    } else {
      this.strideWeight += ((moving ? 1 : 0) - this.strideWeight) * (1 - Math.exp(-dt / 45));
    }
    if (!moving) this.strideWeight = 0;
    const gait = this.phase * Math.PI / 4;
    const breath = Math.sin(this.clock / 3800 * TAU + this.breathPhase);
    const targetX = moving ? Math.sin(gait) * .18 * this.strideWeight : 0;
    const targetY = moving ? -(1 - Math.cos(gait * 2)) * .22 * this.strideWeight : 0;
    const targetRotation = moving ? (horizontal * .3 + Math.sin(gait) * .15) * this.strideWeight : 0;
    const targetScaleX = moving ? 1 : 1 - breath * .0015;
    const targetScaleY = moving ? 1 : 1 + breath * .004;
    const blend = 1 - Math.exp(-dt / 70);
    this.offsetX += (targetX - this.offsetX) * blend;
    this.offsetY += (targetY - this.offsetY) * blend;
    this.rotation += (targetRotation - this.rotation) * blend;
    this.scaleX += (targetScaleX - this.scaleX) * blend;
    this.scaleY += (targetScaleY - this.scaleY) * blend;

    const blinking = this.clock >= this.blinkAt && this.clock < this.blinkAt + 140;
    if (this.clock >= this.blinkAt + 140) this.blinkAt = this.clock + 3000 + this.random() * 3500;

    const foot = (offset: number): FootPose => {
      const t = (this.phase / 8 + .3 + offset) % 1;
      // The planted foot travels backward at a constant rate. The other foot
      // clears the floor and returns forward with zero vertical speed at contact.
      const stance = t < .5;
      const u = stance ? t * 2 : (t - .5) * 2;
      const travel = stance ? 1 - 2 * u : -1 + 2 * (u * u * (3 - 2 * u));
      return { travel: travel * 12 * this.strideWeight,
        lift: stance ? 0 : Math.sin(Math.PI * u) ** 2 * 3.2 * this.strideWeight };
    };
    return {
      feet: [foot(0), foot(.5)],
      direction: this.direction,
      frameIndex: moving ? Math.floor(this.phase + 1e-8) % 8 : 0,
      moving,
      blink: !reducedMotion && !moving && blinking,
      offsetX: reducedMotion ? 0 : this.offsetX,
      offsetY: reducedMotion ? 0 : this.offsetY,
      rotation: reducedMotion ? 0 : this.rotation,
      scaleX: reducedMotion ? 1 : this.scaleX,
      scaleY: reducedMotion ? 1 : this.scaleY,
    };
  }
}
