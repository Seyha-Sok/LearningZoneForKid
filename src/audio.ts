/** Plays bundled audio only. Never delegates to device/cloud speech synthesis. */
export function createLetterAudioPlayer() {
  let current: HTMLAudioElement | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    generation++;
    clearTimeout(timer);
    if (current) {
      current.onplaying = null;
      current.onerror = null;
      current.pause();
      current.removeAttribute('src');
      current.load();
      current = null;
    }
  }
  return {
    stop,
    play(letter: string, unavailable: () => void) {
      stop();
      if (!/^[A-Z]$/.test(letter)) { unavailable(); return; }
      const turn = generation;
      const clip = new Audio(new URL(`./audio/${letter}.wav`, document.baseURI).href);
      current = clip;
      clip.preload = 'auto';
      const fail = () => {
        if (turn !== generation) return;
        stop();
        unavailable();
      };
      clip.onplaying = () => { if (turn === generation) clearTimeout(timer); };
      clip.onerror = fail;
      timer = setTimeout(fail, 8000);
      // Calling play directly from the tap also supports mobile autoplay rules.
      try { void clip.play().catch(fail); } catch { fail(); }
    }
  };
}
