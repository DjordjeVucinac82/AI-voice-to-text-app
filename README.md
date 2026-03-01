# AiVttApp

## Quickstart (local)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload
```

## Docker build/run
```bash
docker compose build
docker compose up -d
```

API health:
```bash
curl http://localhost:8080/health
```

## Frontend (npm + Vite)
```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:3000`

## Naming convention
- Project codename: `AiVttApp`
- Python/service slug: `aivttapp`
- Docker images: `aivttapp-api:latest`, `aivttapp-worker:latest`

Run frontend in Docker:
```bash
docker compose up -d frontend
```

## HTTPS / TLS (Let's Encrypt)
Production TLS is configured via **Caddy** (automatic Let's Encrypt).

1) Set in `.env`:
- `DOMAIN=your-domain.com`
- `LETSENCRYPT_EMAIL=you@domain.com`

2) DNS:
- `A` record for `DOMAIN` must point to the server IP
- ports `80` and `443` must be open

3) Start the stack:
```bash
docker compose up -d --build
```

Caddy will automatically obtain and renew certificates.

### Legacy option
Nginx is kept as the `legacy-nginx` profile (manual certificates), but it is not the default path.
