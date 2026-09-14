import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('onnxruntime-web'));
const output = resolve('public/handwriting/runtime');
await mkdir(output, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await copyFile(resolve(dist, name), resolve(output, name));
}
console.log('Copied local ONNX Runtime Web assets.');
