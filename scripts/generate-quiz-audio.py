"""Generate two short local American voice clips, reusing the verified Kokoro setup."""
from pathlib import Path
import runpy
import json
import hashlib

context = runpy.run_path(str(Path(__file__).with_name('generate-audio.py')))
engine, sf, phonemizer = context['engine'], context['sf'], context['phonemizer']
out = context['root'] / 'public/audio'
records = []
for name, text in [('quiz-intro', 'Listen carefully. Write this letter.'), ('quiz-correct', 'Correct! Well done!')]:
    path = out / f'{name}.wav'
    if not path.exists():
        phonemes = phonemizer.phonemize(text, language='en-us', preserve_punctuation=True, with_stress=True, strip=True)
        audio, rate = engine.create(phonemes, voice='af_heart', speed=.95, lang='en-us', is_phonemes=True)
        sf.write(path, audio, rate, subtype='PCM_16')
    audio, rate = sf.read(path)
    assert rate == 24000 and .4 < len(audio)/rate < 10
    records.append({'file':path.name,'text':text,'seconds':round(len(audio)/rate,3),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    print(f'{name} ready',flush=True)
(out / 'quiz-manifest.json').write_text(json.dumps({'voice':'Kokoro af_heart','generatedLocally':True,'networkDisabledDuringGeneration':True,'prompts':records},indent=2))
