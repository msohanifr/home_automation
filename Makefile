.PHONY: help build up down restart logs backend-shell backend-migrate backend-superuser backend-test frontend-install frontend-build clean

help:
	@echo "Home Automation Hub - Make targets"
	@echo ""
	@echo "  build             Build all Docker images"
	@echo "  up                Start backend and frontend (docker-compose up)"
	@echo "  down              Stop all containers"
	@echo "  restart           Restart stack (down + up)"
	@echo "  logs              Tail logs from all services"
	@echo "  backend-shell     Open a shell inside the backend container"
	@echo "  backend-migrate   Run Django migrations inside backend container"
	@echo "  backend-superuser Create a Django superuser"
	@echo "  backend-test      Run Django tests"
	@echo "  frontend-install  Install JS dependencies for the frontend (npm install)"
	@echo "  frontend-build    Build the frontend bundle"
	@echo "  clean             Remove Python cache and build artifacts"
	@echo ""

build:
	docker-compose build

up:
	docker-compose up

down:
	docker-compose down

restart: down up

logs:
	docker-compose logs -f

backend-shell:
	docker-compose exec backend /bin/bash || docker-compose exec backend /bin/sh

backend-migrate:
	docker-compose exec backend python manage.py migrate

backend-superuser:
	docker-compose exec backend python manage.py createsuperuser

backend-test:
	docker-compose exec backend python manage.py test

frontend-install:
	cd frontend && npm install

frontend-build:
	cd frontend && npm run build

clean:
	find . -name '__pycache__' -type d -exec rm -rf {} + || true
	find . -name '*.pyc' -delete || true
	rm -rf backend/staticfiles || true
	rm -rf frontend/dist || true