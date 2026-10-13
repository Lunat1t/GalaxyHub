'use client';

import { loadWorldRuntime } from '../campus/world-runtime';
function importRuntime() { return Promise.all([loadWorldRuntime().then(Phaser => ({ default: Phaser })), import('colyseus.js')]); }
let runtime: ReturnType<typeof importRuntime> | undefined;
export function loadCafeRuntime() {
  runtime ??= importRuntime().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
export function preloadCafe() {
  void loadCafeRuntime().catch(() => {});
  void import('./cafe-world').catch(() => {});
}
