const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.WEB_SERVER_URL || 'http://127.0.0.1:3000';

async function pixels(page) {
  return page.locator('canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // Hash the rendered room without moving image data across the browser boundary.
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) hash = Math.imul(hash ^ data[i] ^ (data[i + 1] << 8) ^ (data[i + 2] << 16), 16777619);
    return hash;
  });
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const errors = [], results = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        isMobile: mobile, hasTouch: mobile,
      });
      const page = await context.newPage(), requests = [], sockets = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push(request.url()));
      page.on('websocket', socket => sockets.push(socket.url()));
      await page.goto(origin);
      await page.getByText('Ваша личная комната', { exact: true }).waitFor();
      assert.equal(await page.locator('canvas').count(), 1);
      await page.getByRole('img', { name: 'Личная пустая комната с чёрным котом', exact: true }).waitFor();
      const before = await pixels(page);
      if (mobile) {
        const box = await page.getByRole('button', { name: 'Вправо', exact: true }).boundingBox();
        const session = await context.newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
        await page.waitForTimeout(650);
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(650);
        await page.keyboard.up('ArrowRight');
      }
      await page.waitForTimeout(150);
      const after = await pixels(page);
      assert.notEqual(after, before, 'Keyboard/touch moves the rendered cat');
      await page.waitForTimeout(150);
      assert.equal(await pixels(page), after, 'Cat remains still after release');
      assert(requests.some(url => url.endsWith('/sprites/black-cat-v1.png')));
      assert(!requests.some(url => /lavender-doll|matchmake|\/api\/rooms/.test(url)), 'Room loads no girl or shared world');
      assert.deepEqual(sockets, [], 'Personal room opens no multiplayer connection');
      assert.equal(await page.getByRole('button', { name: /Карта|Чат|Café|Войти/ }).count(), 0);
      await page.screenshot({ path: `/tmp/galaxy-personal-room-${mobile ? 'mobile' : 'desktop'}.png` });
      await page.getByRole('link', { name: 'Профиль', exact: true }).click();
      await page.waitForURL('**/profile');
      assert.equal(await page.locator('a[href="/cafe"], a[href^="/campus"], a[href^="/rooms"]').count(), 0);
      await page.getByRole('link', { name: 'Моя комната', exact: true }).click();
      await page.getByText('Ваша личная комната', { exact: true }).waitFor();
      assert.equal(await page.locator('canvas').count(), 1, 'Returning from profile mounts only one canvas');
      await page.setViewportSize({ width: mobile ? 844 : 1000, height: mobile ? 390 : 700 });
      await page.waitForTimeout(150);
      assert(await page.locator('canvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
      if (!mobile) {
        for (const path of ['/campus', '/campus/hall', '/campus/library', '/cafe', '/rooms', '/rooms/00000000-0000-4000-8000-000000000000']) {
          await page.goto(origin + path);
          await page.getByText('Ваша личная комната', { exact: true }).waitFor();
          assert.equal(new URL(page.url()).pathname, '/', 'Legacy locations lead to the single room');
        }
        const manifest = await (await page.request.get(origin + '/manifest.webmanifest')).json();
        assert.equal(manifest.start_url, '/');
        const health = await page.request.get(origin + '/api/health');
        assert(health.ok() && (await health.json()).services.personalRoom);
        const oldWorld = await page.request.post(origin + '/matchmake/joinOrCreate/cafe', { data: {} });
        assert.equal(oldWorld.status(), 404, 'Old multiplayer Cafe is not registered');
        await page.goto(origin + '/auth/callback');
        await page.waitForURL('**/profile?auth_error=*');
      }
      results.push({ mobile, cat: true, movement: true, profileReturn: true, singleRoom: true, multiplayerConnections: sockets.length });
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ results, errors, scope: 'Personal room and profile navigation; live account login requires Supabase configuration' }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
