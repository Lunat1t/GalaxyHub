'use client';
import type * as PhaserTypes from 'phaser';

type Lease = { game: PhaserTypes.Game; release: () => void };
let runtime: Promise<typeof PhaserTypes> | undefined;
let boot: Promise<PhaserTypes.Game> | undefined;
let root: HTMLDivElement | undefined;
let active: Lease | undefined;
let sleepFrame = 0;
let serial = 0;

export function loadWorldRuntime() {
  runtime ??= import('phaser').then(module => module.default).catch(error => { runtime = undefined; throw error; });
  return runtime;
}

/** The canvas and texture cache survive client navigation between locations. */
export async function mountWorld(Phaser: typeof PhaserTypes, host: HTMLElement, scene: PhaserTypes.Scene, cancelled: () => boolean): Promise<Lease | null> {
  if (!boot) {
    root = document.createElement('div');
    root.style.cssText = 'width:100%;height:100%;overflow:hidden';
    host.appendChild(root);
    boot = new Promise<PhaserTypes.Game>(resolve => {
      const game = new Phaser.Game({ type: Phaser.CANVAS, parent: root, width: host.clientWidth, height: host.clientHeight, pixelArt: true, backgroundColor: '#8b918d', scale: { mode: Phaser.Scale.RESIZE }, scene: [], audio: { noAudio: true } });
      game.events.once(Phaser.Core.Events.READY, () => resolve(game));
    }).catch(error => { boot = undefined; root?.remove(); root = undefined; throw error; });
  }
  const game = await boot;
  if (cancelled()) {
    if (!active && root) {
      root.hidden = true; document.body.appendChild(root);
      game.input.enabled = false;
      if (game.input.keyboard) game.input.keyboard.enabled = false;
      game.loop.sleep();
    }
    return null;
  }
  active?.release();
  cancelAnimationFrame(sleepFrame);
  root!.hidden = false;
  host.appendChild(root!);
  game.scale.resize(host.clientWidth, host.clientHeight);
  game.scale.refresh();
  game.input.enabled = true;
  if (game.input.keyboard) game.input.keyboard.enabled = true;
  game.loop.wake();
  const key = `location-${++serial}`;
  scene.sys.settings.key = key;
  const observer = new ResizeObserver(() => { game.scale.refresh(); });
  observer.observe(host);
  const lease: Lease = { game, release() {
    observer.disconnect();
    if (active !== lease) return;
    active = undefined;
    game.scene.stop(key); game.scene.remove(key);
    game.input.enabled = false;
    if (game.input.keyboard) game.input.keyboard.enabled = false;
    root!.hidden = true;
    document.body.appendChild(root!);
    // Allow any queued scene removals to finish before pausing the game loop.
    sleepFrame = requestAnimationFrame(() => { if (!active) game.loop.sleep(); });
  } };
  active = lease;
  try { game.scene.add(key, scene, true); }
  catch (error) { lease.release(); throw error; }
  return lease;
}
