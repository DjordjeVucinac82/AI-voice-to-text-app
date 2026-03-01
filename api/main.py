from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel
import tempfile
import os
import hashlib
import json
import redis

app = FastAPI(title="AiVttApp API", version="0.1.0")
_model_cache = {}

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "86400"))
_redis_client = None

ALLOWED_MODELS = {"tiny", "small", "medium"}
ALLOWED_LANGS = {"auto", "sr", "en", "es", "de", "fr", "it", "pt", "ru", "tr", "ar", "hi", "zh", "ja", "ko"}

class HealthResponse(BaseModel):
    status: str


def get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception:
        _redis_client = None
        return None


def get_model(model_name: str) -> WhisperModel:
    if model_name not in _model_cache:
        _model_cache[model_name] = WhisperModel(model_name, compute_type="int8")
    return _model_cache[model_name]


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/v1/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    model: str = Form("small"),
):
    language = language.lower().strip()
    model = model.lower().strip()

    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {model}")
    if language not in ALLOWED_LANGS:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")

    # Keep broad compatibility for phone-recorded formats across chat apps.
    # We do not strict-block by extension here; ffmpeg/whisper handle decoding.
    suffix = os.path.splitext(file.filename or "audio.ogg")[1] or ".ogg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file")
        tmp.write(content)
        tmp_path = tmp.name

    audio_sha = hashlib.sha256(content).hexdigest()
    cache_key = f"transcript:{model}:{language}:{audio_sha}"
    r = get_redis_client()
    if r is not None:
        cached = r.get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                data.setdefault("meta", {})["cache"] = "hit"
                return data
            except Exception:
                pass

    try:
        wm = get_model(model)
        kwargs = {"vad_filter": True}
        if language != "auto":
            kwargs["language"] = language
        segments, info = wm.transcribe(tmp_path, **kwargs)

        segs = []
        text_parts = []
        for s in segments:
            t = s.text.strip()
            if t:
                text_parts.append(t)
            segs.append({"start": s.start, "end": s.end, "text": s.text})

        result = {
            "text": " ".join(text_parts).strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": segs,
            "meta": {"model": model, "compute_type": "int8", "cache": "miss"},
        }

        if r is not None:
            try:
                r.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(result))
            except Exception:
                pass

        return result
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
