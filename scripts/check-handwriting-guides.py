"""Measure a synthetic drawing-domain probe, separate from the public test set."""
import json
import numpy as np
import torch
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('training', Path(__file__).with_name('train-handwriting.py'))
training = importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)
model = training.ClassificationModel(str(training.ROOT / 'scripts' / 'handwriting-yolo.yaml'), nc=26, verbose=False)
model.load_state_dict(torch.load(training.WORK / 'best.pt', map_location='cpu', weights_only=True)['state'])
model.eval()
fixtures = json.loads((training.WORK / 'guide-fixtures.json').read_text())
x = torch.tensor([f['pixels'] for f in fixtures]).reshape(-1,3,32,32)
with torch.inference_mode():
    scores = training.logits(model,x).softmax(1).numpy()
report = []
for item, row in zip(fixtures,scores):
    order = np.argsort(row)[::-1]
    report.append({'expected': item['label'], 'lower': item['lower'], 'prediction': chr(65+int(order[0])), 'confidence': round(float(row[order[0]]),4), 'accepted': bool(row[order[0]] >= .85 and row[order[0]]-row[order[1]] >= .35)})
(training.WORK / 'guide-probe.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'correct':sum(r['expected']==r['prediction'] for r in report),'total':len(report),'accepted_correct':sum(r['accepted'] and r['expected']==r['prediction'] for r in report),'accepted_wrong':[r for r in report if r['accepted'] and r['expected']!=r['prediction']]}),flush=True)
