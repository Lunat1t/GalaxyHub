import type * as Phaser from 'phaser';

const FOG = 'galaxy-retro-fog-v1';
const GRAIN = 'galaxy-retro-grain-v1';
const VIGNETTE = 'galaxy-retro-vignette-v1';
const installed = new WeakSet<Phaser.Scene>();

/** Canvas-compatible atmosphere; textures survive navigation with the shared game. */
export function applyRetroAtmosphere(scene: Phaser.Scene): void {
  if (installed.has(scene)) return;
  installed.add(scene);

  if (!scene.textures.exists(FOG)) {
    const texture = scene.textures.createCanvas(FOG, 256, 192);
    if (texture) {
      const context = texture.context;
      context.fillStyle = 'rgba(157, 175, 171, .035)';
      context.fillRect(0, 0, 256, 192);
      // Broad uneven banks, rather than an opaque layer over the player.
      for (const [x, y, radius] of [[10, 18, 150], [242, 68, 138], [100, 198, 108]]) {
        const mist = context.createRadialGradient(x, y, 0, x, y, radius);
        mist.addColorStop(0, 'rgba(177, 190, 181, .12)');
        mist.addColorStop(1, 'rgba(177, 190, 181, 0)');
        context.fillStyle = mist;
        context.fillRect(0, 0, 256, 192);
      }
      texture.refresh();
    }
  }

  if (!scene.textures.exists(GRAIN)) {
    const texture = scene.textures.createCanvas(GRAIN, 128, 128);
    if (texture) {
      const pixels = texture.context.createImageData(128, 128);
      let seed = 1979;
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const shade = seed >>> 24;
        pixels.data[offset] = shade;
        pixels.data[offset + 1] = shade;
        pixels.data[offset + 2] = shade;
        pixels.data[offset + 3] = 13;
      }
      texture.context.putImageData(pixels, 0, 0);
      texture.refresh();
    }
  }

  if (!scene.textures.exists(VIGNETTE)) {
    const texture = scene.textures.createCanvas(VIGNETTE, 256, 192);
    if (texture) {
      const context = texture.context;
      context.save();
      context.scale(1, 192 / 256);
      const shade = context.createRadialGradient(128, 128, 32, 128, 128, 176);
      shade.addColorStop(0, 'rgba(19, 26, 28, 0)');
      shade.addColorStop(.6, 'rgba(19, 26, 28, .03)');
      shade.addColorStop(1, 'rgba(19, 26, 28, .27)');
      context.fillStyle = shade;
      context.fillRect(0, 0, 256, 256);
      context.restore();
      texture.refresh();
    }
  }

  const fog = scene.add.image(0, 0, FOG).setScrollFactor(0).setDepth(10000);
  const grain = scene.add.tileSprite(0, 0, 1, 1, GRAIN).setScrollFactor(0).setDepth(10001);
  const vignette = scene.add.image(0, 0, VIGNETTE).setScrollFactor(0).setDepth(10002);
  const fit = () => {
    const camera = scene.cameras.main;
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    // With zero scroll factor, camera zoom still acts about the viewport centre.
    // Centre the layers there and cancel only their scale, not the world's zoom.
    for (const layer of [fog, grain, vignette]) layer.setPosition(camera.width / 2, camera.height / 2);
    fog.setDisplaySize(width, height);
    vignette.setDisplaySize(width, height);
    grain.setSize(width, height).setTileScale(1 / camera.zoom);
  };
  fit();
  scene.scale.on('resize', fit);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', fit);
    installed.delete(scene);
    // Scene shutdown owns display-object destruction. Cached textures remain shared.
  });
}
