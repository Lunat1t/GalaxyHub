'use client';
import { useEffect, useRef, useState } from 'react';
import type * as PhaserTypes from 'phaser';
import type { Room } from 'colyseus.js';
import { advancePlayer, canStandAt, CAFE_HEIGHT, CAFE_WIDTH, COUNTER, TABLES, PLAYER_COLORS } from '@/shared/cafe-map';
import { nearbyTable, channelName } from '@/shared/cafe-chat';
import CafeChat from './cafe-chat';

type Player = { name: string; color: number; x: number; y: number; moving: boolean };
type Snapshot = { players: Map<string, Player> };
type Member = { id: string; name: string };
type Visual = { container: PhaserTypes.GameObjects.Container; sprite: PhaserTypes.GameObjects.Image; label: PhaserTypes.GameObjects.Text; target: Player };
const DIRECTIONS = [{ label: 'Вверх', x: 0, y: -1, glyph: '↑' }, { label: 'Влево', x: -1, y: 0, glyph: '←' }, { label: 'Вниз', x: 0, y: 1, glyph: '↓' }, { label: 'Вправо', x: 1, y: 0, glyph: '→' }];

export default function CafeWorld({ name, color, onLeave }: { name: string; color: number; onLeave: () => void }) {
  const screen = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const touch = useRef({ x: 0, y: 0 });
  const typing = useRef(false);
  const pauseInput = useRef(() => {});
  const [chatRoom, setChatRoom] = useState<Room<Snapshot> | null>(null);
  const [status, setStatus] = useState('Подключаемся…');
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [area, setArea] = useState('Общий зал');
  const [attempt, setAttempt] = useState(0);
  const [roomId, setRoomId] = useState('');
  const [fullscreenError, setFullscreenError] = useState('');

  function onTyping(value: boolean) {
    typing.current = value;
    pauseInput.current();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screen.current?.requestFullscreen) await screen.current.requestFullscreen();
      else setFullscreenError('Этот браузер не поддерживает скрытие панелей. Карта уже занимает всё окно.');
    } catch { setFullscreenError('Браузер не разрешил полноэкранный режим. Карта занимает всё окно.'); }
  }

  useEffect(() => {
    let disposed = false;
    let game: PhaserTypes.Game | undefined;
    let room: Room<Snapshot> | undefined;
    let lastRoster = '';
    let pointerTarget: { x: number; y: number } | null = null;
    let resetInput = () => {};
    setStatus('Подключаемся…'); setConnected(false); setMembers([]); setArea('Общий зал'); setChatRoom(null);
    typing.current = false;
    touch.current = { x: 0, y: 0 };
    const stop = () => {
      touch.current = { x: 0, y: 0 }; pointerTarget = null;
      resetInput();
      if (room?.connection.isOpen) room.send('move', { x: 0, y: 0 });
    };
    const visibility = () => { if (document.hidden) stop(); };
    pauseInput.current = stop;
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);

    async function start() {
      try {
        const [{ default: Phaser }, { Client }] = await Promise.all([import('phaser'), import('colyseus.js')]);
        if (disposed) return;
        const endpoint = process.env.NEXT_PUBLIC_WORLD_URL || window.location.origin;
        const client = new Client(endpoint);
        const joined = await client.joinOrCreate<Snapshot>('cafe', { name, color });
        if (disposed) { await joined.leave(); return; }
        room = joined;
        setRoomId(joined.roomId);
        joined.onLeave(() => {
          if (!disposed) { setConnected(false); setMembers([]); setStatus('Соединение закрыто. Нажмите «Переподключиться».'); }
        });
        joined.onError(() => {
          if (!disposed) { setConnected(false); setStatus('Ошибка связи с сервером мира. Попробуйте переподключиться.'); }
        });
        class CafeScene extends Phaser.Scene {
          private visuals = new Map<string, Visual>();
          private lastSent = 0;
          private previousInput = '';
          private localMoving = false;
          private idleSince = 0;
          private keys!: Record<string, PhaserTypes.Input.Keyboard.Key>;
          constructor() { super('Cafe'); }
          create() {
            const g = this.add.graphics();
            g.fillStyle(0x775d49).fillRect(0, 0, CAFE_WIDTH, CAFE_HEIGHT);
            for (let y = 64; y < CAFE_HEIGHT - 32; y += 32) {
              for (let x = 32; x < CAFE_WIDTH - 32; x += 32) {
                g.fillStyle(((x / 32 + y / 32) % 2) ? 0xd7be93 : 0xdcc59e).fillRect(x, y, 32, 32);
                g.lineStyle(1, 0xc7ac83).lineBetween(x, y + 31, x + 31, y + 31);
              }
            }
            g.fillStyle(0xc4d0bf).fillRect(32, 16, 736, 48);
            [96, 224, 352].forEach(x => {
              g.fillStyle(0x715746).fillRect(x - 4, 20, 80, 36);
              g.fillStyle(0xa3c3cb).fillRect(x, 24, 72, 28);
              g.fillStyle(0x715746).fillRect(x + 34, 24, 4, 28);
            });
            g.fillStyle(0x6e5142).fillRect(COUNTER.x, COUNTER.y + 8, COUNTER.width, COUNTER.height);
            g.fillStyle(0xa8815b).fillRect(COUNTER.x, COUNTER.y, COUNTER.width, COUNTER.height - 8);
            for (let x = 520; x < 728; x += 48) { g.fillStyle(0xeee4ce).fillRect(x, 92, 12, 12); g.fillStyle(0x715746).fillRect(x + 2, 94, 8, 6); }
            this.add.text(592, 120, 'БАР', { fontFamily: 'monospace', fontSize: '14px', color: '#332a24' }).setOrigin(.5);
            TABLES.forEach(table => {
              g.fillStyle(0x597966, .07).fillCircle(table.x + table.width / 2, table.y + table.height / 2, 88);
              g.lineStyle(2, 0x597966, .3).strokeCircle(table.x + table.width / 2, table.y + table.height / 2, 88);
              // Seats are scenery; the table itself has server-side collision.
              [[table.x + 16, table.y - 20], [table.x + 64, table.y - 20], [table.x + 16, table.y + 68], [table.x + 64, table.y + 68]].forEach(([x, y]) => {
                g.fillStyle(0x725343).fillRect(x, y, 20, 16); g.fillStyle(0x84957a).fillRect(x + 2, y + 2, 16, 10);
              });
              g.fillStyle(0x725343).fillRect(table.x, table.y + 6, table.width, table.height);
              g.fillStyle(0xb18d60).fillRect(table.x, table.y, table.width, table.height - 4);
              g.fillStyle(0xd6b787).fillRect(table.x + 4, table.y + 4, table.width - 8, 4);
              g.fillStyle(0xefe8d8).fillRect(table.x + 24, table.y + 20, 10, 10).fillRect(table.x + 62, table.y + 34, 10, 10);
              this.add.text(table.x + table.width / 2, table.y + table.height / 2, table.name, { fontFamily: 'monospace', fontSize: '11px', color: '#35271e' }).setOrigin(.5);
            });
            g.fillStyle(0x547762).fillRect(40, 80, 24, 24).fillRect(728, 456, 24, 24);
            g.fillStyle(0x987459).fillRect(44, 104, 16, 12).fillRect(732, 480, 16, 12);
            g.fillStyle(0xeee1c6).fillRect(352, 512, 96, 32);
            this.add.text(400, 525, 'ВХОД', { fontFamily: 'monospace', fontSize: '12px', color: '#35271e' }).setOrigin(.5);
            PLAYER_COLORS.forEach((value, index) => {
              const avatar = this.make.graphics({ x: 0, y: 0 });
              avatar.fillStyle(0x36312f).fillRect(4, 18, 4, 6).fillRect(10, 18, 4, 6);
              avatar.fillStyle(value).fillRect(3, 10, 12, 10).fillRect(1, 12, 2, 6).fillRect(15, 12, 2, 6);
              avatar.fillStyle(0xe9b98d).fillRect(4, 2, 10, 9);
              avatar.fillStyle(0x48382e).fillRect(4, 0, 10, 3).fillRect(2, 2, 3, 4);
              avatar.fillStyle(0x352b26).fillRect(6, 5, 2, 2).fillRect(11, 5, 2, 2);
              avatar.generateTexture(`person-${index}`, 18, 24); avatar.destroy();
            });
            this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, PhaserTypes.Input.Keyboard.Key>;
            this.input.keyboard!.enabled = !typing.current;
            resetInput = () => {
              this.input.keyboard?.resetKeys(); this.previousInput = '0.00,0.00';
              if (this.input.keyboard) this.input.keyboard.enabled = !typing.current;
              this.localMoving = false; this.idleSince = performance.now();
            };
            this.input.on('pointerdown', (pointer: PhaserTypes.Input.Pointer) => { if (!typing.current) pointerTarget = { x: pointer.worldX, y: pointer.worldY }; });
            joined.onStateChange(state => { if (!disposed) this.applySnapshot(state); });
            this.applySnapshot(joined.state);
            setConnected(true); setStatus('Вы в Café'); setChatRoom(joined);
          }
          private applySnapshot(state: Snapshot) {
            if (!state?.players) return;
            const present = new Set<string>(); const roster: Member[] = [];
            state.players.forEach((player, id) => {
              present.add(id); roster.push({ id, name: player.name });
              let visual = this.visuals.get(id);
              if (!visual) {
                const shadow = this.add.ellipse(0, 0, 26, 10, 0x352b26, .25);
                const ring = this.add.ellipse(0, 0, 30, 12).setStrokeStyle(2, 0x284f80);
                ring.setVisible(id === joined.sessionId);
                const sprite = this.add.image(0, 0, `person-${player.color}`).setScale(2).setOrigin(.5, 1);
                const label = this.add.text(0, -58, player.name + (id === joined.sessionId ? ' (вы)' : ''), { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff', backgroundColor: '#493c31', padding: { x: 4, y: 2 } }).setOrigin(.5);
                const container = this.add.container(player.x, player.y, [shadow, ring, sprite, label]);
                visual = { container, sprite, label, target: player }; this.visuals.set(id, visual);
              }
              // Schema fields are prototype accessors, so explicitly copy coordinates.
              visual.target = { name: player.name, color: player.color, x: player.x, y: player.y, moving: player.moving };
            });
            this.visuals.forEach((visual, id) => { if (!present.has(id)) { visual.container.destroy(); this.visuals.delete(id); } });
            const key = JSON.stringify(roster);
            if (key !== lastRoster) { lastRoster = key; setMembers(roster); }
            const me = state.players.get(joined.sessionId);
            if (me) {
              const nearby = nearbyTable(me);
              setArea(nearby ? channelName(nearby) : 'Общий зал');
            }
          }
          update(time: number, delta: number) {
            if (!this.keys) return;
            this.visuals.forEach((visual, id) => {
              if (id === joined.sessionId) return;
              const blend = Math.min(1, delta / 70);
              visual.container.x += (visual.target.x - visual.container.x) * blend;
              visual.container.y += (visual.target.y - visual.container.y) * blend;
              visual.container.setDepth(visual.container.y);
              visual.sprite.y = visual.target.moving ? Math.round(Math.sin(time / 90)) * 2 : 0;
            });
            const me = this.visuals.get(joined.sessionId);
            if (!joined.connection.isOpen || document.hidden || !document.hasFocus() || typing.current) {
              if (me) me.sprite.y = 0;
              return;
            }
            let x = Number(this.keys.RIGHT.isDown || this.keys.D.isDown) - Number(this.keys.LEFT.isDown || this.keys.A.isDown);
            let y = Number(this.keys.DOWN.isDown || this.keys.S.isDown) - Number(this.keys.UP.isDown || this.keys.W.isDown);
            if (x || y || touch.current.x || touch.current.y) { pointerTarget = null; x = x || touch.current.x; y = y || touch.current.y; }
            else if (pointerTarget) {
              if (me) {
                const dx = pointerTarget.x - me.container.x, dy = pointerTarget.y - me.container.y;
                const distance = Math.hypot(dx, dy);
                if (distance < 8) pointerTarget = null;
                else { x = dx / distance; y = dy / distance; }
              }
            }
            const moving = Boolean(x || y);
            if (moving) this.idleSince = 0;
            else if (this.localMoving || !this.idleSince) this.idleSince = performance.now();
            this.localMoving = moving;
            if (me) {
              // Predict locally on the first frame; the server remains authoritative.
              const next = advancePlayer(me.container, { x, y }, delta);
              me.container.setPosition(next.x, next.y);
              const error = Math.hypot(me.target.x - next.x, me.target.y - next.y);
              const settled = !moving && !me.target.moving && performance.now() - this.idleSince > 250;
              if (error > 32 || settled) {
                const blend = 1 - Math.exp(-Math.min(delta, 50) / 100);
                const corrected = { x: next.x + (me.target.x - next.x) * blend, y: next.y + (me.target.y - next.y) * blend };
                if (canStandAt(corrected.x, corrected.y)) me.container.setPosition(corrected.x, corrected.y);
                else if (error > 64) me.container.setPosition(me.target.x, me.target.y);
              }
              me.container.setDepth(me.container.y);
              me.sprite.y = moving ? Math.round(Math.sin(time / 90)) * 2 : 0;
            }
            const key = `${x.toFixed(2)},${y.toFixed(2)}`;
            if (key !== this.previousInput || (moving && time - this.lastSent >= 50)) {
              joined.send('move', { x, y }); this.lastSent = time; this.previousInput = key;
            }
          }
        }
        if (!host.current || disposed) { await joined.leave(); return; }
        game = new Phaser.Game({ type: Phaser.CANVAS, width: CAFE_WIDTH, height: CAFE_HEIGHT, parent: host.current, pixelArt: true, backgroundColor: '#775d49', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: CafeScene, audio: { noAudio: true } });
        const resize = new ResizeObserver(() => game?.scale.refresh());
        resize.observe(host.current);
        game.events.once('destroy', () => resize.disconnect());
      } catch {
        game?.destroy(true);
        if (room?.connection.isOpen) await room.leave().catch(() => {});
        if (!disposed) { setConnected(false); setStatus('Не удалось подключиться к серверу мира. Проверьте, что он запущен, и повторите попытку.'); }
      }
    }
    void start();
    return () => {
      disposed = true;
      pauseInput.current = () => {};
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility);
      touch.current = { x: 0, y: 0 };
      game?.destroy(true);
      if (room?.connection.isOpen) void room.leave().catch(() => {});
    };
  }, [name, color, attempt]);

  return <div ref={screen} className="cafe-screen">
    <div ref={host} className="cafe-canvas" role="img" aria-label="Карта Café с аватарами участников" />
    <header className="cafe-hud">
      <div><strong>Café</strong><span role="status">{status}</span>{connected && <span>В Café: {members.length} · {area}</span>}</div>
      <div className="cafe-actions"><button onClick={toggleFullscreen}>Полный экран</button><button onClick={onLeave}>Выйти из Café</button></div>
    </header>
    {!connected && <div className="cafe-reconnect"><button onClick={() => setAttempt(value => value + 1)}>Переподключиться</button></div>}
    {fullscreenError && <p className="cafe-fullscreen-error" role="status">{fullscreenError}</p>}
    {chatRoom && <CafeChat room={chatRoom} connected={connected} onTyping={onTyping} />}
    <details className="cafe-info"><summary>Участники и управление</summary>
      <p>Стрелки или WASD — движение. Нажмите на свободное место на карте или удерживайте кнопки.</p>
      <ul aria-label="Участники Café">{members.map(member => <li key={member.id}>{member.name}</li>)}</ul>
      <small>Комната: {roomId}</small>
    </details>
    <div className="cafe-controls" aria-label="Управление аватаром">{DIRECTIONS.map(direction => <button key={direction.label} aria-label={direction.label} disabled={!connected}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); touch.current = { x: direction.x, y: direction.y }; }}
      onPointerUp={() => { touch.current = { x: 0, y: 0 }; }} onPointerCancel={() => { touch.current = { x: 0, y: 0 }; }}
      onLostPointerCapture={() => { touch.current = { x: 0, y: 0 }; }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') touch.current = { x: direction.x, y: direction.y }; }}
      onKeyUp={() => { touch.current = { x: 0, y: 0 }; }} onBlur={() => { touch.current = { x: 0, y: 0 }; }}>{direction.glyph}</button>)}</div>
  </div>;
}
