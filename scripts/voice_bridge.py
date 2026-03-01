#!/usr/bin/env python3
"""
Channel-agnostic voice bridge for OpenClaw inbound media.
Supports Telegram / WhatsApp / Viber (and any future channel with audio attachments).
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

PYTHON_STT = "/home/ubuntu/.venvs/stt/bin/python"
TRANSCRIBE_PY = "/home/ubuntu/.openclaw/workspace/AI-voice-to-text-app/scripts/transcribe_voice.py"
SUPPORTED_CHANNELS = {
    "auto",
    "telegram",
    "whatsapp",
    "viber",
    "discord",
    "slack",
    "signal",
    "imessage",
    "googlechat",
    "irc",
}
LANG_ALIASES = {
    "auto": "auto",
    "serbian": "sr", "srpski": "sr", "sr": "sr",
    "english": "en", "engleski": "en", "en": "en",
    "spanish": "es", "espanol": "es", "español": "es", "spanski": "es", "španski": "es", "es": "es",
    "german": "de", "nemacki": "de", "nemački": "de", "de": "de",
    "french": "fr", "francuski": "fr", "fr": "fr",
    "italian": "it", "italijanski": "it", "it": "it",
    "portuguese": "pt", "portugalski": "pt", "pt": "pt",
    "russian": "ru", "ruski": "ru", "ru": "ru",
    "turkish": "tr", "turski": "tr", "tr": "tr",
    "arabic": "ar", "arapski": "ar", "ar": "ar",
    "hindi": "hi", "hi": "hi",
    "chinese": "zh", "kineski": "zh", "zh": "zh",
    "japanese": "ja", "japanski": "ja", "ja": "ja",
    "korean": "ko", "korejski": "ko", "ko": "ko",
}


CHANNEL_EXT_DEFAULT = {
    "telegram": ".ogg",
    "whatsapp": ".opus",
    "viber": ".ogg",
    "discord": ".ogg",
    "slack": ".m4a",
    "signal": ".ogg",
    "imessage": ".m4a",
    "googlechat": ".wav",
    "irc": ".ogg",
    "auto": ".ogg",
}


def normalize_lang(lang: str) -> str:
    l = (lang or "auto").strip().lower()
    if l in LANG_ALIASES:
        return LANG_ALIASES[l]
    # Accept arbitrary ISO-like values (e.g., nl, pl, sv, uk)
    if len(l) in (2, 3) and l.replace('-', '').isalpha():
        return l
    return "auto"


def fail(msg: str, code: int = 1):
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    raise SystemExit(code)


def prepare_audio_for_channel(audio: Path, channel: str) -> Path:
    """
    Channel-specific normalization hook.

    Why this exists:
    Some chat providers send voice attachments without a file extension.
    Whisper/ffmpeg usually detect format from file headers, but in edge cases
    extensionless blobs can fail downstream parser hints.

    Behavior:
    - If extension already exists -> use original file unchanged.
    - If extension is missing -> create temp clone with provider-default suffix
      (e.g. whatsapp=.opus, slack/imessage=.m4a, telegram=.ogg).

    This increases cross-channel reliability without mutating original inbound media.
    """
    if audio.suffix:
        return audio

    ext = CHANNEL_EXT_DEFAULT.get(channel, ".ogg")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.close()
    with open(audio, "rb") as src, open(tmp.name, "wb") as dst:
        dst.write(src.read())
    return Path(tmp.name)


STRICT_LANG_CONFIDENCE_THRESHOLD = 0.85

def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio_path", help="Path to inbound audio file")
    p.add_argument("--channel", default="auto", help="auto|telegram|whatsapp|viber|discord|slack|signal|imessage|googlechat|irc")
    p.add_argument("--lang", default="auto", help="Language code/name (auto, sr, en, es, spanish, etc.)")
    p.add_argument("--model", default="small", help="tiny|small|medium")
    p.add_argument("--json", action="store_true", help="Emit JSON output")
    args = p.parse_args()

    channel = args.channel.lower()
    if channel not in SUPPORTED_CHANNELS:
        fail(f"unsupported channel: {channel}")

    audio = Path(args.audio_path)
    if not audio.exists() or not audio.is_file():
        fail(f"audio file not found: {audio}")

    lang = normalize_lang(args.lang)
    # Normalize inbound media per channel (mainly for extensionless voice blobs)
    # to improve ffmpeg/whisper format detection reliability across providers.
    normalized_audio = prepare_audio_for_channel(audio, channel)

    # OpenClaw inbound audio from all channels is file-path based.
    # Per-channel normalization handles extensionless blobs and format hints.
    cmd = [PYTHON_STT, TRANSCRIBE_PY, str(normalized_audio), "--model", args.model, "--compute", "int8", "--json"]
    if lang != "auto":
        cmd.extend(["--lang", lang])

    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
    except subprocess.CalledProcessError as e:
        if normalized_audio != audio:
            try:
                normalized_audio.unlink(missing_ok=True)
            except Exception:
                pass
        fail(f"transcription failed: {e.output.strip()}")

    cleaned = out.strip()
    # ctranslate/onnx may print warnings before JSON payload; extract JSON object safely.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        fail(f"invalid transcription output (no JSON object): {cleaned[:300]}")

    json_blob = cleaned[start:end+1]
    try:
        data = json.loads(json_blob)
    except json.JSONDecodeError:
        fail(f"invalid transcription JSON output: {cleaned[:300]}")

    transcript = (data.get("text") or "").strip()
    detected_lang = data.get("language") or lang
    lang_conf = float(data.get("language_probability") or 0.0)

    warning = None
    if lang_conf < STRICT_LANG_CONFIDENCE_THRESHOLD:
        warning = (
            f"Low language confidence ({lang_conf:.2f} < {STRICT_LANG_CONFIDENCE_THRESHOLD:.2f}). "
            "Consider retry with explicit --lang or cleaner audio."
        )

    if normalized_audio != audio:
        try:
            normalized_audio.unlink(missing_ok=True)
        except Exception:
            pass

    if args.json:
        print(json.dumps({
            "ok": True,
            "channel": channel,
            "audio_path": str(audio),
            "normalized_audio_path": str(normalized_audio),
            "transcript": transcript,
            "lang": detected_lang,
            "language_confidence": round(lang_conf, 4),
            "language_confidence_threshold": STRICT_LANG_CONFIDENCE_THRESHOLD,
            "warning": warning,
            "model": args.model,
        }, ensure_ascii=False))
    else:
        print(transcript)


if __name__ == "__main__":
    main()
