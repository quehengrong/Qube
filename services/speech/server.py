"""Loopback-only Qube inference service. Recordings remain in memory."""
import asyncio
import gc
import os
import secrets
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from audio import MAX_BYTES, validate_pcm

TOKEN = os.environ.get("QUBE_SPEECH_TOKEN", "")
_model = None
_lock = threading.Lock()

@asynccontextmanager
async def lifespan(app):
    if len(TOKEN) < 32:
        raise RuntimeError("Start this service through Qube; QUBE_SPEECH_TOKEN is required")
    yield

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

@app.middleware("http")
async def authenticate(request: Request, call_next):
    supplied = request.headers.get("authorization", "")
    if not TOKEN or not secrets.compare_digest(supplied, f"Bearer {TOKEN}"):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)

@app.get("/health")
async def health():
    return {"loaded": _model is not None}

def infer(data):
    global _model
    import numpy as np
    from faster_whisper import WhisperModel
    with _lock:
        if _model is None:
            _model = WhisperModel(os.getenv("QUBE_MODEL", "large-v3-turbo"),
                device=os.getenv("QUBE_DEVICE", "cuda"), compute_type=os.getenv("QUBE_COMPUTE", "int8_float16"))
        samples = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
        segments, _ = _model.transcribe(samples, language="zh", vad_filter=True, beam_size=5,
            condition_on_previous_text=False,
            initial_prompt=os.getenv("QUBE_VOCAB", "Qube, Codex, Claude, WSL, PowerShell, TypeScript, Python, GitHub, 网易云音乐。"))
        return "".join(segment.text for segment in segments).strip()

@app.post("/transcribe")
async def transcribe(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Recording exceeds 60 seconds")
    try:
        validate_pcm(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    try:
        text = await asyncio.to_thread(infer, bytes(data))
        return {"text": text}
    except Exception as exc:
        # No audio or transcript in logs; environment diagnostics only.
        print(f"Qube inference failed: {type(exc).__name__}", flush=True)
        raise HTTPException(503, "Check model download and CUDA/cuDNN installation") from exc

@app.post("/keywords")
async def keywords(request: Request):
    from pypinyin import lazy_pinyin, Style
    data = await request.json()
    phrase = data.get("phrase", "")
    if not isinstance(phrase, str) or not 2 <= len(phrase) <= 6 or not all("\u4e00" <= c <= "\u9fff" for c in phrase):
        raise HTTPException(400, "Use 2-6 Chinese characters")
    initials = lazy_pinyin(phrase, style=Style.INITIALS, strict=False)
    finals = lazy_pinyin(phrase, style=Style.FINALS, strict=False)
    toned = lazy_pinyin(phrase, style=Style.TONE)
    parts = []
    for initial, final, syllable in zip(initials, finals, toned):
        # KWS uses pinyin initials plus tone-marked finals (not numbered tones).
        suffix = syllable[len(initial):] if initial else syllable
        if initial:
            parts.append(initial)
        parts.append(suffix)
    return {"phrase": phrase, "tokens": " ".join(parts) + " @" + phrase}

@app.post("/unload")
async def unload():
    def release():
        global _model
        with _lock:
            _model = None
            gc.collect()
    await asyncio.to_thread(release)
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=19432, access_log=False, limit_concurrency=4)
