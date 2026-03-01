#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <audio_file> [sr|en|auto] [model]" >&2
  exit 1
fi

AUDIO="$1"
LANG="${2:-auto}"
MODEL="${3:-small}"

if [ "$LANG" = "auto" ]; then
  LANG_ARG=()
else
  LANG_ARG=(--lang "$LANG")
fi

/home/ubuntu/.venvs/stt/bin/python /home/ubuntu/.openclaw/workspace/transcribe_voice.py \
  "$AUDIO" \
  --model "$MODEL" \
  --compute int8 \
  "${LANG_ARG[@]}"
