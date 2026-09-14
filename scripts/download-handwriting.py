"""Download the EMNIST Letters mirror and verify its published LFS hashes."""
import hashlib
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.checks' / 'handwriting-data'
DEST.mkdir(parents=True, exist_ok=True)
HASHES = {
    'train': '756ccd59b40c47fd5a7fc622ed1c34d32576d64edc37aaf9accc89de2bf0bb35',
    'test': '76421442e28d4ba81c10016df2713d18105df34169f405e0eb43470e88b5d98e',
}
for split, expected in HASHES.items():
    target = DEST / f'{split}.parquet'
    if not target.exists():
        url = f'https://huggingface.co/datasets/tanganke/emnist_letters/resolve/main/emnist-letters/{split}-00000-of-00001.parquet'
        print(f'Downloading {split}', flush=True)
        partial = target.with_suffix('.download')
        urllib.request.urlretrieve(url, partial)
        with partial.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
                raise ValueError(f'Checksum mismatch: {split} download')
        partial.replace(target)
    with target.open('rb') as source:
        actual = hashlib.file_digest(source, 'sha256').hexdigest()
    if actual != expected:
        raise ValueError(f'Checksum mismatch: {target.name}')
    print(f'Verified {split}: {target.stat().st_size} bytes', flush=True)
