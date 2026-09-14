// Optional browser integration checks: PLAYWRIGHT_MODULE may point to an existing Playwright package.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
await mkdir('.checks', { recursive: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1365, height: 1050 } });
await context.addInitScript(() => {
  window.__clips = [];
  const NativeAudio = window.Audio;
  window.Audio = class extends NativeAudio { constructor(...args) { super(...args); window.__clips.push(this); } };
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(String(e)));
async function drawGuides(target, skipLast = false, touch = false) {
  await target.evaluate(() => document.fonts.ready);
  await target.locator('#board').scrollIntoViewIfNeeded();
  await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const paths = await target.locator('.guide-dash').evaluateAll(nodes => nodes.map(node => {
    const matrix = node.getScreenCTM(), length = node.getTotalLength();
    const steps = Math.max(3, Math.ceil(length / 7));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const p = node.getPointAtLength(length * i / steps).matrixTransform(matrix);
      return { x: p.x, y: p.y };
    });
  }));
  if (skipLast) paths.pop();
  const cdp = touch ? await target.context().newCDPSession(target) : null;
  for (const points of paths) {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 0 }] });
      for (const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 0 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await target.mouse.move(points[0].x, points[0].y); await target.mouse.down();
      for (const p of points.slice(1)) await target.mouse.move(p.x, p.y);
      await target.mouse.up();
    }
  }
  if (cdp) await cdp.detach();
}
try {
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:5173/');
  await page.locator('#letter-title').waitFor();
  assert.equal(await page.locator('#alphabet button').count(), 26);
  await page.locator('#check').click(); assert.match(await page.locator('#feedback').innerText(), /make a mark/);
  const point = await page.locator('.start-dot').first().boundingBox();
  await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
  await page.locator('#check').click(); assert.equal(await page.locator('#points').innerText(), '0');
  await page.locator('#clear').click(); await drawGuides(page); await page.locator('#check').click();
  assert.equal(await page.locator('#points').innerText(), '10');
  await page.locator('#check').click(); assert.equal(await page.locator('#points').innerText(), '10');
  await page.reload(); assert.equal(await page.locator('#points').innerText(), '10');
  await page.locator('#lower').click(); await page.locator('[data-letter="I"]').click();
  await drawGuides(page, true); await page.locator('#check').click(); assert.equal(await page.locator('#points').innerText(), '10');
  await page.locator('#clear').click(); await drawGuides(page); await page.locator('#check').click();
  assert.equal(await page.locator('#points').innerText(), '20');
  await page.locator('#hear').click();
  await page.waitForFunction(() => window.__clips.at(-1)?.currentTime > 0.05);
  assert.match(await page.evaluate(() => window.__clips.at(-1).src), /\/audio\/I.wav$/);
  await page.locator('[data-letter="J"]').click();
  assert.equal(await page.evaluate(() => window.__clips.at(-1).paused), true);
  await page.locator('[data-letter="I"]').click();
  await page.route('**/audio/I.wav', route => route.abort());
  await page.locator('#hear').click();
  await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('Sound isn’t available'));
  await page.unroute('**/audio/I.wav');
  await page.locator('#free-mode').click(); assert.equal(await page.locator('#check').isVisible(), false);
  assert.equal(await page.locator('.guide-dash').count(), 0);
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x + 80, box.y + 80); await page.mouse.down(); await page.mouse.move(box.x + 140, box.y + 150); await page.mouse.up();
  assert.equal(await page.locator('.drawn-line').count(), 1);
  await page.locator('#undo').click(); assert.equal(await page.locator('.drawn-line').count(), 0);
  assert.equal(await page.locator('#points').innerText(), '20');
  await page.locator('#trace-mode').click();
  for (const casing of ['upper', 'lower']) {
    await page.locator(`#${casing}`).click();
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      await page.locator(`[data-letter="${letter}"]`).click();
      assert.ok(await page.locator('.guide-dash').count() > 0);
      assert.equal(await page.locator('#guides').evaluate(node => { const b = node.getBBox(); return b.x >= 0 && b.y >= 0 && b.x + b.width <= 640 && b.y + b.height <= 420; }), true);
    }
  }
  await page.locator('#upper').click(); await page.locator('[data-letter="A"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.checks/desktop.png', fullPage: true });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const phone = await mobile.newPage(); phone.on('pageerror', e => errors.push(String(e)));
  await phone.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:5173/');
  await phone.locator('[data-letter="L"]').click(); await drawGuides(phone, false, true); await phone.locator('#check').click();
  await phone.screenshot({ path: '.checks/touch.png', fullPage: true });
  if (await phone.locator('#points').innerText() !== '10') console.log(await phone.locator('#feedback').innerText(), await phone.locator('#ink').innerHTML());
  assert.equal(await phone.locator('#points').innerText(), '10', 'Touch tracing earns points');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.locator('#lower').click(); await phone.locator('[data-letter="G"]').click();
  await phone.screenshot({ path: '.checks/mobile.png', fullPage: true });
  await phone.setViewportSize({ width: 320, height: 700 });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px layout fits');
  assert.deepEqual(errors, []);
  console.log('PASS: 52 guides; mouse and touch scoring; dot and omitted-dot rejection; persistence; no duplicate points; free drawing/undo; local audio playback/cancellation/fallback; desktop, 390px and 320px layouts; no page errors.');
} finally { await browser.close(); }
