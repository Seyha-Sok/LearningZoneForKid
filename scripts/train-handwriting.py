"""Train a compact Ultralytics YOLO classifier locally; export only after evaluation.

Run with .checks/handwriting-env/Scripts/python.exe. Dependencies are isolated there.
EMNIST Letters merges upper/lower case. This is letter identification, not grading.
"""
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import random
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.checks' / 'handwriting-data'
(WORK / 'ultralytics-settings').mkdir(parents=True, exist_ok=True)
os.environ['YOLO_CONFIG_DIR'] = str(WORK / 'ultralytics-settings')
os.environ['YOLO_AUTOINSTALL'] = 'false'
os.environ['OMP_NUM_THREADS'] = '2'

import numpy as np
from PIL import Image, ImageOps
import pyarrow.parquet as pq
import torch
import torch.nn.functional as F
from ultralytics.nn.tasks import ClassificationModel
from ultralytics.utils import SETTINGS

SETTINGS.update({'sync': False, 'hub': False})

torch.set_num_threads(2)
torch.set_num_interop_threads(1)
torch.manual_seed(1729)
np.random.seed(1729)
random.seed(1729)


def normalize(image):
    """White ink on black; fit the ink in 24x24, centered in 32x32."""
    image = image.convert('L')
    a = np.asarray(image)
    ys, xs = np.where(a > 20)
    out = Image.new('L', (32, 32))
    if not len(xs):
        return np.asarray(out).copy()
    image = image.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    ratio = 24 / max(image.size)
    image = image.resize((max(1, round(image.width * ratio)), max(1, round(image.height * ratio))), Image.Resampling.BILINEAR)
    out.paste(image, ((32 - image.width) // 2, (32 - image.height) // 2))
    return np.asarray(out).copy()


def load(split, transpose=False):
    cache = WORK / f'{split}-normalized-{int(transpose)}.npz'
    if cache.exists():
        data = np.load(cache)
        return data['images'], data['labels']
    table = pq.read_table(WORK / f'{split}.parquet')
    labels = np.asarray(table['label']).astype(np.int64)
    images = []
    for item in table['image'].to_pylist():
        image = Image.open(io.BytesIO(item['bytes']))
        if transpose:
            image = image.transpose(Image.Transpose.TRANSPOSE)
        images.append(normalize(image))
    images = np.stack(images)
    assert labels.min() == 0 and labels.max() == 25
    np.savez_compressed(cache, images=images, labels=labels)
    return images, labels


def batch(images, indices, augment=False):
    x = torch.from_numpy(images[indices]).unsqueeze(1).float() / 255
    if augment:
        n = x.shape[0]
        angles = (torch.rand(n) - .5) * .3
        scales = .9 + torch.rand(n) * .2
        theta = torch.zeros(n, 2, 3)
        theta[:, 0, 0] = theta[:, 1, 1] = angles.cos() * scales
        theta[:, 0, 1] = -angles.sin() * scales
        theta[:, 1, 0] = angles.sin() * scales
        theta[:, :, 2] = (torch.rand(n, 2) - .5) * .12
        x = F.grid_sample(x, F.affine_grid(theta, x.shape, align_corners=False), align_corners=False)
    return x.repeat(1, 3, 1, 1)


def logits(model, x):
    output = model(x)
    # ClassificationModel returns (probabilities, logits) while evaluating.
    return output[1] if isinstance(output, tuple) else output


def evaluate(model, images, labels):
    model.eval()
    predictions, confidence, all_scores = [], [], []
    with torch.inference_mode():
        for start in range(0, len(labels), 256):
            scores = logits(model, batch(images, slice(start, start + 256))).softmax(1)
            predictions.extend(scores.argmax(1).tolist())
            confidence.extend(scores.max(1).values.tolist())
            all_scores.extend(scores.tolist())
    p, c = np.array(predictions), np.array(confidence)
    accuracy = float((p == labels).mean())
    return accuracy, p, c, np.array(all_scores)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=16)
    parser.add_argument('--per-class', type=int, default=1000)
    parser.add_argument('--transpose', action='store_true')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--evaluate-only', action='store_true', help='Evaluate/export an existing best checkpoint without further training')
    args = parser.parse_args()
    images, labels = load('train', args.transpose)
    rng = np.random.default_rng(1729)
    train, validation = [], []
    for label in range(26):
        indices = rng.permutation(np.flatnonzero(labels == label))
        validation.extend(indices[:200])
        train.extend(indices[200:200 + args.per_class])
    train, validation = np.array(train), np.array(validation)
    model = ClassificationModel(str(ROOT / 'scripts' / 'handwriting-yolo.yaml'), nc=26, verbose=False)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.002, weight_decay=.001)
    best, first_epoch = 0., 0
    checkpoint = WORK / 'best.pt'
    if args.evaluate_only and not checkpoint.exists():
        raise FileNotFoundError('Train a model before evaluating it')
    if (args.resume or args.evaluate_only) and checkpoint.exists():
        saved = torch.load(checkpoint, map_location='cpu', weights_only=True)
        model.load_state_dict(saved['state'])
        best, first_epoch = saved['accuracy'], saved['epoch']
    print(json.dumps({'parameters': sum(p.numel() for p in model.parameters()), 'train': len(train), 'validation': len(validation), 'mode': 'evaluate-only' if args.evaluate_only else 'train', 'maximum_epochs': args.epochs}), flush=True)
    started = time.time()
    for epoch in range(first_epoch, first_epoch if args.evaluate_only else args.epochs):
        model.train()
        order = rng.permutation(train)
        losses = []
        for group in range(0, len(order), 128):
            indices = order[group:group+128]
            optimizer.zero_grad(set_to_none=True)
            loss = F.cross_entropy(logits(model, batch(images, indices, True)), torch.from_numpy(labels[indices]))
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        accuracy, _, _, _ = evaluate(model, images[validation], labels[validation])
        if accuracy > best:
            best = accuracy
            torch.save({'state': model.state_dict(), 'accuracy': best, 'epoch': epoch + 1}, checkpoint)
        record = {'epoch': epoch + 1, 'loss': float(np.mean(losses)), 'validation_accuracy': accuracy, 'best': best, 'elapsed_seconds': round(time.time() - started)}
        print(json.dumps(record), flush=True)
        (WORK / 'progress.json').write_text(json.dumps(record, indent=2))
    selected_checkpoint = torch.load(checkpoint, map_location='cpu', weights_only=True)
    model.load_state_dict(selected_checkpoint['state'])
    test_images, test_labels = load('test', args.transpose)
    accuracy, predictions, confidence, scores = evaluate(model, test_images, test_labels)
    sorted_scores = np.sort(scores, axis=1)
    accepted = (confidence >= .85) & ((sorted_scores[:, -1] - sorted_scores[:, -2]) >= .35)
    report = {
        'model': 'Compact YOLOv8 classification, trained from scratch on EMNIST Letters',
        'labels': list('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'case_sensitive': False,
        'training_examples': len(train), 'validation_examples': len(validation), 'test_examples': len(test_labels),
        'validation_accuracy': best, 'test_accuracy': accuracy,
        'accepted_test_fraction': float(accepted.mean()),
        'accepted_test_accuracy': float((predictions[accepted] == test_labels[accepted]).mean()) if accepted.any() else None,
        'minimum_confidence': .85, 'minimum_margin': .35,
        'per_letter_accuracy': {chr(65+i): float((predictions[test_labels == i] == i).mean()) for i in range(26)},
        'input': '1x3x32x32 float32, white ink on black, normalized ink bounding box to 24px, centered',
        'seed': 1729, 'transpose_source': args.transpose,
        'selected_epoch': selected_checkpoint['epoch'],
        'parameters': sum(p.numel() for p in model.parameters()),
        'limitations': 'Public handwriting benchmark only. Child touchscreen handwriting unvalidated. Confidence is not a correctness guarantee. No case or handwriting-quality assessment.',
        'dataset_source': 'https://www.nist.gov/itl/products-and-services/emnist-dataset',
        'dataset_mirror': 'https://huggingface.co/datasets/tanganke/emnist_letters',
    }
    (WORK / 'evaluation.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)
    if accuracy < .85:
        raise RuntimeError('Test accuracy below release gate; model not exported')
    public = ROOT / 'public' / 'handwriting'
    public.mkdir(parents=True, exist_ok=True)
    model.eval()
    model.model[-1].export = True
    destination = public / 'letters.onnx'
    torch.onnx.export(model, torch.zeros(1, 3, 32, 32), str(destination), input_names=['image'], output_names=['probabilities'], opset_version=17, dynamo=False)
    import onnxruntime as ort
    session = ort.InferenceSession(str(destination), providers=['CPUExecutionProvider'])
    example = batch(test_images, slice(0, 1))
    with torch.inference_mode():
        expected = model(example).numpy()
    actual = session.run(None, {'image': example.numpy()})[0]
    np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-5)
    with destination.open('rb') as handle:
        report['sha256'] = hashlib.file_digest(handle, 'sha256').hexdigest()
    (public / 'manifest.json').write_text(json.dumps(report, indent=2))
    # A small untouched test fixture set for browser inference parity checks.
    fixtures = []
    for label in range(26):
        index = int(np.flatnonzero(test_labels == label)[0])
        fixtures.append({'label': chr(65+label), 'pixels': test_images[index].flatten().tolist(), 'probabilities': scores[index].tolist()})
    (WORK / 'browser-fixtures.json').write_text(json.dumps(fixtures))
    print('Export and ONNX parity passed.', flush=True)


if __name__ == '__main__':
    main()
