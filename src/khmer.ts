import './style.css';
import { createKhmerAudioPlayer, hasKhmerAudio } from './khmer-audio.ts';
const pronunciation = createKhmerAudioPlayer();
import { languageNavigation } from './languages.ts';
const groups = {
  consonants: { name:'Consonants', characters:[...'កខគឃងចឆជឈញដឋឌឍណតថទធនបផពភមយរលវសហឡអ'] },
  vowels: { name:'Vowel signs', characters:['ា','ិ','ី','ឹ','ឺ','ុ','ូ','ួ','ើ','ឿ','ៀ','េ','ែ','ៃ','ោ','ៅ','ុំ','ំ','ាំ','ះ','ុះ','េះ','ោះ'] },
  independent: { name:'Independent vowels', characters:['ឥ','ឦ','ឧ','ឪ','ឫ','ឬ','ឭ','ឮ','ឯ','ឰ','ឱ','ឳ','ឲ្យ'] },
  numbers: { name:'Khmer numbers', characters:[...'០១២៣៤៥៦៧៨៩'] },
};
type Group = keyof typeof groups;
let group: Group = 'consonants';
let characters = groups[group].characters;
const displayCharacter = (letter:string) => group === 'vowels' ? '◌'+letter : letter;
const hasNumberedGuide = (_letter:string) => group === 'consonants' || group === 'vowels';
type Point = {x:number;y:number};
let selected = 0, mode: 'trace' | 'free' = 'trace', strokes: Point[][] = [], active: Point[] | null = null, pointer: number | null = null;
document.body.classList.add('khmer-page');
document.querySelector('#app')!.innerHTML = `
<header class="topbar"><a class="brand" href="./"><span class="brand-mark">ab</span><span>little letters<span class="brand-dot">.</span></span></a><span class="top-note">Little steps. Big discoveries.</span></header>
<main><div class="welcome"><div><div class="eyebrow">YOUR KHMER ADVENTURE</div><h1>Little marks. Khmer letters.</h1><p>Choose a character, trace its shape, then try it on your own.</p></div></div>
<div class="workspace"><aside class="alphabet-panel"><div class="section-label"><h2>Pick a character</h2><span id="character-count">33 consonants</span></div><label class="character-group-label" for="character-group">Choose a group</label><select id="character-group"><option value="consonants">Consonants · ព្យញ្ជនៈ</option><option value="vowels">Vowel signs · ស្រៈនិស្ស័យ</option><option value="independent">Independent vowels · ស្រៈពេញតួ</option><option value="numbers">Khmer numbers · លេខខ្មែរ</option></select><div id="alphabet" class="alphabet-grid" aria-label="Khmer consonants"></div><div class="encouragement"><span>🌱</span><p>Take your time.<br><strong>Every try helps.</strong></p></div></aside>
<section class="practice-panel" aria-label="Khmer writing practice"><div class="mode-bar"><div class="mode-tabs" aria-label="Practice mode"><button id="trace-mode" aria-pressed="true">Trace a character</button><button id="free-mode" aria-pressed="false">✧ Free drawing</button></div></div>
<div class="letter-heading"><div class="letter-info"><div id="letter-badge" class="letter-badge" lang="km"></div><div><h2 id="letter-title">Trace a Khmer character</h2><p id="instruction">Start at 1, then follow the numbered arrows.</p></div></div></div>
<div class="board-wrap"><div class="board-top"><span id="board-label">FOLLOW THE NUMBERED ARROWS</span><button id="khmer-hear" class="button text-button" type="button">Hear it</button></div><svg id="board" viewBox="0 0 640 420" role="img"><defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#dce2dc"/></pattern></defs><rect width="640" height="420" fill="url(#dots)"/><g class="writing-lines"><path d="M25 100H615"/><path class="baseline" d="M25 330H615"/></g><image id="khmer-guide" x="175" y="40" width="290" height="330" preserveAspectRatio="xMidYMid meet"/><text id="khmer-shape" lang="km" x="320" y="270" text-anchor="middle" display="none"></text><g id="ink"></g></svg><div id="audio-series" class="khmer-audio-status" hidden>Pronunciation: អ consonant series</div><div id="audio-status" class="khmer-audio-status" role="status" aria-live="polite"></div><div class="board-bottom"><span id="board-hint">Use your finger, pen, or mouse</span></div></div>
<div class="actions"><div class="secondary-actions"><button id="clear" class="button secondary">Start again</button><button id="undo" class="button text-button" disabled>Undo</button></div><button id="next" class="button primary">Next character →</button></div><div class="feedback" role="status" aria-live="polite"><span class="feedback-icon">✦</span><span id="feedback-text">A little practice helps you grow.</span></div></section></div>
<footer><span>Made for curious little minds ♡</span><details><summary>Grown-up notes</summary><p>Hear it has recordings for all 33 consonants, 23 vowel-sign forms and 13 independent-vowel practice forms, served from this website without a speech API. Khmer numbers do not have audio yet. Independent-vowel audio uses the replacement recording supplied for the corrected list, with one pronunciation per tap. All audio comes from user-provided recordings, split at pauses with volume adjusted and character labels reviewed by the user. Vowel-sign recordings use the អ (A-series) pronunciation. Vowel sounds can change with the consonant series; the vowel-sign clips demonstrate the អ series. The earlier textbook audio is no longer used by Hear it.</p><p>Choose between 33 consonants, 23 vowel-sign forms (including common combinations), 13 practice forms in the independent-vowel group, and Khmer numbers ០ through ៩. Vowel signs use a dotted circle to show the position of a consonant; the circle is not part of the vowel. Independent vowels and numbers currently use shape-only font guides without stroke-order arrows. 22 vowel guides come from the Basic Khmer vowel worksheets. The numbered guides show writing direction. Numbers indicate order; they do not always mean lifting the pen. 29 guides are cropped from Basic Khmer by Vathanak Sok (2022), with layout adapted, under CC BY-NC 4.0. Five original diagrams follow direction references in the Rermork WB3 workbook (PDF pages 28, 30, 32 and 56) and WB4 vowel workbook (PDF page 22). Handwriting styles can vary. Writing is not graded, scored, uploaded, or saved. Changing the character, mode, or page clears the current drawing. English account progress stays unchanged.</p><p><a href="https://openbooks.lib.msu.edu/basickhmer/" target="_blank" rel="noopener">Basic Khmer — Vathanak Sok</a> · <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a> · <a href="https://rermork.org/curriculum/khmer-alphabets/" target="_blank" rel="noopener">Rermork writing references</a></p></details></footer></main>`;
languageNavigation('khmer');
const el = (id:string) => document.getElementById(id)!;
const board = el('board') as unknown as SVGSVGElement;
const small = matchMedia('(max-width:740px)');
function fit() { board.setAttribute('viewBox',small.matches ? '100 0 440 420' : '0 0 640 420'); }
small.addEventListener('change',fit);fit();
function paint() {
  el('ink').replaceChildren(...strokes.map(stroke=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',stroke.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+(stroke.length===1?' l.01,0':''));p.setAttribute('class','drawn-line');return p;
  }));
  (el('undo') as HTMLButtonElement).disabled=!strokes.length;
}
function clear() { if(pointer!==null && board.hasPointerCapture(pointer))board.releasePointerCapture(pointer);pointer=null;active=null;strokes=[];paint(); }
function render() {
  clear();pronunciation.stop();const letter=characters[selected];
  (el('khmer-hear') as HTMLButtonElement).disabled=!hasKhmerAudio(letter);
  el('khmer-hear').textContent='Hear it';
  el('khmer-hear').setAttribute('aria-label',`Hear Khmer character ${letter}`);
  el('audio-status').textContent=hasKhmerAudio(letter)?'':(group==='numbers'?'Number audio is not available yet.':'Audio not available yet for this character.');
  el('letter-badge').textContent=displayCharacter(letter);
  el('audio-series').hidden=group!=='vowels';
  const numbered=hasNumberedGuide(letter);
  el('khmer-shape').textContent=displayCharacter(letter);
  el('khmer-shape').setAttribute('display',mode==='trace'&&!numbered?'inline':'none');
  const guide=el('khmer-guide');
  if(mode==='trace' && numbered) { guide.setAttribute('href', `${import.meta.env.BASE_URL}khmer-guides/${[...letter].map(c=>c.codePointAt(0)!.toString(16)).join('-')}.${'ឋឌឍភើ'.includes(letter)?'svg':'png'}`); guide.removeAttribute('display'); } else { guide.removeAttribute('href');guide.setAttribute('display','none'); }
  el('letter-title').textContent=mode==='trace'?(group==='consonants'?'Trace a Khmer character':group==='numbers'?'Trace a Khmer number':'Trace a Khmer vowel'):'Your free drawing space';
  el('instruction').textContent=mode==='trace'?(numbered?'Start at 1, then follow the numbered arrows.':'Trace the pale shape. Stroke directions are not shown yet.'):'Try it on your own, or draw anything you like.';
  el('board-label').textContent=mode==='trace'?(numbered?'FOLLOW THE NUMBERED ARROWS':group==='numbers'?'FOLLOW THE NUMBER SHAPE':'FOLLOW THE VOWEL SHAPE'):'MAKE YOUR OWN LITTLE MARKS';
  board.setAttribute('aria-label',mode==='trace'?`Trace Khmer character ${letter} with your finger, pen, or mouse`:'Free drawing area');
  el('trace-mode').setAttribute('aria-pressed',String(mode==='trace'));el('free-mode').setAttribute('aria-pressed',String(mode==='free'));
  el('alphabet').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));
  el('feedback-text').textContent=mode==='trace'?(group==='vowels'?'The dotted circle stands for a consonant. Trace only the vowel marks.':numbered?'Follow the arrows slowly. The numbers show the order.':group==='numbers'?'Follow the pale number shape slowly.':'Follow the shape slowly. This is a shape-only guide.'):'This space is yours. Have fun drawing!';
}
function renderChoices() {
 el('alphabet').replaceChildren();
 el('alphabet').setAttribute('aria-label',groups[group].name);
 el('character-count').textContent=`${characters.length} ${groups[group].name.toLowerCase()}`;
 characters.forEach((letter,i)=>{const b=document.createElement('button');b.lang='km';b.textContent=displayCharacter(letter);b.setAttribute('aria-label',`Khmer ${group==='consonants'?'character':group==='numbers'?'number':'vowel'} ${displayCharacter(letter)}`);b.onclick=()=>{selected=i;render();};el('alphabet').append(b);});
}
el('khmer-hear').onclick=()=>{
  el('khmer-hear').textContent='Play again';
  el('audio-status').textContent='Playing pronunciation…';
  pronunciation.play(characters[selected],failed=>{
    el('khmer-hear').textContent='Hear it';
    el('audio-status').textContent=failed?'Could not play the recording. Tap Hear it to try again.':'';
  });
};
window.addEventListener('pagehide',()=>pronunciation.stop());
renderChoices();
el('character-group').addEventListener('change',event=>{ group=(event.target as HTMLSelectElement).value as Group; characters=groups[group].characters;selected=0;renderChoices();render(); });
el('trace-mode').onclick=()=>{mode='trace';render();};el('free-mode').onclick=()=>{mode='free';render();};
el('clear').onclick=()=>{clear();el('feedback-text').textContent='A fresh start. Try again whenever you’re ready.';};
el('undo').onclick=()=>{if(active)return;strokes.pop();paint();};el('next').onclick=()=>{selected=(selected+1)%characters.length;render();};
function point(e:PointerEvent):Point {const m=board.getScreenCTM();if(!m)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return{x:Math.max(0,Math.min(640,p.x)),y:Math.max(0,Math.min(420,p.y))};}
board.addEventListener('pointerdown',e=>{if(pointer!==null||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();pointer=e.pointerId;board.setPointerCapture(pointer);active=[point(e)];strokes.push(active);paint();});
board.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||!active)return;e.preventDefault();for(const event of e.getCoalescedEvents?.().length?e.getCoalescedEvents():[e])active.push(point(event));paint();});
function finish(e:PointerEvent){if(e.pointerId!==pointer)return;if(e.type==='pointerup'&&active)active.push(point(e));active=null;pointer=null;paint();}
board.addEventListener('pointerup',finish);board.addEventListener('pointercancel',finish);board.addEventListener('lostpointercapture',finish);render();
