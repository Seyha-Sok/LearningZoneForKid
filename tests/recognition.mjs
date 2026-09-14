import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const fixtures = JSON.parse(await readFile('.checks/handwriting-data/browser-fixtures.json', 'utf8'));
const errors = [], external = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(origin).origin) { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin);
  await page.locator('#free-mode').click();
  await page.locator('#recognize').click();
  assert.match(await page.locator('#feedback-text').innerText(), /whole letter/);
  const results = await page.evaluate(async fixtures => {
    const { recognizeInk, prepareInk } = await import('/src/recognition.ts');
    const { getGuide } = await import('/src/letters.ts');
    if (prepareInk([]) !== null || prepareInk([[{x:100,y:100},{x:100,y:100}]]) !== null) throw new Error('Blank/dot should not reach model');
    const predictions = [];
    for (const fixture of fixtures) {
      const pixels = Float32Array.from([...fixture.pixels, ...fixture.pixels, ...fixture.pixels], n => n / 255);
      const guess = await recognizeInk(pixels);
      predictions.push(guess);
    }
    const guides = [];
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      guides.push({ expected: letter, ...await recognizeInk(prepareInk(getGuide(letter, false))) });
    }
    return { predictions, guides };
  }, fixtures);
  for (let i = 0; i < fixtures.length; i++) {
    const sorted = fixtures[i].probabilities.map((p,j) => ({p,j})).sort((a,b) => b.p-a.p);
    const expected = sorted[0].p >= .85 && sorted[0].p-sorted[1].p >= .35 ? String.fromCharCode(65+sorted[0].j) : null;
    assert.equal(results.predictions[i].letter, expected, `Python/browser parity ${fixtures[i].label}`);
    assert.ok(Math.abs(results.predictions[i].confidence-sorted[0].p) < .001, 'ONNX numerical parity');
  }
  // Draw a real pointer path based on A, while the selected prompt is Z.
  await page.locator('[data-letter="Z"]').click();
  await page.locator('#board').scrollIntoViewIfNeeded();
  const paths = await page.evaluate(async () => {
    const { getGuide } = await import('/src/letters.ts');
    const matrix = document.querySelector('#board').getScreenCTM();
    return getGuide('A', false).map(stroke => stroke.map(p => {const q = new DOMPoint(p.x,p.y).matrixTransform(matrix);return {x:q.x,y:q.y};}));
  });
  const cdp = await context.newCDPSession(page);
  for (const stroke of paths) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...stroke[0],id:0}]});
    for (const p of stroke.slice(1)) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:0}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await page.locator('#recognize').click();
  await page.waitForFunction(() => !document.querySelector('#recognize').disabled);
  assert.match(await page.locator('#feedback-text').innerText(), /I think this is A or a/);
  assert.equal(await page.locator('#points').innerText(),'0');
  await page.screenshot({ path: '.checks/recognition-mobile.png', fullPage: true });
  await writeFile('.checks/handwriting-data/browser-report.json', JSON.stringify(results,null,2));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  // An in-flight prediction must not overwrite a newer drawing/mode.
  const delayed = await browser.newContext();
  await delayed.addInitScript(() => {
    window.__predictionMessages = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); this.addEventListener('message', () => window.__predictionMessages++); }
    };
  });
  await delayed.route('**/handwriting/manifest.json', async route => { await new Promise(r=>setTimeout(r,1500)); await route.continue(); });
  const second = await delayed.newPage(); await second.goto(origin);
  await second.locator('#free-mode').click();
  await second.locator('#board').scrollIntoViewIfNeeded();
  const box = await second.locator('#board').boundingBox();
  await second.mouse.move(box.x+100,box.y+100);await second.mouse.down();await second.mouse.move(box.x+160,box.y+220,{steps:12});await second.mouse.up();
  await second.locator('#recognize').click();await second.locator('#trace-mode').click();
  await second.waitForFunction(() => window.__predictionMessages > 0, undefined, { timeout: 60000 });
  assert.match(await second.locator('#feedback-text').innerText(),/tracing the whole letter/);
  const failureContext = await browser.newContext();
  await failureContext.route('**/handwriting/letters.onnx', route => route.abort());
  const failure = await failureContext.newPage(); await failure.goto(origin);
  await failure.locator('#free-mode').click();
  await failure.locator('#board').scrollIntoViewIfNeeded();
  const failureBox = await failure.locator('#board').boundingBox();
  await failure.mouse.move(failureBox.x+100,failureBox.y+100);await failure.mouse.down();await failure.mouse.move(failureBox.x+160,failureBox.y+220,{steps:12});await failure.mouse.up();
  await failure.locator('#recognize').click();
  await failure.waitForFunction(() => document.querySelector('#feedback-text').textContent.includes('isn’t available'), undefined, { timeout: 60000 });
  assert.equal(await failure.locator('#points').innerText(), '0');
  await failure.locator('#trace-mode').click(); assert.equal(await failure.locator('#check').isVisible(), true);
  assert.deepEqual(external,[]);
  assert.deepEqual(errors,[]);
  console.log('Recognition: browser/Python parity, no external network, touch input, no points, stale-result cancellation, mobile layout passed.');
} finally { await browser.close(); }
