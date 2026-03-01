#!/usr/bin/env python3
import argparse
import json
import os
import sys
from faster_whisper import WhisperModel


def main():
    p = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    p.add_argument("audio", help="Path to input audio file")
    p.add_argument("--model", default="small", help="Whisper model size (tiny/base/small/medium/large-v3)")
    p.add_argument("--lang", default=None, help="Language code, e.g. sr, en (default: auto)")
    p.add_argument("--compute", default="int8", help="Compute type (int8, float16, float32)")
    p.add_argument("--json", action="store_true", help="Output JSON")
    args = p.parse_args()

    if not os.path.isfile(args.audio):
        print(f"ERROR: file not found: {args.audio}", file=sys.stderr)
        sys.exit(2)

    model = WhisperModel(args.model, compute_type=args.compute)
    segments, info = model.transcribe(args.audio, language=args.lang, vad_filter=True)

    text_parts = []
    seg_out = []
    for s in segments:
        t = s.text.strip()
        if t:
            text_parts.append(t)
        seg_out.append({"start": s.start, "end": s.end, "text": s.text})

    result = {
        "file": args.audio,
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "text": " ".join(text_parts).strip(),
        "segments": seg_out,
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result["text"])


if __name__ == "__main__":
    main()
