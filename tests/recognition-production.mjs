import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {getGuide} from '../src/letters.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const origin=process.env.PRODUCTION_URL||'http://127.0.0.1:5174';
try {
 const context=await browser.newContext({viewport:{width:390,height:844}}), external=[], errors=[];
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin!==new URL(origin).origin){external.push(route.request().url());return route.abort();}
  return route.continue();
 });
 if(process.env.PREVIEW_MODEL){
  await context.route('**/handwriting/manifest.json',r=>r.fulfill({json:{labels:[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],minimum_confidence:.85,minimum_margin:.35}}));
  await context.route('**/handwriting/letters.onnx',r=>r.fulfill({path:'.checks/handwriting-data/preview.onnx',contentType:'application/octet-stream'}));
 }
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin);await page.locator('#free-mode').click();await page.locator('[data-letter="Z"]').click();
 await page.locator('#board').scrollIntoViewIfNeeded();
 const strokes=await page.evaluate(strokes=>{const matrix=document.querySelector('#board').getScreenCTM();return strokes.map(stroke=>stroke.map(p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:q.x,y:q.y};}));},getGuide('A',false));
 for(const stroke of strokes){await page.mouse.move(stroke[0].x,stroke[0].y);await page.mouse.down();for(const p of stroke.slice(1))await page.mouse.move(p.x,p.y,{steps:10});await page.mouse.up();}
 await page.locator('#recognize').click();
 await page.waitForFunction(()=>!document.querySelector('#recognize').disabled,undefined,{timeout:60000});
 const message=await page.locator('#feedback-text').innerText();
 assert.match(message,/I think this is A or a/);
 assert.equal(await page.locator('#points').innerText(),'0');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:'.checks/recognition-production.png',fullPage:true});
 console.log('Production: bundled worker and local runtime recognize drawn A with Z selected; no external requests or points.');
}finally{await browser.close();}
