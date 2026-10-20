import type * as Phaser from 'phaser';
import { AvatarMotion } from '@/shared/avatar-motion';
import { AVATAR_ORIGIN_Y, AVATAR_SCALE, AVATAR_TEXTURE } from '@/shared/avatar-sprite';

/** Cosmetic transforms only: the container remains the authoritative foot position. */
export class AvatarAnimation {
  private readonly motion: AvatarMotion;
  private readonly eyelids: Phaser.GameObjects.Sprite;
  private readonly legs: readonly [Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite];
  private readonly boots: readonly [Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite];
  private readonly preference = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    private readonly body: Phaser.GameObjects.Sprite,
    seed = 0,
  ) {
    this.motion = new AvatarMotion(seed);
    // Reuse one consistent drawing per direction. Generated walk frames vary
    // in anatomy; cropped limbs keep the head, dress and body proportions stable.
    this.legs = [0, 1].map(() => scene.add.sprite(0, 0, AVATAR_TEXTURE, 'front-0')) as [Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite];
    this.boots = [0, 1].map(() => scene.add.sprite(0, 0, AVATAR_TEXTURE, 'front-0')) as [Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite];
    container.add([...this.legs, ...this.boots]);
    container.bringToTop(body);
    // Blink patches cover only the eyes. The neutral body never changes size.
    this.eyelids = scene.add.sprite(0, 0, AVATAR_TEXTURE, 'blink-front')
      .setOrigin(.5, AVATAR_ORIGIN_Y).setScale(AVATAR_SCALE).setVisible(false);
    container.add(this.eyelids);
  }

  update(delta: number) {
    const pose = this.motion.update(this.container.x, this.container.y, delta, this.preference.matches);
    this.body.setFrame(`${pose.direction}-0`).setCrop(0, 0, 192, 174);
    for (const sprite of [this.body, this.eyelids]) {
      sprite.setPosition(pose.offsetX, pose.offsetY)
        .setAngle(pose.rotation)
        .setScale(AVATAR_SCALE * pose.scaleX, AVATAR_SCALE * pose.scaleY);
    }
    const side = pose.direction === 'left' || pose.direction === 'right';
    const sign = pose.direction === 'left' || pose.direction === 'back' ? -1 : 1;
    this.legs.forEach((leg, index) => {
      const center = index === 0 ? 79 : 113;
      const foot = pose.feet[index];
      const travel = foot.travel * sign;
      const hipY = (171 - 224) * AVATAR_SCALE;
      const ankleY = (185 - 224) * AVATAR_SCALE;
      const footX = side ? travel : 0;
      // Depth is foreshortened in the front/back drawing, unlike the side view.
      const footY = -foot.lift + (side ? 0 : travel * .25);
      const reachX = footX;
      const reachY = ankleY + footY - hipY;
      const angle = -Math.atan2(reachX, reachY);
      leg.setFrame(`${pose.direction}-0`)
        .setCrop(index === 0 ? 0 : 96, 171, 96, 16)
        .setOrigin(center / 192, 171 / 240)
        .setScale(AVATAR_SCALE, AVATAR_SCALE * Math.hypot(reachX, reachY) / (ankleY - hipY))
        .setRotation(angle)
        .setPosition((center - 96) * AVATAR_SCALE, hipY);
      // Keep the sole level during support; only the lifted foot tips slightly.
      this.boots[index].setFrame(`${pose.direction}-0`)
        .setCrop(index === 0 ? 0 : 96, 185, 96, 55)
        .setOrigin(center / 192, 185 / 240)
        .setScale(AVATAR_SCALE)
        .setAngle(side ? -foot.lift * sign * 2 : 0)
        .setPosition((center - 96) * AVATAR_SCALE + footX, ankleY + footY);
    });
    this.eyelids.setVisible(pose.blink && pose.direction !== 'back');
    if (pose.blink && pose.direction !== 'back') this.eyelids.setFrame(`blink-${pose.direction}`);
  }
}
