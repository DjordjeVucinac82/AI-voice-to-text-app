.PHONY: run-api build up down

run-api:
	uvicorn api.app.main:app --host 0.0.0.0 --port 8080 --reload

build:
	docker compose -f infra/docker-compose.yml build

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down
