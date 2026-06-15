.PHONY: help install build up down logs clean restart prod-up prod-down test

help:
	@echo "ASCII Framer - Docker Development Commands"
	@echo "=========================================="
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build Docker images"
	@echo "  make up           - Start all services"
	@echo "  make down         - Stop all services"
	@echo "  make logs         - View logs (all services)"
	@echo "  make logs-backend - View backend logs"
	@echo "  make logs-frontend- View frontend logs"
	@echo "  make restart      - Restart all services"
	@echo "  make clean        - Remove containers and volumes"
	@echo ""
	@echo "Production:"
	@echo "  make prod-up      - Start production services"
	@echo "  make prod-down    - Stop production services"
	@echo "  make prod-logs    - View production logs"
	@echo ""
	@echo "Backend:"
	@echo "  make backend-shell- SSH into backend container"
	@echo "  make backend-npm  - npm install in backend"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend-shell- SSH into frontend container"
	@echo "  make frontend-npm - npm install in frontend"
	@echo ""
	@echo "Utility:"
	@echo "  make status       - Show container status"
	@echo "  make prune        - Clean up unused Docker resources"
	@echo "  make test         - Run tests"

install:
	@echo "Installing dependencies..."
	cd backend && npm install
	cd ../ascii-framer && npm install
	@echo "✓ Dependencies installed"

build:
	@echo "Building Docker images..."
	docker-compose build
	@echo "✓ Build complete"

up:
	@echo "Starting services (development)..."
	docker-compose up -d
	@echo "✓ Services started"
	@echo ""
	@echo "Access:"
	@echo "  Frontend: http://localhost:3000"
	@echo "  Backend:  http://localhost:5000/api/health"

down:
	@echo "Stopping services..."
	docker-compose down
	@echo "✓ Services stopped"

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

restart:
	@echo "Restarting services..."
	docker-compose restart
	@echo "✓ Services restarted"

clean:
	@echo "Cleaning up..."
	docker-compose down -v
	@echo "✓ Cleaned"

status:
	@echo "Container status:"
	docker-compose ps

prod-up:
	@echo "Starting services (production)..."
	docker-compose -f docker-compose.prod.yml up -d
	@echo "✓ Production services started"
	@echo ""
	@echo "Access:"
	@echo "  http://your-domain.com or http://your-ec2-ip"

prod-down:
	@echo "Stopping production services..."
	docker-compose -f docker-compose.prod.yml down
	@echo "✓ Production services stopped"

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f

backend-shell:
	docker-compose exec backend sh

frontend-shell:
	docker-compose exec frontend sh

backend-npm:
	docker-compose exec backend npm install

frontend-npm:
	docker-compose exec frontend npm install

prune:
	@echo "Pruning Docker resources..."
	docker system prune -a
	@echo "✓ Pruned"

test:
	@echo "Running tests..."
	docker-compose exec backend npm test || true
	docker-compose exec frontend npm test || true
	@echo "✓ Tests complete"

dev: build up
	@echo ""
	@echo "Development environment ready!"

.DEFAULT_GOAL := help
