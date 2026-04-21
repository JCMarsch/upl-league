.PHONY: test test-backend test-frontend install dev

test-backend:
	cd backend && pytest --cov=app --cov-report=term-missing

test-frontend:
	cd frontend && npm run test

test: test-backend test-frontend

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

dev:
	docker-compose up
