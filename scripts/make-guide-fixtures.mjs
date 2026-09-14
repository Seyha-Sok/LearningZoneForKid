import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 const page=await browser.newPage();await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:5173/');
 const fixtures=await page.evaluate(async()=>{
  const {prepareInk}=await import('/src/recognition.ts');const {getGuide}=await import('/src/letters.ts');
  return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].flatMap(letter=>[false,true].map(lower=>({label:letter,lower,pixels:Array.from(prepareInk(getGuide(letter,lower)))})));
 });
 await writeFile('.checks/handwriting-data/guide-fixtures.json',JSON.stringify(fixtures));
} finally {await browser.close();}
