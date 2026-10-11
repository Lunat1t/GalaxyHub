'use client';
import { useEffect, useRef, useState } from 'react';
import type * as PhaserTypes from 'phaser';
import type { Room } from 'colyseus.js';
import { CAFE_HEIGHT, CAFE_WIDTH, COUNTER, TABLES, PLAYER_COLORS } from '@/shared/cafe-map';
import { MovementPrediction, MOVEMENT_BATCH_MS, MOVEMENT_STEP_MS, type MovementFrame } from '@/shared/cafe-movement';
import { nearbyTable, channelName } from '@/shared/cafe-chat';
import CafeChat from './cafe-chat';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { loadCafeRuntime } from './load-cafe';
import SafetyActions from '../safety-actions';
import type { CafeSafetyState } from '@/shared/safety';
import { PointerDirections } from '@/shared/cafe-controls';

type Player = { name: string; color: number; x: number; y: number; moving: boolean; avatar: string; account: boolean; inputSeq: number };
type Snapshot = { players: Map<string, Player> };
type Member = { id: string; name: string; avatar: string; account: boolean };
type Visual = { container: PhaserTypes.GameObjects.Container; sprite: PhaserTypes.GameObjects.Sprite; direction: 'front' | 'left' | 'right' | 'back'; shadow: PhaserTypes.GameObjects.Ellipse; label: PhaserTypes.GameObjects.Text; target: Player };
const DIRECTIONS = [{ label: 'Вверх', x: 0, y: -1, glyph: '↑' }, { label: 'Влево', x: -1, y: 0, glyph: '←' }, { label: 'Вниз', x: 0, y: 1, glyph: '↓' }, { label: 'Вправо', x: 1, y: 0, glyph: '→' }];

export default function CafeWorld({ name, color, useAccount = false, onLeave }: { name: string; color: number; useAccount?: boolean; onLeave: () => void }) {
  const screen = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const touch = useRef({ x: 0, y: 0 });
  const pointers = useRef(new PointerDirections());
  const [keyboardOpen, setKeyboardOpen] = useState(false);
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
  const [safety, setSafety] = useState<CafeSafetyState>({ blocked: [] });

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      screen.current?.style.setProperty('--cafe-height', `${viewport?.height ?? window.innerHeight}px`);
      screen.current?.style.setProperty('--cafe-top', `${viewport?.offsetTop ?? 0}px`);
      setKeyboardOpen(Boolean(viewport && window.innerHeight - viewport.height > 150));
    };
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); window.removeEventListener('resize', resize); };
  }, []);
  function releasePointer(id: number) { touch.current = pointers.current.release(id); }

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
    let resetInput = () => {};
    let unsubscribeAuth = () => {};
    let profileRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshIdentity = () => {};
    setStatus('Подключаемся…'); setConnected(false); setMembers([]); setArea('Общий зал'); setChatRoom(null);
    typing.current = false;
    setSafety({ blocked: [] });
    touch.current = pointers.current.clear();
    const stop = () => {
      touch.current = pointers.current.clear();
      resetInput();
    };
    const visibility = () => { if (document.hidden) stop(); };
    pauseInput.current = stop;
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    const profileChanged = (event: StorageEvent) => {
      if (useAccount && event.key === 'galaxy-profile-updated') {
        if (profileRefreshTimer) clearTimeout(profileRefreshTimer);
        profileRefreshTimer = setTimeout(() => refreshIdentity(), 3100);
      }
    };
    window.addEventListener('storage', profileChanged);
    const refreshSafety = () => { if (useAccount && room?.connection.isOpen) room.send('safety:action', { requestId: crypto.randomUUID(), action: 'refresh' }); };
    const safetyStorage = (event: StorageEvent) => { if (event.key === 'galaxy-safety-updated') refreshSafety(); };
    window.addEventListener('galaxy-safety-changed', refreshSafety); window.addEventListener('storage', safetyStorage);

    async function start() {
      try {
        const [[{ default: Phaser }, { Client }], sessionResult] = await Promise.all([
          loadCafeRuntime(), useAccount ? getSupabaseBrowser().auth.getSession() : Promise.resolve(null),
        ]);
        if (disposed) return;
        const token = sessionResult?.data.session?.access_token;
        if (useAccount && (!token || sessionResult?.error)) throw new Error('Account session missing');
        const endpoint = process.env.NEXT_PUBLIC_WORLD_URL || window.location.origin;
        const client = new Client(endpoint);
        const joined = await client.joinOrCreate<Snapshot>('cafe', { name, color, movementVersion: 2, ...(useAccount ? { accessToken: token } : {}) });
        if (disposed) { await joined.leave(); return; }
        room = joined;
        joined.onMessage('safety:result', () => {});
        joined.onMessage<CafeSafetyState>('safety:state', data => { if (!disposed) setSafety(data); });
        setRoomId(joined.roomId);
        joined.onLeave(code => {
          if (!disposed) { setConnected(false); setMembers([]); setStatus(code === 4001 ? 'Сессия истекла. Войдите снова или переподключитесь.' : 'Соединение закрыто. Нажмите «Переподключиться».'); }
        });
        joined.onError(() => {
          if (!disposed) { setConnected(false); setStatus('Ошибка связи с сервером мира. Попробуйте переподключиться.'); }
        });
        if (useAccount) {
          const supabase = getSupabaseBrowser();
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (disposed || !joined.connection.isOpen) return;
            if (event === 'SIGNED_OUT') void joined.leave();
            else if (event === 'TOKEN_REFRESHED' && session) joined.send('identity:refresh', { accessToken: session.access_token });
          });
          unsubscribeAuth = () => subscription.unsubscribe();
          refreshIdentity = () => {
            void supabase.auth.getSession().then(({ data, error }) => {
              if (disposed || !joined.connection.isOpen) return;
              if (!error && data.session) joined.send('identity:refresh', { accessToken: data.session.access_token });
              else setStatus('Сессия недоступна. Повторите вход в Café.');
            }).catch(() => { if (!disposed) setStatus('Не удалось обновить профиль. Повторите вход в Café.'); });
          };
          joined.onMessage('identity:error', () => { if (!disposed) setStatus('Не удалось обновить профиль или сессию. Повторите вход в Café.'); });
          joined.onMessage('identity:updated', () => { if (!disposed) setStatus('Вы в Café'); });
        }
        class CafeScene extends Phaser.Scene {
          private visuals = new Map<string, Visual>();
          private lastSent = 0;
          private prediction?: MovementPrediction;
          private unsent: MovementFrame[] = [];
          private elapsed = 0;
          private lastDirection = '0,0';
          private keys!: Record<string, PhaserTypes.Input.Keyboard.Key>;
          constructor() { super('Cafe'); }
          preload() { this.load.atlas('black-cat', '/sprites/black-cat-v1.png', '/sprites/black-cat-v1.json'); }
          create() {
            if (!this.textures.exists('black-cat')) { setStatus('Не удалось загрузить персонажа. Нажмите «Переподключиться».'); return; }
            const fitCamera = () => {
              const { width, height } = this.scale;
              // Fit the room on large screens and keep avatars readable in portrait.
              const zoom = Math.max(.85, Math.min(width / CAFE_WIDTH, height / CAFE_HEIGHT));
              const boundsWidth = Math.max(CAFE_WIDTH, width / zoom);
              const boundsHeight = Math.max(CAFE_HEIGHT, height / zoom);
              // Expand undersized bounds symmetrically instead of anchoring the map.
              this.cameras.main.setZoom(zoom).setBounds(
                (CAFE_WIDTH - boundsWidth) / 2, (CAFE_HEIGHT - boundsHeight) / 2,
                boundsWidth, boundsHeight,
              );
            };
            fitCamera(); this.scale.on('resize', fitCamera);
            this.events.once('shutdown', () => this.scale.off('resize', fitCamera));
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
            for (const direction of ['front', 'left', 'right', 'back']) {
              this.anims.create({ key: `cat-walk-${direction}`, frames: [0, 1, 2, 3].map(frame => ({ key: 'black-cat', frame: `${direction}-${frame}` })), frameRate: 8, repeat: -1 });
            }
            this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, PhaserTypes.Input.Keyboard.Key>;
            this.input.keyboard!.enabled = !typing.current;
            resetInput = () => {
              this.input.keyboard?.resetKeys();
              if (this.input.keyboard) this.input.keyboard.enabled = !typing.current;
              this.elapsed = 0;
              // Retain unacknowledged steps, then explicitly append release.
              this.predictInput({ x: 0, y: 0 }); this.flushInput();
            };
            joined.onStateChange(state => { if (!disposed) this.applySnapshot(state); });
            this.applySnapshot(joined.state);
            setConnected(true); setStatus('Вы в Café'); setChatRoom(joined);
            joined.send('safety:action', { requestId: crypto.randomUUID(), action: 'sync' });
          }
          private applySnapshot(state: Snapshot) {
            if (!state?.players) return;
            const present = new Set<string>(); const roster: Member[] = [];
            state.players.forEach((player, id) => {
              present.add(id); roster.push({ id, name: player.name, avatar: player.avatar, account: player.account });
              let visual = this.visuals.get(id);
              if (!visual) {
                const shadow = this.add.ellipse(0, 0, 26, 10, 0x352b26, .25);
                const ring = this.add.ellipse(0, 0, 30, 12).setStrokeStyle(2, 0x284f80);
                ring.setVisible(id === joined.sessionId);
                const sprite = this.add.sprite(0, 0, 'black-cat', 'front-0').setScale(.18).setOrigin(.5, 316 / 336);
                const label = this.add.text(0, -68, player.name + (id === joined.sessionId ? ' (вы)' : ''), { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff', backgroundColor: '#493c31', padding: { x: 4, y: 2 } }).setOrigin(.5);
                const container = this.add.container(player.x, player.y, [shadow, ring, sprite, label]);
                visual = { container, sprite, label, shadow, direction: 'front', target: player }; this.visuals.set(id, visual);
                if (id === joined.sessionId) this.cameras.main.startFollow(container, true, 1, 1);
              }
              // Schema fields are prototype accessors, so explicitly copy coordinates.
              visual.target = { name: player.name, color: player.color, x: player.x, y: player.y, moving: player.moving, avatar: player.avatar, account: player.account, inputSeq: player.inputSeq };
              if (id === joined.sessionId) {
                if (!this.prediction) this.prediction = new MovementPrediction(player);
                this.prediction.reconcile(player, player.inputSeq);
                visual.container.setPosition(this.prediction.position.x, this.prediction.position.y);
              }
              visual.shadow.setFillStyle(PLAYER_COLORS[player.color] ?? PLAYER_COLORS[0], .3);
              const label = `${player.avatar ? `${player.avatar} ` : ''}${player.name}${id === joined.sessionId ? ' (вы)' : ''}${player.account ? ' · аккаунт' : ' · гость'}`;
              if (visual.label.text !== label) visual.label.setText(label);
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
          private animateVisual(visual: Visual, x: number, y: number, moving: boolean) {
            if (moving && (x || y)) visual.direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'front' : 'back');
            if (moving) {
              const key = `cat-walk-${visual.direction}`;
              if (visual.sprite.anims.currentAnim?.key !== key || !visual.sprite.anims.isPlaying) visual.sprite.play(key);
            } else {
              visual.sprite.anims.stop(); visual.sprite.setFrame(`${visual.direction}-0`);
            }
          }
          private predictInput(input: { x: number; y: number }) {
            if (!this.prediction) return;
            const frame = this.prediction.step(input);
            if (!frame) { if (joined.connection.isOpen) void joined.leave(); return; }
            this.unsent.push(frame);
            const me = this.visuals.get(joined.sessionId);
            if (me) me.container.setPosition(this.prediction.position.x, this.prediction.position.y);
          }
          private flushInput() {
            if (!joined.connection.isOpen) return;
            while (this.unsent.length) joined.send('move', { frames: this.unsent.splice(0, 16) });
          }
          update(time: number, delta: number) {
            if (!this.keys) return;
            this.visuals.forEach((visual, id) => {
              if (id === joined.sessionId) return;
              const blend = Math.min(1, delta / 70);
              const dx = visual.target.x - visual.container.x, dy = visual.target.y - visual.container.y;
              visual.container.x += (visual.target.x - visual.container.x) * blend;
              visual.container.y += (visual.target.y - visual.container.y) * blend;
              visual.container.setDepth(visual.container.y);
              this.animateVisual(visual, dx, dy, Math.hypot(dx, dy) > .2);
            });
            const me = this.visuals.get(joined.sessionId);
            if (!joined.connection.isOpen || document.hidden || !document.hasFocus() || typing.current) {
              this.elapsed = 0;
              if (me) this.animateVisual(me, 0, 0, false);
              return;
            }
            let x = Number(this.keys.RIGHT.isDown || this.keys.D.isDown) - Number(this.keys.LEFT.isDown || this.keys.A.isDown);
            let y = Number(this.keys.DOWN.isDown || this.keys.S.isDown) - Number(this.keys.UP.isDown || this.keys.W.isDown);
            x = x || touch.current.x; y = y || touch.current.y;
            const moving = Boolean(x || y);
            // Same fixed step on client and server, independent of render FPS.
            this.elapsed += Math.min(Math.max(delta, 0), 250);
            const before = this.unsent.length;
            while (this.elapsed >= MOVEMENT_STEP_MS) {
              this.elapsed -= MOVEMENT_STEP_MS;
              this.predictInput({ x, y });
            }
            const direction = `${x},${y}`;
            if (this.unsent.length > before && (direction !== this.lastDirection || time - this.lastSent >= MOVEMENT_BATCH_MS)) {
              this.flushInput(); this.lastSent = time; this.lastDirection = direction;
            }
            if (me) {
              me.container.setDepth(me.container.y);
              this.animateVisual(me, x, y, moving);
            }
          }
        }
        if (!host.current || disposed) { await joined.leave(); return; }
        game = new Phaser.Game({ type: Phaser.CANVAS, width: host.current.clientWidth, height: host.current.clientHeight, parent: host.current, pixelArt: true, backgroundColor: '#775d49', scale: { mode: Phaser.Scale.RESIZE }, scene: CafeScene, audio: { noAudio: true } });
        const resize = new ResizeObserver(() => game?.scale.refresh());
        resize.observe(host.current);
        game.events.once('destroy', () => resize.disconnect());
      } catch {
        game?.destroy(true);
        if (room?.connection.isOpen) await room.leave().catch(() => {});
        if (!disposed) { setConnected(false); setStatus(useAccount ? 'Не удалось войти с профилем. Проверьте вход в аккаунт и связь с Supabase, затем повторите попытку.' : 'Не удалось подключиться к серверу мира. Повторите попытку.'); }
      }
    }
    void start();
    return () => {
      disposed = true;
      pauseInput.current = () => {};
      unsubscribeAuth();
      if (profileRefreshTimer) clearTimeout(profileRefreshTimer);
      window.removeEventListener('storage', profileChanged);
      window.removeEventListener('galaxy-safety-changed', refreshSafety); window.removeEventListener('storage', safetyStorage);
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility);
      touch.current = pointers.current.clear();
      game?.destroy(true);
      if (room?.connection.isOpen) void room.leave().catch(() => {});
    };
  }, [name, color, useAccount, attempt]);

  return <div ref={screen} className={`cafe-screen${keyboardOpen ? ' cafe-keyboard' : ''}`}>
    <div ref={host} className="cafe-canvas" role="img" aria-label="Карта Café с аватарами участников" />
    <header className="cafe-hud">
      <div><strong>Café</strong><span role="status">{status}</span>{connected && <span>В Café: {members.length} · {area}</span>}</div>
      <div className="cafe-actions"><button onClick={toggleFullscreen}>Полный экран</button><a href="/rooms">Комнаты проектов</a><button onClick={onLeave}>Выйти из Café</button></div>
    </header>
    {!connected && <div className="cafe-reconnect"><button onClick={() => setAttempt(value => value + 1)}>Переподключиться</button></div>}
    {fullscreenError && <p className="cafe-fullscreen-error" role="status">{fullscreenError}</p>}
    {chatRoom && <CafeChat room={chatRoom} connected={connected} onTyping={onTyping} safety={safety} account={useAccount} />}
    <details className="cafe-info"><summary>Участники и управление</summary>
      <p>Стрелки или WASD — движение. На телефоне удерживайте кнопки направления.</p>
      <ul aria-label="Участники Café">{members.map(member => <li key={member.id}>{member.avatar} {member.name} · {member.account ? 'аккаунт' : 'гость'}{chatRoom && member.id !== chatRoom.sessionId && <SafetyActions target={{ kind: 'cafe_player', sessionId: member.id }} cafe={chatRoom} blocked={safety.blocked.some(row => row.sessionId === member.id)} account={useAccount} onTyping={onTyping} />}</li>)}</ul>
      {chatRoom && Boolean(safety.blocked.length) && <><h3>Скрытые собеседники</h3><ul>{safety.blocked.map(row => <li key={row.sessionId}>{row.name} · {row.persistent ? 'аккаунт заблокирован' : 'до конца посещения'}<SafetyActions target={{ kind: 'cafe_player', sessionId: row.sessionId }} cafe={chatRoom} blocked account={useAccount} onTyping={onTyping} /></li>)}</ul></>}
      <small>Комната: {roomId}</small>
    </details>
    <div className="cafe-controls" aria-label="Управление аватаром">{DIRECTIONS.map(direction => <button key={direction.label} aria-label={direction.label} disabled={!connected}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); touch.current = pointers.current.press(event.pointerId, direction); }}
      onPointerUp={event => releasePointer(event.pointerId)} onPointerCancel={event => releasePointer(event.pointerId)}
      onLostPointerCapture={event => releasePointer(event.pointerId)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') touch.current = { x: direction.x, y: direction.y }; }}
      onKeyUp={() => { touch.current = pointers.current.value(); }} onBlur={() => { touch.current = pointers.current.value(); }}>{direction.glyph}</button>)}</div>
  </div>;
}
