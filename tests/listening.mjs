import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
try {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = a => { if (a instanceof Uint32Array && a.length === 1) { a[0]=12; return a; } return random(a); };
    window.__audio=[]; const NativeAudio=Audio;
    window.Audio=class extends NativeAudio { constructor(...args) { super(...args); this.addEventListener('playing',()=>window.__audio.push(this.src)); } };
  });
  const page=await context.newPage(), errors=[], external=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',r=>{ if(new URL(r.request().url()).origin!==new URL(origin).origin){external.push(r.request().url());return r.abort();}return r.continue();});
  await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector('#account-summary').textContent.includes('Guest practice'));
  await page.locator('#quiz-mode').click();
  await page.locator('#quiz-new').click();
  await page.waitForFunction(()=>!document.querySelector('#quiz-check').disabled,undefined,{timeout:30000});
  assert.equal(await page.locator('#letter-title').innerText(),'Listen & write');
  assert.equal(await page.locator('#guides path').count(),0);
  assert.equal(await page.locator('#word-picture').isVisible(),false);
  assert.equal(await page.locator('#alphabet [aria-pressed="true"]').count(),0);
  await page.locator('#quiz-check').click();
  assert.match(await page.locator('#feedback-text').innerText(),/whole letter/);
  const cdp=await context.newCDPSession(page);
  async function draw(letter) {
    await page.locator('#board').scrollIntoViewIfNeeded();
    const paths=await page.evaluate(async letter=>{
      const {getGuide}=await import('/src/letters.ts');const matrix=document.querySelector('#board').getScreenCTM();
      return getGuide(letter,false).map(s=>s.map(p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:q.x,y:q.y};}));
    },letter);
    for(const s of paths){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...s[0],id:0}]});for(const p of s.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  }
  await draw('A');await page.locator('#quiz-check').click();
  await page.waitForFunction(()=>!document.querySelector('#quiz-check').disabled,undefined,{timeout:60000});
  assert.match(await page.locator('#feedback-text').innerText(),/Not quite/);
  assert.equal(await page.locator('#points').innerText(),'0');
  await page.locator('#clear').click();await draw('M');await page.locator('#quiz-check').click();
  await page.waitForFunction(()=>document.querySelector('#feedback-text').textContent.includes('Correct!'),undefined,{timeout:60000});
  assert.equal(await page.locator('#points').innerText(),'10');
  assert.equal(await page.locator('#quiz-check').isDisabled(),true);
  await page.waitForFunction(()=>window.__audio.some(s=>s.endsWith('/quiz-correct.wav')));
  assert.ok(await page.evaluate(()=>window.__audio.some(s=>s.endsWith('/M.wav'))));
  await page.screenshot({path:'.checks/listening-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#free-mode').click();assert.equal(await page.locator('#recognize').isVisible(),true);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#points').textContent==='10');
  await page.setViewportSize({width:320,height:740});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const failed=await browser.newContext();await failed.route('**/audio/quiz-intro.wav',r=>r.abort());
  const p=await failed.newPage();await p.goto(origin);await p.waitForFunction(()=>document.querySelector('#account-summary').textContent.includes('Guest practice'));
  await p.locator('#quiz-mode').click();await p.locator('#quiz-new').click();
  await p.waitForFunction(()=>document.querySelector('#feedback-text').textContent.includes('Sound could not play'));
  assert.equal(await p.locator('#quiz-check').isDisabled(),true);assert.equal(await p.locator('#points').innerText(),'0');
  console.log('PASS listening: real local audio, hidden target, real touch recognition, wrong/blank no points, correct M +10 once, reload persistence, mobile layout, audio failure, no external requests.');
} finally { await browser.close(); }
