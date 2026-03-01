from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel
import tempfile
import os

app = FastAPI(title="AI Voice-to-Text API", version="0.1.0")
_model_cache = {}

ALLOWED_MODELS = {"tiny", "small", "medium"}
ALLOWED_LANGS = {"auto", "sr", "en", "es", "de", "fr", "it", "pt", "ru", "tr", "ar", "hi", "zh", "ja", "ko"}

class HealthResponse(BaseModel):
    status: str


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

    suffix = os.path.splitext(file.filename or "audio.ogg")[1] or ".ogg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file")
        tmp.write(content)
        tmp_path = tmp.name

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

        return {
            "text": " ".join(text_parts).strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": segs,
            "meta": {"model": model, "compute_type": "int8"},
        }
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
