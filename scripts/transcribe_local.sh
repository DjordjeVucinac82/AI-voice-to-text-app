#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <audio_file> [lang:auto|sr|en] [model:tiny|small|medium]" >&2
  exit 1
fi

AUDIO="$1"
LANG="${2:-auto}"
MODEL="${3:-small}"

if [ "$LANG" = "auto" ]; then
  /home/ubuntu/.openclaw/workspace/transcribe_voice.sh "$AUDIO" auto "$MODEL"
else
  /home/ubuntu/.openclaw/workspace/transcribe_voice.sh "$AUDIO" "$LANG" "$MODEL"
fi
