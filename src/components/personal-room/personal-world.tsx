'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type * as PhaserTypes from 'phaser';
import { PointerDirections } from '@/shared/cafe-controls';
import { WALK_SPEED } from '@/shared/cafe-map';
import { loadWorldRuntime, mountWorld } from '../campus/world-runtime';
import AgentMock from './agent-mock';

const ROOM_WIDTH = 800, ROOM_HEIGHT = 544;
const CAT_TEXTURE = 'personal-black-cat';
const DIRECTIONS = [{ label: 'Вверх', x: 0, y: -1, glyph: '↑' }, { label: 'Влево', x: -1, y: 0, glyph: '←' }, { label: 'Вниз', x: 0, y: 1, glyph: '↓' }, { label: 'Вправо', x: 1, y: 0, glyph: '→' }];

export default function PersonalWorld() {
  const screen = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const pointers = useRef(new PointerDirections());
  const resetInput = useRef(() => {});
  const [status, setStatus] = useState('Загружаем комнату…');
  const [attempt, setAttempt] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    let disposed = false;
    let lease: Awaited<ReturnType<typeof mountWorld>> = null;
    const stop = () => { pointers.current.clear(); resetInput.current(); };
    const viewport = window.visualViewport;
    const resizeViewport = () => {
      screen.current?.style.setProperty('--cafe-height', `${viewport?.height ?? window.innerHeight}px`);
      screen.current?.style.setProperty('--cafe-top', `${viewport?.offsetTop ?? 0}px`);
    };
    resizeViewport();
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    viewport?.addEventListener('resize', resizeViewport);
    viewport?.addEventListener('scroll', resizeViewport);
    async function start() {
      try {
        const Phaser = await loadWorldRuntime();
        if (disposed || !host.current) return;
        class PersonalScene extends Phaser.Scene {
          private keys?: Record<string, PhaserTypes.Input.Keyboard.Key>;
          private avatar!: PhaserTypes.GameObjects.Container;
          private character!: PhaserTypes.GameObjects.Sprite;
          private direction = 'front';
          private distance = 0;
          constructor() { super('PersonalRoom'); }
          preload() {
            if (!this.textures.exists(CAT_TEXTURE)) this.load.atlas(CAT_TEXTURE, '/sprites/black-cat-v1.png', '/sprites/black-cat-v1.json');
            this.load.on('loaderror', () => { if (!disposed) setStatus('Не удалось загрузить персонажа. Повторите загрузку.'); });
          }
          create() {
            if (disposed || !this.textures.exists(CAT_TEXTURE)) return;
            this.cameras.main.setBackgroundColor('#352b26');
            const fit = () => {
              const { width, height } = this.scale;
              const zoom = Math.max(.85, Math.min(width / ROOM_WIDTH, height / ROOM_HEIGHT));
              const boundsWidth = Math.max(ROOM_WIDTH, width / zoom), boundsHeight = Math.max(ROOM_HEIGHT, height / zoom);
              this.cameras.main.setZoom(zoom).setBounds((ROOM_WIDTH - boundsWidth) / 2, (ROOM_HEIGHT - boundsHeight) / 2, boundsWidth, boundsHeight);
            };
            fit(); this.scale.on('resize', fit);
            this.events.once('shutdown', () => this.scale.off('resize', fit));
            const floor = this.add.graphics();
            floor.fillStyle(0x775d49).fillRect(24, 16, 752, 504);
            for (let y = 64; y < 512; y += 32) for (let x = 32; x < 768; x += 32) {
              floor.fillStyle((x / 32 + y / 32) % 2 ? 0xd7be93 : 0xdcc59e).fillRect(x, y, 32, 32);
              floor.lineStyle(1, 0xc7ac83).lineBetween(x, y + 31, x + 31, y + 31);
            }
            floor.fillStyle(0xc4d0bf).fillRect(32, 16, 736, 48);
            floor.fillStyle(0x715746).fillRect(24, 16, 8, 504).fillRect(768, 16, 8, 504).fillRect(24, 512, 752, 8);
            const shadow = this.add.ellipse(0, 0, 26, 10, 0x353535, .25);
            this.character = this.add.sprite(0, 0, CAT_TEXTURE, 'front-0').setScale(.18).setOrigin(.5, 316 / 336);
            this.avatar = this.add.container(400, 300, [shadow, this.character]).setDepth(20000);
            this.cameras.main.startFollow(this.avatar, true, 1, 1);
            this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, PhaserTypes.Input.Keyboard.Key>;
            resetInput.current = () => { Object.values(this.keys ?? {}).forEach(key => key.reset()); pointers.current.clear(); };
            setStatus('Ваша личная комната');
          }
          update(_time: number, delta: number) {
            if (!this.keys || disposed) return;
            let x = 0, y = 0;
            if (!document.hidden && document.hasFocus() && !document.activeElement?.closest('.agent-mock')) {
              const touch = pointers.current.value();
              x = (Number(this.keys.RIGHT.isDown || this.keys.D.isDown) - Number(this.keys.LEFT.isDown || this.keys.A.isDown)) || touch.x;
              y = (Number(this.keys.DOWN.isDown || this.keys.S.isDown) - Number(this.keys.UP.isDown || this.keys.W.isDown)) || touch.y;
            }
            const length = Math.max(1, Math.hypot(x, y)), distance = WALK_SPEED * Math.min(delta, 50) / 1000;
            const beforeX = this.avatar.x, beforeY = this.avatar.y;
            this.avatar.x = Phaser.Math.Clamp(this.avatar.x + x / length * distance, 44, 756);
            this.avatar.y = Phaser.Math.Clamp(this.avatar.y + y / length * distance, 92, 500);
            const dx = this.avatar.x - beforeX, dy = this.avatar.y - beforeY;
            const travelled = Math.hypot(dx, dy);
            if (travelled > .001) {
              this.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
              this.distance = (this.distance + travelled) % 48;
              this.character.setFrame(`${this.direction}-${Math.floor(this.distance / 12)}`);
            } else {
              this.distance = 0;
              this.character.setFrame(`${this.direction}-0`);
            }
          }
        }
        lease = await mountWorld(Phaser, host.current, new PersonalScene(), () => disposed);
      } catch { if (!disposed) setStatus('Не удалось открыть комнату. Повторите загрузку.'); }
    }
    setStatus('Загружаем комнату…'); void start();
    return () => {
      disposed = true; stop(); resetInput.current = () => {}; lease?.release();
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop);
      viewport?.removeEventListener('resize', resizeViewport); viewport?.removeEventListener('scroll', resizeViewport);
    };
  }, [attempt]);

  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await screen.current?.requestFullscreen(); setFullscreenError(''); }
    catch { setFullscreenError('Браузер не поддерживает полный экран.'); }
  }
  return <div ref={screen} className="cafe-screen campus-screen">
    <div ref={host} className="cafe-canvas" role="img" aria-label="Личная пустая комната с чёрным котом" />
    <header className="cafe-hud"><div><strong>Моя комната</strong><span role="status">{status}</span></div><div className="cafe-actions"><button onClick={fullscreen}>Полный экран</button><Link href="/profile">Профиль</Link></div></header>
    {status.startsWith('Не удалось') && <div className="cafe-reconnect"><button onClick={() => setAttempt(value => value + 1)}>Повторить загрузку</button></div>}
    {fullscreenError && <p className="cafe-fullscreen-error" role="status">{fullscreenError}</p>}
    <details className="cafe-info"><summary>Управление</summary><p>WASD или стрелки — ходьба. На телефоне удерживайте кнопки направления.</p></details>
    <div className="cafe-controls" aria-label="Управление аватаром">{DIRECTIONS.map(direction => <button key={direction.label} aria-label={direction.label}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.press(event.pointerId, direction); }}
      onPointerUp={event => pointers.current.release(event.pointerId)} onPointerCancel={event => pointers.current.release(event.pointerId)} onLostPointerCapture={event => pointers.current.release(event.pointerId)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pointers.current.press(-1, direction); } }} onKeyUp={() => pointers.current.release(-1)} onBlur={() => pointers.current.release(-1)}>{direction.glyph}</button>)}</div>
    <AgentMock />
  </div>;
}
