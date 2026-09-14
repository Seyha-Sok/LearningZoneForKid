import * as ort from 'onnxruntime-web/wasm';

// Runtime and weights are served by this site. One thread also works on LAN HTTP.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}handwriting/runtime/`, self.location.origin).href;
type Manifest = { labels: string[]; minimum_confidence: number; minimum_margin: number };
let ready: Promise<{ session: ort.InferenceSession; manifest: Manifest }> | null = null;
function load() {
  if (!ready) ready = (async () => {
    const base = `${import.meta.env.BASE_URL}handwriting/`;
    const response = await fetch(base + 'manifest.json');
    if (!response.ok) throw new Error('Model unavailable');
    const manifest = await response.json() as Manifest;
    if (manifest.labels.join('') !== 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') throw new Error('Invalid model');
    const session = await ort.InferenceSession.create(base + 'letters.onnx', { executionProviders: ['wasm'] });
    return { session, manifest };
  })().catch(error => { ready = null; throw error; });
  return ready;
}
self.onmessage = async (event: MessageEvent<{ id: number; pixels: Float32Array }>) => {
  try {
    const { session, manifest } = await load();
    const result = await session.run({ image: new ort.Tensor('float32', event.data.pixels, [1, 3, 32, 32]) });
    const scores = Array.from(result.probabilities.data as Float32Array).map((confidence, index) => ({ confidence, index })).sort((a, b) => b.confidence - a.confidence);
    const first = scores[0], second = scores[1];
    if (scores.length !== 26 || !Number.isFinite(first.confidence)) throw new Error('Invalid prediction');
    const letter = first.confidence >= manifest.minimum_confidence && first.confidence - second.confidence >= manifest.minimum_margin ? manifest.labels[first.index] : null;
    self.postMessage({ id: event.data.id, guess: { letter, confidence: first.confidence } });
  } catch {
    self.postMessage({ id: event.data.id, error: 'Recognition unavailable' });
  }
};
