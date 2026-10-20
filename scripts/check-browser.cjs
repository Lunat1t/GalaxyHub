const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const origin = process.env.CHECK_URL || 'http://localhost:2567';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function position(page) {
  return page.locator('canvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let x = 0, y = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 40 && pixels[i + 1] === 79 && pixels[i + 2] === 128) {
      const offset = i / 4; x += offset % canvas.width; y += Math.floor(offset / canvas.width); count++;
    }
    return count ? { x: x / count, y: y / count } : null;
  });
}
async function enter(page, name) {
  await page.goto(`${origin}/cafe`);
  await page.getByLabel('Имя гостя').fill(name);
  await page.getByRole('button', { name: 'Войти в Café', exact: true }).click();
  await page.getByText('Вы в Café', { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas'); if (!c) return false;
    const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return p.some((_, i) => i % 4 === 0 && p[i] === 40 && p[i + 1] === 79 && p[i + 2] === 128);
  });
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], results = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      const loading = [];
      for (let pass = 0; pass < 3; pass++) {
        const cachedBefore = pass ? await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat()) : [];
        const started = Date.now(); await enter(page, mobile ? 'V1 телефон' : 'V1 браузер');
        loading.push({ pass, fullEntryMs: Date.now() - started, ...await page.evaluate(cachedBefore => {
          const assets = performance.getEntriesByType('resource').filter(r => r.name.includes('/_next/static/'));
          return { assets: assets.length, cachedBeforeEntry: assets.filter(r => cachedBefore.includes(r.name)).length, transferredBytes: assets.reduce((sum, r) => sum + r.transferSize, 0) };
        }, cachedBefore) });
        await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await pause(300);
        if (pass < 2) await page.getByRole('button', { name: 'Выйти из Café', exact: true }).click();
      }
      assert.equal(loading.at(-1).cachedBeforeEntry, loading.at(-1).assets, 'Warm entry must use previously cached resources');
      if (!mobile) { await page.getByRole('button', { name: 'Полный экран', exact: true }).click(); await page.waitForFunction(() => Boolean(document.fullscreenElement)); await page.getByRole('button', { name: 'Полный экран', exact: true }).click(); await page.waitForFunction(() => !document.fullscreenElement); await pause(200); }
      const start = await position(page);
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width * .7, canvas.y + canvas.height * .8); await pause(150);
      assert.deepEqual(await position(page), start, 'Map click must not move the avatar');
      if (!mobile) {
        await page.keyboard.down('ArrowRight'); await pause(500); await page.keyboard.up('ArrowRight');
      } else {
        const center = async name => { const b = await page.getByRole('button', { name, exact: true }).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
        const right = await center('Вправо'), up = await center('Вверх');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 1 }, { ...up, id: 2 }] }); await pause(250);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...right, id: 1 }] }); await pause(80);
        const one = await position(page); await pause(250); const two = await position(page);
        assert(Math.abs(one.x - two.x) <= 2 && two.y < one.y - 10, 'Releasing one finger must keep the other direction active');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await pause(80); const release = await position(page); await pause(600);
      assert.deepEqual(await position(page), release, 'No rollback after release');
      assert(release.x > start.x + 10, 'Avatar must move while holding input');
      await page.getByRole('button', { name: 'Чат', exact: true }).click();
      const input = page.getByLabel(/Сообщение —/); await input.fill('<img src=x onerror=alert(1)> V1');
      await input.press('Enter'); await page.locator('.cafe-chat-message p').filter({ hasText: '<img src=x onerror=alert(1)> V1' }).waitFor();
      await page.waitForFunction(() => document.querySelector('#cafe-message')?.value === '');
      assert.equal(await input.inputValue(), ''); assert.equal(await page.locator('.cafe-chat-message img').count(), 0);
      if (mobile) {
        await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 400 }); window.visualViewport.dispatchEvent(new Event('resize')); });
        await pause(150); const box = await input.boundingBox(); assert(box.y >= 0 && box.y + box.height <= 400, 'Composer must fit above simulated keyboard');
        await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
        await pause(250);
      }
      await input.focus(); await pause(100); const typingPosition = await position(page);
      await page.keyboard.down('ArrowRight'); await pause(200); await page.keyboard.up('ArrowRight');
      assert.deepEqual(await position(page), typingPosition, 'Typing must disable movement');
      await page.screenshot({ path: `${process.env.CHECK_OUTPUT || '/tmp'}/galaxy-v1-${mobile ? 'mobile' : 'desktop'}.png` });
      await page.getByRole('button', { name: 'Выйти из Café', exact: true }).click();
      await page.getByRole('heading', { name: 'Гостевой вход' }).waitFor();
      for (const width of [320, 390, 844]) {
        await page.setViewportSize({ width, height: 700 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
      }
      const health = await context.request.get(`${origin}/health`); assert.equal(health.status(), 200);
      for (const path of ['/api/rooms', '/api/safety/blocks']) {
        const response = await context.request.get(`${origin}${path}`); assert.equal(response.status(), 401);
        assert(response.headers()['cache-control'].includes('no-store'));
      }
      const crossOrigin = await context.request.post(`${origin}/api/safety/reports`, { headers: { origin: 'https://example.com' }, data: {} }); assert.equal(crossOrigin.status(), 403);
      const auth = await context.request.get(`${origin}/auth/callback?next=https://example.com`, { maxRedirects: 0 });
      assert(new URL(auth.headers().location).origin === origin);
      const manifest = await (await context.request.get(`${origin}/manifest.webmanifest`)).json(); assert.equal(manifest.display, 'standalone');
      await page.goto(`${origin}/cafe`); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)))).flat());
      assert(cached.every(path => path.startsWith('/_next/static/') || path.startsWith('/app-icons/') || path === '/offline.html' || ['/sprites/lavender-doll-v2.png', '/sprites/lavender-doll-v2.json'].includes(path)), 'Never cache accounts, API or page HTML');
      await context.setOffline(true); await page.goto(`${origin}/rooms`); assert(await page.getByText(/Нет соединения/, { exact: true }).count()); await context.setOffline(false);
      results.push({ mobile, loading, cachedEntries: cached.length }); await context.close();
    }
    assert.deepEqual(errors, [], 'No browser exceptions');
    fs.writeFileSync(`${process.env.CHECK_OUTPUT || '/tmp'}/galaxy-v1-browser.json`, JSON.stringify({ environment: 'Local production Chromium; mobile and soft keyboard simulated; not a Render or real phone benchmark.', results, errors }, null, 2));
    console.log(JSON.stringify({ result: 'Browser checks passed', results, errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
