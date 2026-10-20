'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type * as PhaserTypes from 'phaser';
import CampusMap from './campus-map';
import { CAMPUS_DOOR, CAMPUS_HEIGHT, CAMPUS_ROOMS, CAMPUS_WIDTH, nearCampusDoor, type PrototypeRoomId } from '@/shared/campus-map';
import { AVATAR_TEXTURE, AVATAR_IMAGE, AVATAR_ATLAS, AVATAR_SCALE, AVATAR_ORIGIN_Y, AVATAR_DEPTH } from '@/shared/avatar-sprite';
import { PointerDirections } from '@/shared/cafe-controls';
import { loadWorldRuntime, mountWorld } from './world-runtime';
import { applyRetroAtmosphere } from './retro-atmosphere';
import { preloadCafe } from '../cafe/load-cafe';

const DIRECTIONS = [{ label: 'Вверх', x: 0, y: -1, glyph: '↑' }, { label: 'Влево', x: -1, y: 0, glyph: '←' }, { label: 'Вниз', x: 0, y: 1, glyph: '↓' }, { label: 'Вправо', x: 1, y: 0, glyph: '→' }];

export default function CampusWorld({ room }: { room: PrototypeRoomId }) {
  const router = useRouter();
  const screen = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const pointers = useRef(new PointerDirections());
  const paused = useRef(false);
  const resetInput = useRef(() => {});
  const [nearDoor, setNearDoor] = useState(false);
  const [status, setStatus] = useState('Загружаем комнату…');
  const [attempt, setAttempt] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');
  const currentRoom = CAMPUS_ROOMS.find(item => item.id === room)!;
  const enterDoor = useCallback(() => router.push(room === 'hall' ? '/cafe?from=campus' : '/campus/hall'), [room, router]);
  const mapChanged = useCallback((open: boolean) => { paused.current = open; if (open) resetInput.current(); }, []);

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
        let name = 'Гость';
        try { name = sessionStorage.getItem('galaxy-campus-name')?.slice(0, 24) || name; } catch { /* Private mode can disable storage. */ }
        const fromCafe = room === 'hall' && new URLSearchParams(window.location.search).get('from') === 'cafe';
        class CampusScene extends Phaser.Scene {
          private keys?: Record<string, PhaserTypes.Input.Keyboard.Key>;
          private avatar!: PhaserTypes.GameObjects.Container;
          private character!: PhaserTypes.GameObjects.Sprite;
          private direction = 'front';
          private doorNear = false;
          constructor() { super('Campus'); }
          preload() {
            if (!this.textures.exists(AVATAR_TEXTURE)) this.load.atlas(AVATAR_TEXTURE, AVATAR_IMAGE, AVATAR_ATLAS);
            this.load.on('loaderror', () => { if (!disposed) setStatus('Не удалось загрузить персонажа. Повторите загрузку.'); });
          }
          create() {
            if (disposed || !this.textures.exists(AVATAR_TEXTURE)) return;
            this.cameras.main.setBackgroundColor('#3c4747');
            const fit = () => {
              const { width, height } = this.scale;
              const zoom = Math.max(.85, Math.min(width / CAMPUS_WIDTH, height / CAMPUS_HEIGHT));
              const boundsWidth = Math.max(CAMPUS_WIDTH, width / zoom), boundsHeight = Math.max(CAMPUS_HEIGHT, height / zoom);
              this.cameras.main.setZoom(zoom).setBounds((CAMPUS_WIDTH - boundsWidth) / 2, (CAMPUS_HEIGHT - boundsHeight) / 2, boundsWidth, boundsHeight);
            };
            fit(); this.scale.on('resize', fit);
            this.events.once('shutdown', () => this.scale.off('resize', fit));
            const floor = this.add.graphics();
            floor.fillStyle(0x858a7d).fillRect(32, 64, 736, 448);
            for (let y = 64; y < 512; y += 32) for (let x = 32; x < 768; x += 32) {
              const right = Math.min(x + 32, 768);
              floor.fillStyle((x / 32 + y / 32) % 3 ? 0x7c8277 : 0x929486, .7).fillTriangle(x, y, right, y, x, y + 32);
              floor.fillStyle(0x687569, .22).fillTriangle(right, y, right, y + 32, x, y + 32);
              floor.lineStyle(1, 0x535f56, .35).lineBetween(x, y + 31, right, y + 31);
              if ((x * 3 + y) % 160 === 0) floor.lineStyle(1, 0x394b45, .28).lineBetween(x + 5, y + 8, right - 6, y + 17);
            }
            floor.fillStyle(0x565f58).fillRect(32, 32, 736, 32);
            floor.fillStyle(0x384a42).fillRect(32, 52, 736, 12);
            floor.fillStyle(0x343f3c).fillRect(24, 32, 8, 480).fillRect(768, 32, 8, 480).fillRect(24, 512, 752, 8);
            for (const x of [128, 320, 512]) {
              floor.fillStyle(0x303c3b).fillRect(x, 36, 72, 19);
              floor.fillStyle(0xb8c2ac, .5).fillRect(x + 3, 39, 66, 4);
              floor.fillStyle(0xc2c7ac, .06).fillTriangle(x + 3, 64, x + 130, 232, x - 40, 232);
            }
            floor.lineStyle(2, 0x49564c, .4).strokeRect(48, 80, 704, 416);
            const door = this.add.graphics();
            door.fillStyle(0x303a36).fillRect(CAMPUS_DOOR.x - 28, 32, 56, 32);
            door.fillStyle(0x656e5f).fillRect(CAMPUS_DOOR.x - 22, 36, 44, 28);
            door.fillStyle(0x4b574d).fillTriangle(CAMPUS_DOOR.x - 22, 36, CAMPUS_DOOR.x + 22, 36, CAMPUS_DOOR.x + 22, 64);
            door.fillStyle(0xc5b78d).fillCircle(CAMPUS_DOOR.x + 14, 52, 3);
            this.add.text(CAMPUS_DOOR.x, 78, room === 'hall' ? 'Café' : 'Холл', { fontFamily: 'monospace', fontSize: '14px', color: '#e1dfc5', backgroundColor: '#3a4841', padding: { x: 5, y: 2 } }).setOrigin(.5);
            this.add.text(400, 250, currentRoom.name, { fontFamily: 'monospace', fontSize: '22px', color: '#414e45' }).setOrigin(.5);
            this.add.text(400, 278, room === 'hall' ? 'Место появления' : 'Пустой макет комнаты', { fontFamily: 'monospace', fontSize: '13px', color: '#4c594e' }).setOrigin(.5);
            for (const direction of ['front', 'left', 'right', 'back']) if (!this.anims.exists(`campus-avatar-walk-${direction}`)) this.anims.create({ key: `campus-avatar-walk-${direction}`, frames: [0, 1, 2, 3].map(frame => ({ key: AVATAR_TEXTURE, frame: `${direction}-${frame}` })), frameRate: 8, repeat: -1 });
            const shadow = this.add.ellipse(0, 0, 26, 10, 0x353535, .25);
            const ring = this.add.ellipse(0, 0, 30, 12).setStrokeStyle(2, 0x284f80);
            this.character = this.add.sprite(0, 0, AVATAR_TEXTURE, 'front-0').setScale(AVATAR_SCALE).setOrigin(.5, AVATAR_ORIGIN_Y);
            const label = this.add.text(0, -82, `${name} (вы)`, { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff', backgroundColor: '#555e61', padding: { x: 4, y: 2 } }).setOrigin(.5);
            this.avatar = this.add.container(fromCafe ? CAMPUS_DOOR.x : 400, fromCafe ? 136 : 420, [shadow, ring, this.character, label]);
            this.avatar.setDepth(AVATAR_DEPTH);
            this.cameras.main.startFollow(this.avatar, true, 1, 1);
            applyRetroAtmosphere(this);
            this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,E') as Record<string, PhaserTypes.Input.Keyboard.Key>;
            resetInput.current = () => { Object.values(this.keys ?? {}).forEach(key => key.reset()); pointers.current.clear(); };
            setStatus(room === 'hall' ? 'Вы в центральном холле' : 'Макет комнаты');
            // Warm the route and multiplayer code after the playable hall is ready.
            if (room === 'hall') { router.prefetch('/cafe?from=campus'); preloadCafe(); }
          }
          update(_time: number, delta: number) {
            if (!this.keys || disposed) return;
            let x = 0, y = 0;
            if (!paused.current && !document.hidden && document.hasFocus()) {
              const touch = pointers.current.value();
              x = (Number(this.keys.RIGHT.isDown || this.keys.D.isDown) - Number(this.keys.LEFT.isDown || this.keys.A.isDown)) || touch.x;
              y = (Number(this.keys.DOWN.isDown || this.keys.S.isDown) - Number(this.keys.UP.isDown || this.keys.W.isDown)) || touch.y;
            }
            const length = Math.max(1, Math.hypot(x, y)), distance = 150 * Math.min(delta, 50) / 1000;
            this.avatar.x = Phaser.Math.Clamp(this.avatar.x + x / length * distance, 44, 756);
            this.avatar.y = Phaser.Math.Clamp(this.avatar.y + y / length * distance, 92, 500);
            if (x || y) {
              this.direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'front' : 'back');
              this.character.play(`campus-avatar-walk-${this.direction}`, true);
            } else { this.character.anims.stop(); this.character.setFrame(`${this.direction}-0`); }
            const nearby = nearCampusDoor(this.avatar.x, this.avatar.y);
            if (nearby !== this.doorNear) { this.doorNear = nearby; setNearDoor(nearby); }
            if (Phaser.Input.Keyboard.JustDown(this.keys.E) && nearby && !paused.current) enterDoor();
          }
        }
        lease = await mountWorld(Phaser, host.current, new CampusScene(), () => disposed);
      } catch { if (!disposed) setStatus('Не удалось открыть комнату. Повторите загрузку.'); }
    }
    setNearDoor(false); setStatus('Загружаем комнату…'); void start();
    return () => {
      disposed = true; stop(); resetInput.current = () => {}; lease?.release();
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop);
      viewport?.removeEventListener('resize', resizeViewport); viewport?.removeEventListener('scroll', resizeViewport);
    };
  }, [room, currentRoom.name, enterDoor, attempt, router]);

  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await screen.current?.requestFullscreen(); setFullscreenError(''); }
    catch { setFullscreenError('Браузер не поддерживает полный экран.'); }
  }
  return <div ref={screen} className="cafe-screen campus-screen">
    <div ref={host} className="cafe-canvas" role="img" aria-label={`${currentRoom.name}: комната, персонаж с сиреневыми волосами и дверь ${room === 'hall' ? 'Café' : 'в холл'}`} />
    <header className="cafe-hud"><div><strong>{currentRoom.name}</strong><span role="status">{status}</span></div><div className="cafe-actions"><CampusMap current={room} onOpenChange={mapChanged} /><button onClick={fullscreen}>Полный экран</button><Link href="/">Вход и профиль</Link></div></header>
    {status.startsWith('Не удалось') && <div className="cafe-reconnect"><button onClick={() => setAttempt(value => value + 1)}>Повторить загрузку</button></div>}
    {fullscreenError && <p className="cafe-fullscreen-error" role="status">{fullscreenError}</p>}
    <div className="campus-door-action" hidden={!nearDoor}><button onClick={enterDoor}>{room === 'hall' ? 'Войти в Café' : 'Вернуться в холл'} · E</button></div>
    <details className="cafe-info"><summary>Управление</summary><p>WASD или стрелки — ходьба. На телефоне удерживайте кнопки. У двери нажмите E или «Войти». Клик по полу не двигает персонажа.</p><p>Макет кампуса: в этих комнатах пока виден только ваш персонаж.</p></details>
    <div className="cafe-controls" aria-label="Управление аватаром">{DIRECTIONS.map(direction => <button key={direction.label} aria-label={direction.label}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.press(event.pointerId, direction); }}
      onPointerUp={event => pointers.current.release(event.pointerId)} onPointerCancel={event => pointers.current.release(event.pointerId)} onLostPointerCapture={event => pointers.current.release(event.pointerId)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pointers.current.press(-1, direction); } }} onKeyUp={() => pointers.current.release(-1)} onBlur={() => pointers.current.release(-1)}>{direction.glyph}</button>)}</div>
  </div>;
}
