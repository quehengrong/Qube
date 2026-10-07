"""Validation independent of inference / CUDA, so malformed audio never reaches a model."""
MAX_BYTES = 16000 * 2 * 60

def validate_pcm(data: bytes) -> bytes:
    if len(data) < 3200 or len(data) > MAX_BYTES or len(data) % 2:
        raise ValueError("Expected 0.1–60 seconds of signed little-endian PCM16, mono 16 kHz")
    return data
