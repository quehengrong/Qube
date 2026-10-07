"""Pinned upstream artifacts; downloaded files are excluded from Git."""
from pathlib import Path
from urllib.request import urlretrieve
import hashlib
import tarfile
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/android/app"
AAR = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar"
MODEL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"

def download(url, target, checksum=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        print(f"Downloading {target.name}", flush=True)
        temporary = target.with_suffix(target.suffix + ".part")
        urlretrieve(url, temporary)
        temporary.replace(target)
    if checksum and hashlib.sha256(target.read_bytes()).hexdigest() != checksum:
        raise RuntimeError(f"Checksum mismatch: {target}; delete and download again")

if __name__ == "__main__":
    download(AAR, APP / "libs/sherpa-onnx-1.13.8.aar", "633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96")
    cache = Path(tempfile.gettempdir()) / "qube-downloads/kws.tar.bz2"
    download(MODEL, cache)
    out = APP / "src/main/assets/kws"
    out.mkdir(parents=True, exist_ok=True)
    with tarfile.open(cache) as archive:
        root = "sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20/"
        files = {"encoder.onnx":"encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx", "decoder.onnx":"decoder-epoch-13-avg-2-chunk-16-left-64.onnx", "joiner.onnx":"joiner-epoch-13-avg-2-chunk-16-left-64.int8.onnx", "tokens.txt":"tokens.txt"}
        for destination, source in files.items():
            with archive.extractfile(root + source) as src, (out / destination).open("wb") as dst:
                shutil.copyfileobj(src, dst)
    (out / "keywords.txt").write_text("x iǎo j ī x iǎo j ī @小机小机\n", encoding="utf-8")
    print("Android wake-word assets ready")
