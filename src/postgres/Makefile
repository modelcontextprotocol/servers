# Makefile
.PHONY: help install build clean dev test podman

# Default target
help:
	@echo "Available targets:"
	@echo "  install     - Install dependencies"
	@echo "  build       - Build the project"
	@echo "  clean       - Clean build artifacts"
	@echo "  dev-http    - Start HTTP server in development"
	@echo "  dev-stdio   - Start Stdio server in development"
	@echo "  start-http  - Start HTTP server in production"
	@echo "  start-stdio - Start Stdio server in production"
	@echo "  test        - Test HTTP server"
	@echo "  podman-build - Build Docker images"
	@echo "  podman-up   - Start HTTP server container"
	@echo "  podman-down - Stop containers"
	@echo "  podman-logs - View container logs"
	@echo "  podman-clean - Clean Docker resources"

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
    podman-compose build

podman-up:
    podman-compose up -d mcp-http

podman-down:
    podman-compose down

podman-logs:
    podman-compose logs -f mcp-http

podman-clean:
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
