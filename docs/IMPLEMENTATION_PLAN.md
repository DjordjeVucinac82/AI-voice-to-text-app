# AiVttApp — Detaljan plan

## 1) Scope i ciljevi

### Primarni cilj (MVP)
Napraviti stabilan servis koji prima audio fajl (`.ogg/.mp3/.wav`), transkribuje govor (SR/EN/auto) i vraća:
- čist tekst
- segmentaciju (start/end + text)
- osnovnu metriku (trajanje, model, vreme obrade)

### Non-goals (MVP)
- real-time streaming transkripcija
- diarization (ko je govornik)
- full enterprise SSO
- napredna korekcija teksta LLM-om

---

## 2) Ciljni korisnici i use-case

1. **B2B timovi (support/sales/ops)**
   - glasovne beleške → tekstualni zapis
2. **Agencije / content timovi**
   - brza transkripcija kratkih audio snimaka
3. **Interni dev timovi**
   - API-first integracija sa botovima i workflow alatima

---

## 3) Product features po fazama

## Faza 1 — MVP (7–10 dana)
- Upload audio fajla
- `POST /transcribe` (sync)
- jezički hint: `sr`, `en`, `auto`
- izbor modela: `tiny/small` (default `small`)
- response: text + segments + metadata
- osnovni web UI (upload + rezultat)
- healthcheck endpoint
- request logging i error handling

### Acceptance criteria
- uspešna transkripcija za 90% test fajlova
- jasne greške za unsupported format/oversize
- p95 vreme obrade za 30s audio < 12s (na ciljnoj instanci)

## Faza 2 — Production-ready core (2–3 nedelje)
- async jobs (`POST /jobs`, `GET /jobs/{id}`)
- Redis queue + worker proces
- object storage (lokalno ili S3 kompatibilno)
- auth (API key)
- rate limiting
- audit log + usage metrika
- docker-compose deployment

### Acceptance criteria
- horizontalno skaliranje worker-a
- retry politika i idempotency key
- dashboard metrika (broj job-ova, success rate, latency)

## Faza 3 — Monetization i integracije (2–4 nedelje)
- plans/quotas
- billing hooks (po minutu audio)
- Telegram/WhatsApp bot integracija
- webhook callback kad job završi
- export u `.txt/.json/.srt`

---

## 4) Tehnička arhitektura

## Komponente
1. **API (FastAPI)**
   - validacija ulaza
   - auth/rate limit
   - kreiranje job-ova
2. **Worker (Python)**
   - ffmpeg normalizacija audio
   - faster-whisper inference
   - rezultat + metadata storage
3. **Queue (Redis)**
   - buffering i retry
4. **Storage**
   - lokalni disk (MVP) → S3 (prod)
5. **UI (minimal React/HTMX/plain HTML)**
   - upload forma
   - polling job status

## Predlog folder strukture
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
  - `index.html` ili React app
- `infra/`
  - `docker-compose.yml`
  - `Dockerfile.api`
  - `Dockerfile.worker`

---

## 5) API dizajn (v1)

## `POST /v1/transcribe`
Sync endpoint (MVP).

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
- vraća status API, worker connectivity, verziju modela

## Faza 2 dodatak
- `POST /v1/jobs`
- `GET /v1/jobs/{id}`
- `GET /v1/jobs/{id}/result`

---

## 6) Audio pipeline

1. Intake audio
2. Validacija MIME/extension/size
3. Normalizacija preko ffmpeg:
   - mono
   - 16kHz
   - PCM WAV interni format
4. Inference (faster-whisper)
5. Postprocess:
   - trim whitespace
   - spajanje fragmenata
6. Persist + response

---

## 7) Security i compliance baseline

- API key auth (od Faze 2)
- file size limit (npr. 25MB MVP)
- antivirus optional (prod)
- sandbox path handling (no path traversal)
- no public URL exposure bez auth
- secrets u env varijablama
- structured audit log

---

## 8) Observability

- structured JSON logs
- metrike:
  - request count
  - success/error rate
  - p50/p95 latency
  - queue depth
  - worker crash count
- alerting:
  - error rate > 5%
  - queue delay > 60s

---

## 9) Test strategija

## Unit testovi
- MIME validator
- model param validation
- postprocess formatter

## Integration
- upload → transcribe → JSON schema verify
- invalid file / timeout / oversized file

## E2E
- UI upload + rezultat render
- async job lifecycle (faza 2)

## Test dataset
- 20 SR audio fajlova
- 20 EN audio fajlova
- kratki/dugi/noisy sample

KPI:
- WER trend po jeziku
- fallback rate

---

## 10) Infra i deployment

## MVP
- jedan server (EC2)
- docker-compose: api + worker + redis
- volume za uploads/results

## Prod preporuka
- reverse proxy (Caddy/Nginx)
- TLS
- S3 storage
- Redis managed
- CI/CD deploy pipeline

---

## 11) Pricing model (predlog)

- Free: 30 min/mesec
- Pro: 10–20 EUR/mesec (fair-use)
- Team: seat + usage
- API: pay-as-you-go po minutu audia

---

## 12) Rizici i mitigacije

1. **OOM na medium/large modelu**
   - default small + queue isolation + memory limits
2. **Netacan SR transkript na šumu**
   - preprocess + optional boost model + language hint
3. **Spora obrada pod opterećenjem**
   - async queue + horizontal worker scaling
4. **Cost creep**
   - usage metrika + hard quotas

---

## 13) Operativni plan (prvih 7 dana)

## Dan 1
- API skeleton + `/health`
- upload validation

## Dan 2
- integrate transcribe service
- basic sync endpoint

## Dan 3
- JSON schema finalize
- error codes standardizacija

## Dan 4
- minimal UI
- E2E ručni test

## Dan 5
- docker-compose + environment config

## Dan 6
- logging + metrics
- load smoke test

## Dan 7
- hardening + doc + release v0.1

---

## 14) Definition of Done (MVP)

- endpointi rade stabilno
- dokumentovan API
- reproducible lokalni start (`docker compose up`)
- test primeri prolaze
- known limitations dokumentovane
