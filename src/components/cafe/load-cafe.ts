'use client';

function importRuntime() { return Promise.all([import('phaser'), import('colyseus.js')]); }
let runtime: ReturnType<typeof importRuntime> | undefined;
export function loadCafeRuntime() {
  runtime ??= importRuntime().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
export function preloadCafe() {
  void loadCafeRuntime().catch(() => {});
  void import('./cafe-world').catch(() => {});
}
