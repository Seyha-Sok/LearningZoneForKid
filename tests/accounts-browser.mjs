import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getGuide } from '../src/letters.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const db=new Pool({connectionString:process.env.DATABASE_URL});
const email=`browser-${randomUUID()}@example.test`, password=`Test-${randomUUID()}`;
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:5173';
const errors=[];
async function trace(page,letter='A') {
  await page.locator('[data-letter="'+letter+'"]').click();
  await page.locator('#board').scrollIntoViewIfNeeded();
  const paths=await page.evaluate(strokes=>{const matrix=document.querySelector('#board').getScreenCTM();return strokes.map(stroke=>stroke.map(p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:q.x,y:q.y};}));},getGuide(letter,false));
  for(const path of paths){await page.mouse.move(path[0].x,path[0].y);await page.mouse.down();for(const p of path.slice(1))await page.mouse.move(p.x,p.y,{steps:10});await page.mouse.up();}
  await page.locator('#check').click();
}
try {
 const first=await browser.newContext({viewport:{width:1365,height:1050}});
 const page=await first.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin);
 await page.locator('#parent-account').click();await page.locator('#switch-account-mode').click();
 await page.locator('#parent-name').fill('Test Parent');await page.locator('#parent-email').fill(email);await page.locator('#parent-phone').fill('+1 555 0100');await page.locator('#parent-password').fill(password);await page.locator('#first-learner').fill('Sunny');
 await page.locator('#parent-form button[type=submit]').click();await page.locator('#continue-learning').waitFor();
 await page.locator('#continue-learning').click();assert.match(await page.locator('#account-summary').innerText(),/Sunny/);
 await trace(page);await page.waitForFunction(()=>document.querySelector('#points').textContent==='10');
 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 const other=await mobile.newPage();other.on('pageerror',e=>errors.push(String(e)));await other.goto(origin);
 await other.locator('#parent-account').click();await other.locator('#parent-email').fill(email);await other.locator('#parent-password').fill(password);await other.locator('#parent-form button[type=submit]').click();await other.locator('#continue-learning').click();
 assert.equal(await other.locator('#points').innerText(),'10');assert.match(await other.locator('#account-summary').innerText(),/Sunny/);
 await other.reload();await other.waitForFunction(()=>document.querySelector('#points').textContent==='10');
 await other.locator('#parent-account').click();await other.locator('#new-learner').fill('Moon');await other.locator('#add-learner button').click();await other.waitForFunction(()=>document.querySelector('#account-summary').textContent.includes('Moon'));
 assert.equal(await other.locator('#points').innerText(),'0');
 await other.locator('#learner-select').selectOption({label:'Sunny'});await other.waitForFunction(()=>document.querySelector('#points').textContent==='10');
 await other.screenshot({path:'.checks/parent-account-mobile.png',fullPage:true});
 await other.locator('#continue-learning').click();
 assert.equal(await other.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await other.screenshot({path:'.checks/shared-progress-mobile.png',fullPage:true});
 // A save failure leaves points unchanged and allows the same drawing to be retried.
 await page.route('**/api/learners/*/progress',route=>route.request().method()==='POST'?route.abort():route.continue());
 await trace(page,'B');await page.waitForFunction(()=>document.querySelector('#feedback-text').textContent.includes('could not be saved'));
 assert.equal(await page.locator('#points').innerText(),'10');
 await page.unroute('**/api/learners/*/progress');await page.locator('#check').click();await page.waitForFunction(()=>document.querySelector('#points').textContent==='20');
 await other.reload();await other.waitForFunction(()=>document.querySelector('#points').textContent==='20');
 await other.locator('#parent-account').click();await other.locator('#sign-out').click();await other.locator('#parent-form').waitFor();await other.locator('#close-account').click();
 assert.match(await other.locator('#account-summary').innerText(),/Guest/);assert.equal(await other.locator('#points').innerText(),'0');
 assert.deepEqual(errors,[]);
 console.log('PASS: parent registration, optional phone, child profiles, two-browser login, shared progress, reload persistence, separate children, save failure/retry, mobile layout, sign-out to guest.');
}finally{
 await browser.close();await db.query('DELETE FROM "user" WHERE email=$1',[email]);await db.end();
}
