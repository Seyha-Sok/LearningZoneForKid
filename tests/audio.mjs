import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { alphabet, words } from '../src/letters.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173/';
const origin = new URL(base).origin;
const external = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    external.push(url); return route.abort();
  });
  await context.addInitScript(() => {
    window.__clips = [];
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio { constructor(...args) { super(...args); window.__clips.push(this); } };
    window.speechSynthesis.speak = () => { throw new Error('Browser/cloud speech must not be used'); };
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  const manifest = await page.evaluate(async () => (await fetch('./audio/manifest.json')).json());
  assert.equal(manifest.voice, 'Kokoro af_heart');
  assert.equal(manifest.networkDisabledDuringGeneration, true);
  assert.deepEqual(manifest.prompts.map(x => x.letter), alphabet);
  assert.deepEqual(manifest.prompts.map(x => x.word), words);
  const decoded = await page.evaluate(async () => {
    const audioContext = new AudioContext();
    const results = [];
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const response = await fetch(`./audio/${letter}.wav`);
      if (!response.ok) throw new Error(`Missing ${letter}`);
      const bytes = await response.arrayBuffer();
      const clip = await audioContext.decodeAudioData(bytes);
      results.push({ letter, duration: clip.duration, channels: clip.numberOfChannels });
    }
    await audioContext.close(); return results;
  });
  assert.equal(decoded.length, 26);
  assert.ok(decoded.every(x => x.duration > 0.4 && x.duration < 10 && x.channels === 1));
  for (const casing of ['upper', 'lower']) {
    await page.locator(`#${casing}`).click();
    await page.locator('[data-letter="A"]').click();
    await page.locator('#hear').tap();
    await page.waitForFunction(() => window.__clips.at(-1)?.currentTime > 0.05);
    assert.match(await page.evaluate(() => window.__clips.at(-1).src), /\/audio\/A.wav$/);
  }
  // A second tap replaces the first clip; a mode change stops it.
  await page.locator('#hear').tap();
  assert.equal(await page.evaluate(() => window.__clips.at(-2).paused), true);
  await page.locator('#free-mode').click();
  assert.equal(await page.evaluate(() => window.__clips.at(-1).paused), true);
  assert.deepEqual(external, [], 'App and audio must request only this local server');
  assert.deepEqual(errors, []);
  console.log('PASS: all 26 WAVs decode; mobile tap playback in both cases; repeated-tap and mode cancellation; zero external requests; browser speech unused.');
} finally { await browser.close(); }
