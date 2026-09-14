import './style.css';
import { languageNavigation } from './languages.ts';
import { alphabet, getGuide, words, pictures, type Point, type Stroke } from './letters.ts';
import { scoreTrace } from './scoring.ts';
import { createLetterAudioPlayer } from './audio.ts';
import { prepareInk, recognizeInk } from './recognition.ts';
import { createAccounts, type QuizRound } from './accounts.ts';
import { createQuizAudioPlayer } from './quiz-audio.ts';

const icons = {
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 4 5 5L8 21H3v-5L15 4Zm-2 2 5 5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 10a8 8 0 1 1 0 6M4 4v6h6"/></svg>'
};
let selected = 'A', lowercase = false, mode: 'trace' | 'free' | 'quiz' = 'trace';
let quizPoints = 0, round: QuizRound | null = null, heard = false, solved = false, quizBusy = false, roundRevision = 0;
const quizAudio = createQuizAudioPlayer();
let strokes: Stroke[] = [], active: Stroke | null = null, pointer: number | null = null;
let earned = new Set<string>();
try { const saved: unknown = JSON.parse(localStorage.getItem('little-letters-earned') || '[]'); if (Array.isArray(saved)) earned = new Set(saved.filter((x): x is string => typeof x === 'string' && /^[A-Z]-(upper|lower)$/.test(x))); } catch { /* Storage is optional. */ }
let changed = false;
let drawingRevision = 0;
let recognizing = false;
let recognitionAvailable = false;
const letterAudio = createLetterAudioPlayer();
const key = () => `${selected}-${lowercase ? 'lower' : 'upper'}`;
const character = () => lowercase ? selected.toLowerCase() : selected;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar"><a class="brand" href="./" aria-label="Little Letters home"><span class="brand-mark">a<span>b</span></span><span>little letters<span class="brand-dot">.</span></span></a><div class="top-right"><span class="top-note">Little steps. Big discoveries.</span><span class="points">${icons.star}<span id="points">0</span> <span>points</span></span></div></header>
  <main>
    <div class="welcome"><div><div class="eyebrow"><span></span> YOUR ALPHABET ADVENTURE</div><h1>Big smiles. Little letters.</h1><p>A little listening, a little drawing, a lot of learning.</p></div><div class="welcome-doodle" aria-hidden="true"><span>✦</span><span>Aa</span><span>✧</span></div></div>
    <div class="workspace">
      <aside class="alphabet-panel"><div class="section-label"><h2>Pick a letter</h2><span>A — Z</span></div><div id="alphabet" class="alphabet-grid" aria-label="Alphabet"></div><div class="progress-box"><div><span>Your little wins</span><strong id="progress-text">0 / 52</strong></div><progress id="progress" max="52" value="0" aria-label="Letter forms completed"></progress><p>Every new letter is an adventure.</p></div><div class="encouragement"><span aria-hidden="true">🌱</span><p>A little practice<br><strong>helps you grow.</strong></p></div></aside>
      <section class="practice-panel" aria-label="Letter practice">
        <div class="mode-bar"><div class="mode-tabs" aria-label="Practice mode"><button id="trace-mode" aria-pressed="true">${icons.pencil} Trace a letter</button><button id="free-mode" aria-pressed="false">✧ Free drawing</button></div><span class="practice-label">LET’S PRACTICE</span></div>
        <div class="letter-heading"><div class="letter-info"><div id="letter-badge" class="letter-badge">Aa</div><div><h2 id="letter-title">A is for apple</h2><p id="instruction">Follow the dotted lines. Take your time!</p></div></div><div class="case-toggle" aria-label="Letter case"><button id="upper" aria-label="Uppercase" aria-pressed="true">ABC</button><button id="lower" aria-label="Lowercase" aria-pressed="false">abc</button></div></div>
        <div class="board-wrap"><div class="board-top"><span id="board-label">TRACE THE BIG A</span><button id="hear" class="hear">${icons.sound} Hear it</button></div>
          <svg id="board" viewBox="0 0 640 420" role="img" aria-label="Draw over the letter A using your finger, pen, or mouse"><defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#dce2dc"/></pattern></defs><rect width="640" height="420" fill="url(#dots)"/><g class="writing-lines"><path d="M25 90H615 M25 170H615"/><path class="baseline" d="M25 320H615"/></g><g id="guides"></g><g id="ink"></g><g id="starts"></g></svg>
          <div class="board-bottom"><span id="board-hint"><span class="green-dot"></span> Start at the little green dots</span><span id="word-picture" aria-hidden="true">🍎</span></div>
        </div>
        <div class="actions"><div class="secondary-actions"><button id="clear" class="button secondary">${icons.clear} Start again</button><button id="undo" class="button text-button" disabled>Undo</button></div><button id="check" class="button primary">Check my letter <span>✓</span></button><button id="recognize" class="button primary" hidden>Guess my letter</button></div>
        <div id="feedback" class="feedback" role="status" aria-live="polite"><span class="feedback-icon">✦</span><span id="feedback-text">You’ve got this! Try tracing the whole letter.</span><button id="next" class="next" hidden>Next letter →</button></div>
      </section>
    </div>
    <footer><span>Made for curious little minds <span aria-hidden="true">♡</span></span><details><summary>Grown-up notes</summary><p>Trace a letter to earn 10 points for each new uppercase or lowercase form. The trace check compares line coverage and closeness; it is a practice aid, not a handwriting assessment. Free drawing is not graded. Guess my letter uses a local YOLO classifier to suggest a letter across both cases. Guesses can be wrong, especially for pictures and early handwriting, and never award points. Unsure guesses are withheld. A graded listening quiz is still a future feature. Lowercase a and g use simple single-storey handwriting forms. Guest progress stays in this browser. Parent accounts save separate learner progress in the database for access on other devices. Sound uses saved American English audio generated locally with Kokoro. It plays from this website without a cloud speech service or subscription. Guest practice needs no account, and this app does not upload drawings.</p></details></footer>
  </main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const board = document.getElementById('board')! as unknown as SVGSVGElement;
languageNavigation('english');
document.querySelector('.progress-box > div > span')!.textContent = 'Traced letter forms';
document.querySelector('.progress-box')!.insertAdjacentHTML('beforeend','<div class="listening-progress"><span>Listening wins</span><strong id="listening-wins">0</strong></div>');
document.querySelector('.mode-tabs')!.insertAdjacentHTML('beforeend','<button id="quiz-mode" aria-pressed="false">♫ Listen & write</button>');
document.querySelector('.actions')!.insertAdjacentHTML('beforeend','<button id="quiz-new" class="button secondary" hidden>New sound</button><button id="quiz-check" class="button primary" hidden>Check answer</button>');
const notes = document.querySelector('footer details p')!;
notes.textContent = notes.textContent!.replace('A graded listening quiz is still a future feature.', 'Listen & write awards 10 points once per correct question. It accepts either letter case. Unclear guesses ask for another try. Recognition can still make mistakes; these are practice points, not a formal assessment.');
const smallScreen = window.matchMedia('(max-width: 740px)');
const fitBoard = () => board.setAttribute('viewBox', smallScreen.matches ? '120 30 400 380' : '0 0 640 420');
smallScreen.addEventListener('change', fitBoard);
fitBoard();
const ns = 'http://www.w3.org/2000/svg';
function path(stroke: Stroke, className: string) {
  const node = document.createElementNS(ns, 'path');
  node.setAttribute('d', stroke.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + (stroke.length === 1 ? ' l0.01,0' : ''));
  node.setAttribute('class', className); return node;
}
function paintInk() { document.getElementById('ink')!.replaceChildren(...strokes.map(s => path(s, 'drawn-line'))); el<HTMLButtonElement>('undo').disabled = !strokes.length; }
function feedback(message: string, success = false) { el('feedback-text').textContent = message; el('feedback').classList.toggle('success', success); el('next').hidden = !success; }
function invalidateGuess() { drawingRevision++; recognizing = false; el<HTMLButtonElement>('recognize').disabled = false; el('recognize').textContent = 'Guess my letter'; }
function resetDrawing() { invalidateGuess(); if (pointer !== null && board.hasPointerCapture(pointer)) board.releasePointerCapture(pointer); pointer = null; active = null; strokes = []; changed = false; paintInk(); feedback(mode === 'trace' ? 'You’ve got this! Try tracing the whole letter.' : 'Draw one letter, then let me guess. Pictures and squiggles are welcome too!'); }
function updateProgress() {
  el('listening-wins').textContent = String(quizPoints / 10);
  el('points').textContent = String(earned.size * 10 + quizPoints); el('progress-text').textContent = `${earned.size} / 52`; el<HTMLProgressElement>('progress').value = earned.size;
  for (const button of el('alphabet').querySelectorAll('button')) {
    const letter = button.dataset.letter!;
    button.classList.toggle('completed', earned.has(`${letter}-${lowercase ? 'lower' : 'upper'}`));
    button.setAttribute('aria-label', `Letter ${letter}${earned.has(`${letter}-${lowercase ? 'lower' : 'upper'}`) ? ', completed' : ''}`);
  }
}
function render() {
  letterAudio.stop();
  quizAudio.stop(); roundRevision++; round = null; heard = false; solved = false; quizBusy = false;
  resetDrawing();
  for (const button of el('alphabet').querySelectorAll('button')) { button.setAttribute('aria-pressed', String(button.dataset.letter === selected)); }
  el('upper').setAttribute('aria-pressed', String(!lowercase)); el('lower').setAttribute('aria-pressed', String(lowercase));
  el('trace-mode').setAttribute('aria-pressed', String(mode === 'trace')); el('free-mode').setAttribute('aria-pressed', String(mode === 'free'));
  const index = alphabet.indexOf(selected);
  el('letter-badge').textContent = selected + selected.toLowerCase();
  el('letter-title').textContent = `${character()} is for ${words[index]}`;
  el('instruction').textContent = mode === 'trace' ? 'Follow the dotted lines. Take your time!' : 'Your space to write, draw, and explore.';
  el('board-label').textContent = mode === 'trace' ? `TRACE THE ${lowercase ? 'LITTLE' : 'BIG'} ${character()}` : `TRY WRITING ${character()} YOUR WAY`;
  el('board-hint').innerHTML = mode === 'trace' ? '<span class="green-dot"></span> Start at the little green dots' : '<span class="green-dot"></span> Anything you draw belongs here';
  el('word-picture').textContent = pictures[index];
  el('check').hidden = mode !== 'trace';
  el('recognize').hidden = mode !== 'free' || !recognitionAvailable;
  board.setAttribute('aria-label', mode === 'trace' ? `Draw over ${lowercase ? 'lowercase' : 'uppercase'} ${character()} using your finger, pen, or mouse` : `Free drawing area. Practice ${character()} or draw anything.`);
  const guides = document.getElementById('guides')!, starts = document.getElementById('starts')!;
  guides.replaceChildren(); starts.replaceChildren();
  if (mode === 'trace') getGuide(selected, lowercase).forEach((s, i) => {
    guides.append(path(s, 'guide-wide'), path(s, 'guide-dash'));
    const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', String(s[0].x)); circle.setAttribute('cy', String(s[0].y)); circle.setAttribute('r', '10'); circle.setAttribute('class', 'start-dot');
    const label = document.createElementNS(ns, 'text'); label.setAttribute('x', String(s[0].x)); label.setAttribute('y', String(s[0].y + 4)); label.textContent = String(i + 1);
    starts.append(circle, label);
  });
  updateProgress();
  el('quiz-mode').setAttribute('aria-pressed', String(mode === 'quiz'));
  el('quiz-new').hidden = el('quiz-check').hidden = mode !== 'quiz';
  el('letter-badge').hidden = el('word-picture').hidden = mode === 'quiz';
  document.querySelector<HTMLElement>('.case-toggle')!.hidden = mode === 'quiz';
  el('next').textContent = mode === 'quiz' ? 'Next sound →' : 'Next letter →';
  for (const button of el('alphabet').querySelectorAll('button')) { button.disabled = mode === 'quiz'; if (mode === 'quiz') button.setAttribute('aria-pressed','false'); }
  if (mode === 'quiz') {
    el('letter-title').textContent = 'Listen & write';
    el('instruction').textContent = 'Listen, then write one letter. Big or small is fine!';
    el('board-label').textContent = 'WHAT LETTER DID YOU HEAR?';
    el('board-hint').textContent = 'Write the letter you hear';
    board.setAttribute('aria-label','Write the spoken letter using your finger, pen, or mouse');
    feedback('Tap New sound to begin your listening adventure.');
  }
  syncQuiz();
}
alphabet.forEach(letter => {
  const button = document.createElement('button'); button.dataset.letter = letter; button.textContent = letter;
  button.addEventListener('click', () => { selected = letter; render(); }); el('alphabet').append(button);
});
el('upper').onclick = () => { lowercase = false; render(); };
el('lower').onclick = () => { lowercase = true; render(); };
el('trace-mode').onclick = () => { mode = 'trace'; render(); };
el('free-mode').onclick = () => { mode = 'free'; render(); };
el('quiz-mode').onclick = () => { mode = 'quiz'; render(); };
el('clear').onclick = () => { resetDrawing(); if (mode === 'quiz') feedback(solved ? 'You already solved this one. Tap New sound!' : heard ? 'Write the letter you heard, then check your answer.' : 'Tap Hear it to listen first.'); };
el('undo').onclick = () => { if (active) return; invalidateGuess(); strokes.pop(); changed = true; paintInk(); feedback('Keep going. You can give it another try!'); };
el('next').onclick = () => { if (mode === 'quiz') { void newQuiz(); return; } selected = alphabet[(alphabet.indexOf(selected) + 1) % 26]; render(); };
function position(event: PointerEvent): Point {
  const matrix = board.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: Math.max(0, Math.min(640, p.x)), y: Math.max(0, Math.min(420, p.y)) };
}
board.addEventListener('pointerdown', event => {
  if (mode === 'quiz' && (quizBusy || solved)) return;
  if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  invalidateGuess();
  if (mode === 'free') feedback('Draw one letter, then tap Guess my letter when you’re ready.');
  event.preventDefault(); pointer = event.pointerId; board.setPointerCapture(pointer);
  active = [position(event)]; strokes.push(active); changed = true; paintInk();
});
board.addEventListener('pointermove', event => {
  if (event.pointerId !== pointer || !active) return;
  event.preventDefault();
  const events = event.getCoalescedEvents?.();
  for (const e of events?.length ? events : [event]) {
    const p = position(e), prev = active[active.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 1.5) active.push(p);
  }
  paintInk();
});
function finish(event: PointerEvent) {
  if (event.pointerId !== pointer) return;
  if (active && event.type === 'pointerup') active.push(position(event));
  active = null; pointer = null; paintInk();
}
board.addEventListener('pointerup', finish); board.addEventListener('pointercancel', finish); board.addEventListener('lostpointercapture', finish);
el('check').onclick = async () => {
  if (mode !== 'trace' || active) return;
  if (!strokes.length) { feedback('Let’s make a mark! Follow the dots to draw your letter.'); return; }
  if (!changed) return;
  changed = false;
  const result = scoreTrace(strokes, getGuide(selected, lowercase));
  if (result.passed) {
    const revision = drawingRevision, completion = key(), written = character(), already = earned.has(completion);
    el<HTMLButtonElement>('check').disabled = true;
    try {
      await accounts.save(completion);
      if (revision === drawingRevision) feedback(already ? `Lovely tracing! You’ve practiced ${written} again. Ready for another?` : `Wonderful! You traced ${written} and earned 10 points!`, true);
    } catch (error) {
      if (revision === drawingRevision) { changed = true; feedback(error instanceof Error ? error.message : 'Progress could not be saved. Please try again.'); }
    } finally { el<HTMLButtonElement>('check').disabled = false; }
  } else if (result.coverage < 0.82) feedback('A lovely start! Follow all the dotted lines to finish your letter.');
  else if (result.precision < 0.78) feedback('Nice effort! Try again and keep your line close to the dots.');
  else feedback('Keep practicing! Try one gentle line along each dotted path.');
};
el('hear').onclick = () => {
  if (mode === 'quiz') { if (round) playQuiz(); else void newQuiz(); return; }
  invalidateGuess();
  feedback(`Listen, then try ${character()}. ${selected} is for ${words[alphabet.indexOf(selected)]}.`);
  letterAudio.play(selected, () => feedback(`Write ${character()}. ${selected} is for ${words[alphabet.indexOf(selected)]}. Sound isn’t available right now — read it together!`));
};
el('recognize').onclick = async () => {
  if (mode !== 'free' || active || recognizing) return;
  const pixels = prepareInk(strokes);
  if (!pixels) { feedback('Draw one whole letter, then tap Guess my letter.'); return; }
  const revision = drawingRevision;
  recognizing = true;
  el<HTMLButtonElement>('recognize').disabled = true;
  el('recognize').textContent = 'Thinking…';
  feedback('Let me look at your letter…');
  try {
    const guess = await recognizeInk(pixels);
    if (revision !== drawingRevision) return;
    feedback(guess.letter ? `I think this is ${guess.letter} or ${guess.letter.toLowerCase()}! Is that the letter you meant?` : 'I’m not sure yet. Try one clear letter, or keep drawing for fun!');
  } catch {
    if (revision === drawingRevision) feedback('My letter guess isn’t available right now. You can still draw and trace!');
  } finally {
    if (revision === drawingRevision) { recognizing = false; el<HTMLButtonElement>('recognize').disabled = false; el('recognize').textContent = 'Guess my letter'; }
  }
};
function syncQuiz() {
  el<HTMLButtonElement>('quiz-new').disabled = quizBusy;
  el<HTMLButtonElement>('quiz-check').disabled = quizBusy || !round || !heard || solved;
  el('quiz-check').textContent = quizBusy ? 'Thinking…' : 'Check answer';
}
function playQuiz() {
  if (!round || quizBusy || solved) return;
  const ticket = roundRevision;
  heard = false; syncQuiz(); letterAudio.stop();
  feedback('Listen carefully…');
  quizAudio.prompt(round.letter, () => {
    if (ticket !== roundRevision) return;
    heard = true; syncQuiz(); feedback('Now write the letter you heard, then tap Check answer.');
  }, () => { if (ticket === roundRevision) { heard = false; syncQuiz(); feedback('Sound could not play. Tap Hear it to try again.'); } });
}
async function newQuiz() {
  if (quizBusy) return;
  quizAudio.stop(); resetDrawing(); round = null; heard = solved = false;
  const ticket = ++roundRevision;
  quizBusy = true; syncQuiz(); feedback('Getting your next sound…');
  try {
    const next = await accounts.createQuiz();
    if (ticket !== roundRevision || next.owner !== accounts.identity()) return;
    round = next; quizBusy = false; syncQuiz(); playQuiz();
  } catch (error) { if (ticket === roundRevision) feedback(error instanceof Error ? error.message : 'Could not get a sound. Please try again.'); }
  finally { if (ticket === roundRevision) { quizBusy = false; syncQuiz(); } }
}
el('quiz-new').onclick = () => { void newQuiz(); };
el('quiz-check').onclick = async () => {
  if (mode !== 'quiz' || quizBusy || !round || !heard || solved || active) return;
  const pixels = prepareInk(strokes);
  if (!pixels) { feedback('Write one whole letter before checking your answer.'); return; }
  const ticket = roundRevision, drawing = drawingRevision, question = round;
  quizBusy = true; syncQuiz(); feedback('Let me look at your letter…');
  try {
    const guess = await recognizeInk(pixels);
    if (ticket !== roundRevision || drawing !== drawingRevision) return;
    if (!guess.letter) { feedback('I couldn’t read that yet. Try writing one clear letter again.'); return; }
    const result = await accounts.answerQuiz(question, {letter:guess.letter,confidence:guess.confidence});
    if (ticket !== roundRevision || drawing !== drawingRevision) return;
    if (result.correct) {
      solved = true;
      feedback(result.awarded ? `Correct! You wrote ${question.letter} and earned 10 points!` : 'Correct! You already earned points for this sound.', true);
      quizAudio.correct();
    } else feedback('Not quite. Tap Hear it to listen again, then try another letter.');
  } catch { if (ticket === roundRevision && drawing === drawingRevision) feedback('Your answer could not be checked or saved. Please try again.'); }
  finally { if (ticket === roundRevision) { quizBusy = false; syncQuiz(); } }
};
render();
const accounts = createAccounts((completed, identityChanged, listeningPoints) => {
  earned = new Set(completed); quizPoints = listeningPoints; updateProgress();
  if (identityChanged) render();
});
fetch(`${import.meta.env.BASE_URL}handwriting/manifest.json`).then(response => response.json()).then(manifest => {
  recognitionAvailable = manifest.labels?.join('') === alphabet.join('');
  el('recognize').hidden = mode !== 'free' || !recognitionAvailable;
}).catch(() => { /* Drawing and tracing still work without the optional model. */ });
