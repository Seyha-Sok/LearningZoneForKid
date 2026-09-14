/** Reuse one audio element for a locally served prompt sequence. */
export function createQuizAudioPlayer() {
  let audio: HTMLAudioElement | null = null, version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    version++; clearTimeout(timer);
    if (audio) { audio.onended = audio.onerror = audio.onplaying = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
  }
  function sequence(files: string[], done: () => void, fail: () => void) {
    stop(); const ticket = version; audio = new Audio(); const clip = audio;
    let index = 0;
    const failed = () => { if (version !== ticket) return; stop(); fail(); };
    const playNext = () => {
      if (version !== ticket) return;
      clearTimeout(timer);
      if (index === files.length) { done(); return; }
      clip.src = new URL(`./audio/${files[index++]}.wav`,document.baseURI).href;
      timer = setTimeout(failed,8000);
      try { void clip.play().catch(failed); } catch { failed(); }
    };
    clip.onplaying = () => clearTimeout(timer);
    clip.onerror = failed; clip.onended = playNext;
    playNext();
  }
  return {
    stop,
    prompt(letter: string, done: () => void, fail: () => void) {
      if (!/^[A-Z]$/.test(letter)) { fail(); return; }
      sequence(['quiz-intro', letter], done, fail);
    },
    correct() { sequence(['quiz-correct'], () => {}, () => {}); },
  };
}
