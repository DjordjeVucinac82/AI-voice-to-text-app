# AiVttApp — Detailed Implementation Plan

## 1) Scope and goals

### Primary goal (MVP)
Build a stable service that accepts audio files (`.ogg/.mp3/.wav`), transcribes speech (SR/EN/auto), and returns:
- clean text
- segmentation (start/end + text)
- basic metrics (duration, model, processing time)

### Non-goals (MVP)
- real-time streaming transcription
- speaker diarization
- full enterprise SSO
- advanced LLM-based post-correction

---

## 2) Target users and use cases

1. **B2B teams (support/sales/ops)**
   - voice notes → text records
2. **Agencies / content teams**
   - fast transcription of short audio clips
3. **Internal dev teams**
   - API-first integration with bots and workflow tools

---

## 3) Product features by phase

## Phase 1 — MVP (7–10 days)
- Audio file upload
- `POST /transcribe` (sync)
- language hint: `sr`, `en`, `auto`
- model selection: `tiny/small` (default `small`)
- response: text + segments + metadata
- basic web UI (upload + result)
- healthcheck endpoint
- request logging and error handling

### Acceptance criteria
- successful transcription for 90% of test files
- clear errors for unsupported format/oversized input
- p95 processing time for 30s audio < 12s (on target instance)

## Phase 2 — Production-ready core (2–3 weeks)
- async jobs (`POST /jobs`, `GET /jobs/{id}`)
- Redis queue + worker process
- object storage (local or S3-compatible)
- auth (API key)
- rate limiting
- audit logging + usage metrics
- docker-compose deployment

### Acceptance criteria
- horizontal worker scaling
- retry policy and idempotency key support
- dashboard metrics (job count, success rate, latency)

## Phase 3 — Monetization and integrations (2–4 weeks)
- plans/quotas
- billing hooks (per minute of audio)
- Telegram/WhatsApp bot integration
- webhook callback when job completes
- export to `.txt/.json/.srt`

---

## 4) Technical architecture

## Components
1. **API (FastAPI)**
   - input validation
   - auth/rate limiting
   - job creation
2. **Worker (Python)**
   - ffmpeg audio normalization
   - faster-whisper inference
   - result + metadata storage
3. **Queue (Redis)**
   - buffering and retries
4. **Storage**
   - local disk (MVP) → S3 (prod)
5. **UI (minimal React/HTMX/plain HTML)**
   - upload form
   - job-status polling

## Proposed folder structure
- `api/`
  - `main.py`
  - `routes/transcribe.py`
  - `routes/jobs.py`
  - `services/storage.py`
  - `services/auth.py`
- `worker/`
  - `worker.py`
  - `tasks/transcribe_task.py`
  - `audio/preprocess.py`
- `app/`
  - `index.html` or React app
- `infra/`
  - `docker-compose.yml`
  - `Dockerfile.api`
  - `Dockerfile.worker`

---

## 5) API design (v1)

## `POST /v1/transcribe`
Synchronous endpoint (MVP).

### Request
- multipart/form-data:
  - `file`: audio
  - `language`: `auto|sr|en` (default `auto`)
  - `model`: `tiny|small|medium` (default `small`)

### Response
```json
{
  "text": "...",
  "language": "sr",
  "duration": 12.4,
  "processing_ms": 1800,
  "segments": [
    {"start": 0.1, "end": 2.2, "text": "..."}
  ],
  "meta": {
    "model": "small",
    "compute_type": "int8"
  }
}
```

## `GET /health`
- returns API status, worker connectivity, and model version info

## Phase 2 additions
- `POST /v1/jobs`
- `GET /v1/jobs/{id}`
- `GET /v1/jobs/{id}/result`

---

## 6) Audio pipeline

1. Intake audio
2. Validate MIME/extension/size
3. Normalize via ffmpeg:
   - mono
   - 16kHz
   - internal PCM WAV format
4. Inference (faster-whisper)
5. Postprocess:
   - trim whitespace
   - merge fragments
6. Persist + return response

---

## 7) Security and compliance baseline

- API key auth (from Phase 2)
- file-size limits (e.g. 25MB MVP)
- optional antivirus in prod
- sandboxed path handling (no path traversal)
- no public URL exposure without auth
- secrets via env vars
- structured audit logging

---

## 8) Observability

- structured JSON logs
- metrics:
  - request count
  - success/error rate
  - p50/p95 latency
  - queue depth
  - worker crash count
- alerts:
  - error rate > 5%
  - queue delay > 60s

---

## 9) Testing strategy

## Unit tests
- MIME validator
- model parameter validation
- postprocess formatter

## Integration tests
- upload → transcribe → JSON schema verification
- invalid file / timeout / oversized file

## E2E tests
- UI upload + result rendering
- async job lifecycle (Phase 2)

## Test dataset
- 20 SR audio files
- 20 EN audio files
- short/long/noisy samples

KPIs:
- WER trend by language
- fallback rate

---

## 10) Infrastructure and deployment

## MVP
- single server (EC2)
- docker-compose: api + worker + redis
- volumes for uploads/results

## Production recommendation
- reverse proxy (Caddy/Nginx)
- TLS
- S3 storage
- managed Redis
- CI/CD deployment pipeline

---

## 11) Pricing model (proposal)

- Free: 30 min/month
- Pro: 10–20 EUR/month (fair use)
- Team: seat + usage
- API: pay-as-you-go per audio minute

---

## 12) Risks and mitigations

1. **OOM on medium/large models**
   - default to small + queue isolation + memory limits
2. **Lower SR accuracy in noisy audio**
   - preprocessing + optional larger model + language hint
3. **Slow processing under load**
   - async queue + horizontal worker scaling
4. **Cost creep**
   - usage metrics + hard quotas

---

## 13) Operational plan (first 7 days)

## Day 1
- API skeleton + `/health`
- upload validation

## Day 2
- integrate transcription service
- basic sync endpoint

## Day 3
- finalize JSON schema
- standardize error codes

## Day 4
- minimal UI
- manual E2E test

## Day 5
- docker-compose + environment configuration

## Day 6
- logging + metrics
- load smoke test

## Day 7
- hardening + docs + release v0.1

---

## 14) Definition of Done (MVP)

- stable endpoints
- documented API
- reproducible local start (`docker compose up`)
- test examples pass
- known limitations documented
