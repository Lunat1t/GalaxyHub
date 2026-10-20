import type * as Phaser from 'phaser';
import { AvatarMotion } from '@/shared/avatar-motion';
import { AVATAR_ORIGIN_Y, AVATAR_SCALE, AVATAR_TEXTURE } from '@/shared/avatar-sprite';

/** Cosmetic transforms only: the container remains the authoritative foot position. */
export class AvatarAnimation {
  private readonly motion: AvatarMotion;
  private readonly eyelids: Phaser.GameObjects.Sprite;
  private readonly preference = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    private readonly body: Phaser.GameObjects.Sprite,
    seed = 0,
  ) {
    this.motion = new AvatarMotion(seed);
    // Blink patches cover only the eyes. The neutral body never changes size.
    this.eyelids = scene.add.sprite(0, 0, AVATAR_TEXTURE, 'blink-front')
      .setOrigin(.5, AVATAR_ORIGIN_Y).setScale(AVATAR_SCALE).setVisible(false);
    container.add(this.eyelids);
  }

  update(delta: number) {
    const pose = this.motion.update(this.container.x, this.container.y, delta, this.preference.matches);
    this.body.setFrame(`${pose.direction}-${pose.frameIndex}`);
    for (const sprite of [this.body, this.eyelids]) {
      sprite.setPosition(pose.offsetX, pose.offsetY)
        .setAngle(pose.rotation)
        .setScale(AVATAR_SCALE * pose.scaleX, AVATAR_SCALE * pose.scaleY);
    }
    this.eyelids.setVisible(pose.blink && pose.direction !== 'back');
    if (pose.blink && pose.direction !== 'back') this.eyelids.setFrame(`blink-${pose.direction}`);
  }
}
