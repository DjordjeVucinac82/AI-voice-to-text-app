# AI Voice-to-Text App

## Quickstart (local)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.app.main:app --host 0.0.0.0 --port 8080 --reload
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
