# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build

WORKDIR /app

# Copia solo los archivos necesarios para instalar dependencias
COPY pyproject.toml uv.lock ./

# Instala dependencias en un venv local
RUN python3 -m venv /app/.venv \
    && . /app/.venv/bin/activate \
    && pip install --upgrade pip \
    && pip install --no-cache-dir --upgrade uv \
    && uv pip compile --generate-hashes pyproject.toml -o requirements.txt \
    && uv pip install --no-cache-dir --require-hashes -r requirements.txt

# Copia el resto del código
COPY . .

# Instala el proyecto en el venv
RUN . /app/.venv/bin/activate && pip install --no-cache-dir .

# Segunda etapa: imagen limpia y segura
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia el venv completo y el código fuente
COPY --from=build /app /app

# Asegura permisos para cualquier usuario
RUN chmod -R a+rx /app

ENV PATH="/app/.venv/bin:$PATH"

ENTRYPOINT ["mcp-server-git"]
