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
cd infra
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
Production TLS je podešen preko **Caddy** (automatski Let's Encrypt).

1) U `.env` podesi:
- `DOMAIN=your-domain.com`
- `LETSENCRYPT_EMAIL=you@domain.com`

2) DNS:
- `A` record za `DOMAIN` mora da pokazuje na server IP
- portovi `80` i `443` otvoreni

3) Start stack:
```bash
docker compose up -d --build
```

Caddy će automatski preuzeti i obnavljati certifikate.

### Legacy opcija
Nginx je ostavljen kao `legacy-nginx` profil (ručni certovi), ali nije podrazumevani put.
