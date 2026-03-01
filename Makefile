.PHONY: run-api build up down

run-api:
	uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down
