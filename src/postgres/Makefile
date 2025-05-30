# Makefile

.PHONY: help install build clean dev test podman \
        dev-http dev-stdio start-http start-stdio \
        podman-build podman-up podman-down podman-logs podman-clean \
        docker-build docker-up docker-down docker-logs docker-clean

# Default target
help:
	@echo "Available targets:"
	@echo "  install       - Install dependencies"
	@echo "  build         - Build the project"
	@echo "  clean         - Clean build artifacts"
	@echo "  dev-http      - Start HTTP server in development"
	@echo "  dev-stdio     - Start Stdio server in development"
	@echo "  start-http    - Start HTTP server in production"
	@echo "  start-stdio   - Start Stdio server in production"
	@echo "  test          - Test HTTP server"
	@echo "  podman-build  - Build Docker images"
	@echo "  podman-up     - Start HTTP server container"
	@echo "  podman-down   - Stop containers"
	@echo "  podman-logs   - View container logs"
	@echo "  podman-clean  - Clean Docker resources"
	@echo "  docker-build  - Build Docker images (Docker)"
	@echo "  docker-up     - Start HTTP server container (Docker)"
	@echo "  docker-down   - Stop containers (Docker)"
	@echo "  docker-logs   - View container logs (Docker)"
	@echo "  docker-clean  - Clean Docker resources (Docker)"

install:
	npm install

build: clean
	npm run build

clean:
	npm run clean

dev-http:
	npm run dev:http

dev-stdio:
	npm run dev:stdio

start-http: build
	npm run start:http

start-stdio: build
	npm run start:stdio

test:
	npm run test:http

podman-build:
	@if [ "$$(podman machine info --format '{{.Host.State}}' 2>/dev/null)" != "Running" ]; then \
		echo "Starting Podman..."; \
		podman machine start; \
	else \
		echo "Podman is already running."; \
	fi
	uv run podman-compose build

podman-up:
	@if [ "$$(podman machine info --format '{{.Host.State}}' 2>/dev/null)" != "Running" ]; then \
		echo "Starting Podman..."; \
		podman machine start; \
	else \
		echo "Podman is already running."; \
	fi
	uv run podman-compose up -d mcp-http

podman-down:
	@if [ "$$(podman machine info --format '{{.Host.State}}' 2>/dev/null)" != "Running" ]; then \
		echo "Starting Podman..."; \
		podman machine start; \
	else \
		echo "Podman is already running."; \
	fi
	podman-compose down

podman-logs:
	@if [ "$$(podman machine info --format '{{.Host.State}}' 2>/dev/null)" != "Running" ]; then \
		echo "Starting Podman..."; \
		podman machine start; \
	else \
		echo "Podman is already running."; \
	fi
	podman-compose logs -f mcp-http

podman-clean:
	@if [ "$$(podman machine info --format '{{.Host.State}}' 2>/dev/null)" != "Running" ]; then \
		echo "Starting Podman..."; \
		podman machine start; \
	else \
		echo "Podman is already running."; \
	fi
	podman-compose down -v
	podman system prune -af --volumes

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d mcp-http

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-clean:
	docker-compose down -v --rmi all
	docker system prune -f
