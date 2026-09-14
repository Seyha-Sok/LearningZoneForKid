import files from './khmer-audio-map.json';

const recordings: Record<string, string> = files;
export const hasKhmerAudio = (character: string) => Boolean(recordings[character]);

/** Reviewed character recordings, served locally with no speech service. */
export function createKhmerAudioPlayer() {
  let current: HTMLAudioElement | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    generation++;
    clearTimeout(timer);
    if (current) {
      current.onplaying = current.onerror = current.onended = null;
      current.pause();
      current.removeAttribute('src');
      current.load();
      current = null;
    }
  }
  return { stop, play(character: string, done: (failed: boolean) => void) {
    stop();
    const file = recordings[character];
    if (!file) { done(true); return; }
    const turn = generation;
    const clip = new Audio(`${import.meta.env.BASE_URL}khmer-audio/${file}`);
    current = clip;
    const finish = (failed: boolean) => {
      if (turn !== generation) return;
      stop();
      done(failed);
    };
    clip.onplaying = () => { if (turn === generation) clearTimeout(timer); };
    clip.onended = () => finish(false);
    clip.onerror = () => finish(true);
    timer = setTimeout(() => finish(true), 8000);
    try { void clip.play().catch(() => finish(true)); } catch { finish(true); }
  } };
}
