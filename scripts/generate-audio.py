"""Generate bundled alphabet audio locally. Requires the downloaded .checks voice runtime/model.

Run with Python 3.12. The model is Kokoro-82M, voice af_heart, with Apache-2.0 weights.
Sources and model hashes: .checks/voice-model/SOURCE.txt.
No network connection is permitted during generation.
"""
from pathlib import Path
import sys
import socket
import hashlib
import json
import time

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.checks/voice-runtime'))
def deny_network(*args, **kwargs):
    raise RuntimeError('Network access is disabled during local audio generation')
socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network
socket.create_connection = deny_network

print('Loading local speech libraries...', flush=True)
import numpy as np
import soundfile as sf
import onnxruntime as ort
import phonemizer
from kokoro_onnx import Kokoro

model = root / '.checks/voice-model'
expected = {
    'kokoro-v1.0.int8.onnx': 'ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c',
    'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
}
for name, digest in expected.items():
    print(f'Checking {name}...', flush=True)
    with (model / name).open('rb') as source:
        assert hashlib.file_digest(source, 'sha256').hexdigest() == digest, name
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
print('Loading verified model with two CPU threads...', flush=True)
session = ort.InferenceSession(str(model / 'kokoro-v1.0.int8.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
engine = Kokoro.from_session(session, str(model / 'voices-v1.0.bin'))
print('Local American voice loaded.', flush=True)

letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
words = ['apple', 'butterfly', 'cat', 'dinosaur', 'elephant', 'flower', 'giraffe', 'house', 'ice cream', 'jellyfish', 'kite', 'lion', 'moon', 'nest', 'octopus', 'penguin', 'queen', 'rainbow', 'sun', 'turtle', 'umbrella', 'violin', 'whale', 'xylophone', 'yo-yo', 'zebra']
# Explicit letter names avoid treating A and I as words; Z uses American "zee".
names = ['ˈeɪ', 'bˈiː', 'sˈiː', 'dˈiː', 'ˈiː', 'ˈɛf', 'dʒˈiː', 'ˈeɪtʃ', 'ˈaɪ', 'dʒˈeɪ', 'kˈeɪ', 'ˈɛl', 'ˈɛm', 'ˈɛn', 'ˈoʊ', 'pˈiː', 'kjˈuː', 'ˈɑːɹ', 'ˈɛs', 'tˈiː', 'jˈuː', 'vˈiː', 'dˈʌbəl jˈuː', 'ˈɛks', 'wˈaɪ', 'zˈiː']
print('Preparing the 26 letter phrases in one local batch.', flush=True)
tails = phonemizer.phonemize([f'is for {word}.' for word in words], language='en-us', preserve_punctuation=True, with_stress=True, strip=True)
out = root / 'public/audio'
out.mkdir(parents=True, exist_ok=True)
manifest = {'voice': 'Kokoro af_heart', 'locale': 'en-US', 'generatedLocally': True, 'networkDisabledDuringGeneration': True, 'prompts': []}
for letter, word, name, tail in zip(letters, words, names, tails):
    start = time.monotonic()
    phonemes = name + ' ' + tail
    target = out / f'{letter}.wav'
    if target.exists():
        audio, rate = sf.read(target)
    else:
        audio, rate = engine.create(phonemes, voice='af_heart', speed=0.95, lang='en-us', is_phonemes=True)
        assert np.isfinite(audio).all() and np.max(np.abs(audio)) > 0.01
        sf.write(target, audio, rate, subtype='PCM_16')
    duration = len(audio) / rate
    assert 0.4 < duration < 10 and rate == 24000
    manifest['prompts'].append({'letter': letter, 'word': word, 'text': f'{letter} is for {word}.', 'phonemes': phonemes, 'file': f'{letter}.wav', 'seconds': round(duration, 3), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    print(f'{letter}: {duration:.2f}s audio, generated/verified in {time.monotonic()-start:.1f}s', flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
print('All 26 local audio files generated and verified.', flush=True)
