import assert from 'node:assert/strict';
import { AvatarMotion, type AvatarPose } from '../src/shared/avatar-motion';

function finite(pose: AvatarPose) {
  for (const key of ['frameIndex', 'offsetX', 'offsetY', 'rotation', 'scaleX', 'scaleY'] as const) assert(Number.isFinite(pose[key]), key);
  assert(Number.isInteger(pose.frameIndex) && pose.frameIndex >= 0 && pose.frameIndex <= 7);
  assert(Math.abs(pose.offsetX) < 1 && Math.abs(pose.offsetY) < 1.5);
  assert(Math.abs(pose.rotation) < 2);
  assert(Math.abs(pose.scaleX - 1) < .01 && Math.abs(pose.scaleY - 1) < .01);
}

// The same travel distance produces the same gait at different rendering rates.
for (const fps of [20, 30, 60, 144]) {
  const motion = new AvatarMotion(2);
  motion.update(0, 0, 1000 / fps);
  let pose!: AvatarPose;
  for (let frame = 1; frame <= fps; frame++) {
    pose = motion.update(frame * 150 / fps, 0, 1000 / fps);
    finite(pose);
  }
  assert.equal(pose.direction, 'right');
  // 150 px = ten frames, modulo the eight-frame cycle.
  assert.equal(pose.frameIndex, 2, `Distance cadence at ${fps} fps`);
  assert(pose.moving);
}

// Café updates coordinates at 60 Hz, even on a faster display. Repeated render
// positions must not be mistaken for stops and add synthetic settling frames.
for (const fps of [20, 30, 60, 144, 240]) {
  const sampled = new AvatarMotion(9);
  sampled.update(0, 0, 1000 / fps);
  let pose!: AvatarPose;
  for (let frame = 1; frame <= fps; frame++) {
    const ticks = Math.floor(frame * 60 / fps + 1e-9);
    pose = sampled.update(ticks * 2.5, 0, 1000 / fps);
    finite(pose);
  }
  assert.equal(pose.frameIndex, 2, `Fixed-60-Hz simulation cadence at ${fps} render fps`);
  assert.equal(pose.direction, 'right');
  assert(pose.moving);
  // A real wall/stop still settles after the 40 ms grace plus the final step.
  let stoppedAfter = 0;
  while (pose.moving && stoppedAfter <= 220) {
    pose = sampled.update(150, 0, 1000 / fps);
    stoppedAfter += 1000 / fps;
  }
  assert(!pose.moving && stoppedAfter <= 220, `Blocked avatar settles at ${fps} render fps`);
  assert.equal(pose.frameIndex, 0);
}

const grace = new AvatarMotion(7);
grace.update(0, 0, 10);
let gracePose = grace.update(18, 0, 10);
const graceFrame = gracePose.frameIndex;
const graceLean = gracePose.rotation;
for (let i = 0; i < 3; i++) {
  gracePose = grace.update(18, 0, 10);
  assert.equal(gracePose.frameIndex, graceFrame, 'No extra gait phase inside the no-displacement grace');
}
assert(gracePose.rotation > graceLean, 'Walking lean continues toward the same target during grace');

const motion = new AvatarMotion(17);
assert.equal(motion.update(100, 100, 16).moving, false, 'First position is not a step');
assert.equal(motion.update(101, 100, 16).direction, 'right');
assert.equal(motion.update(100, 100, 16).direction, 'left');
assert.equal(motion.update(100, 99, 16).direction, 'back');
assert.equal(motion.update(100, 101, 16).direction, 'front');
assert(motion.update(100, 101, 16).moving, 'The final step briefly continues after stopping');
let pose!: AvatarPose;
for (let i = 0; i < 20; i++) pose = motion.update(100, 101, 16);
assert.equal(pose.moving, false, 'Final step settles within a bounded time');
assert.equal(pose.frameIndex, 0);
for (let i = 0; i < 60; i++) assert.equal(motion.update(100, 101, 16).moving, false, 'Blocked/zero-distance character stays idle');

assert.equal(motion.update(500, 101, 16).moving, false, 'Teleport does not fake a fast walk');
assert.equal(motion.update(501, 101, 5000).moving, false, 'Tab resume reanchors the sampled position');
assert.equal(motion.update(502, 101, 16).moving, true, 'Normal movement resumes after reanchoring');

const reduced = new AvatarMotion(23);
reduced.update(0, 0, 16);
pose = reduced.update(18, 0, 100, true);
assert(pose.moving && pose.frameIndex > 0, 'Reduced motion preserves walking frames');
assert.deepEqual([pose.offsetX, pose.offsetY, pose.rotation, pose.scaleX, pose.scaleY, pose.blink], [0, 0, 0, 1, 1, false]);
const before = pose.frameIndex;
pose = reduced.update(33, 0, 100, false);
assert(pose.frameIndex >= before && pose.direction === 'right', 'Changing preference does not reset the stride');

const idle = new AvatarMotion(1), other = new AvatarMotion(999);
let blinks = 0, otherBlinks = 0, independent = false, breaths = new Set<number>();
for (let i = 0; i < 1200; i++) {
  const a = idle.update(0, 0, 16), b = other.update(0, 0, 16);
  finite(a); finite(b);
  if (a.blink) blinks++;
  if (b.blink) otherBlinks++;
  if (a.blink !== b.blink) independent = true;
  breaths.add(Math.round(a.scaleY * 10000));
}
assert(blinks > 0 && blinks < 80 && otherBlinks > 0 && independent, 'Blinking is brief, sparse and seeded per avatar');
assert(breaths.size > 20, 'Idle breathing changes subtly over time');
for (const values of [[NaN, 0, 16], [0, Infinity, 16], [0, 0, NaN], [0, 0, -10], [0, 0, Infinity]]) finite(idle.update(...values as [number, number, number]));

console.log('Avatar motion checks passed: cadence, directions, settling, blocked movement, teleport, reduced motion, idle and invalid inputs.');
