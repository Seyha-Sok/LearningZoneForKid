import type { Stroke } from './letters.ts';

export type Guess = { letter: string | null; confidence: number };
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (guess: Guess) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function shutdown(message: string) {
  worker?.terminate(); worker = null;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
  pending.clear();
}

/** Rasterize only the child's ink, never the guide or selected-letter label. */
export function prepareInk(strokes: Stroke[]): Float32Array | null {
  const points = strokes.flat();
  if (points.length < 2) return null;
  let length = 0;
  for (const stroke of strokes) for (let i = 1; i < stroke.length; i++) length += Math.hypot(stroke[i].x - stroke[i-1].x, stroke[i].y - stroke[i-1].y);
  if (length < 30) return null;
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 420;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 640, 420);
  ctx.strokeStyle = 'white'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y);
    for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
    if (stroke.length === 1) ctx.lineTo(stroke[0].x + .01, stroke[0].y);
    ctx.stroke();
  }
  const source = ctx.getImageData(0, 0, 640, 420).data;
  let minX = 640, minY = 420, maxX = -1, maxY = -1;
  for (let y = 0; y < 420; y++) for (let x = 0; x < 640; x++) if (source[(y * 640 + x) * 4] > 20) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) return null;
  const width = maxX - minX + 1, height = maxY - minY + 1;
  const ratio = 24 / Math.max(width, height);
  const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
  const resized = document.createElement('canvas'); resized.width = resized.height = 32;
  const target = resized.getContext('2d')!;
  target.fillStyle = 'black'; target.fillRect(0, 0, 32, 32);
  target.imageSmoothingEnabled = true; target.imageSmoothingQuality = 'high';
  target.drawImage(canvas, minX, minY, width, height, Math.floor((32-w)/2), Math.floor((32-h)/2), w, h);
  const rgba = target.getImageData(0, 0, 32, 32).data;
  const pixels = new Float32Array(3 * 32 * 32);
  for (let i = 0; i < 1024; i++) pixels[i] = pixels[1024+i] = pixels[2048+i] = rgba[i*4] / 255;
  return pixels;
}

export function recognizeInk(pixels: Float32Array): Promise<Guess> {
  if (!worker) {
    worker = new Worker(new URL('./recognition.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; guess?: Guess; error?: string }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(event.data.id);
      if (event.data.guess) request.resolve(event.data.guess);
      else request.reject(new Error(event.data.error || 'Recognition unavailable'));
    };
    worker.onerror = () => shutdown('Recognition unavailable');
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => shutdown('Recognition timed out'), 60000);
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, pixels }, [pixels.buffer]);
  });
}
