FROM python:3.12-slim-bookworm

WORKDIR /app

# Install uv
COPY requirements.setup.txt pyproject.toml README.md /app/
RUN python -m pip install --no-cache-dir -r requirements.setup.txt \
    && uv venv \
    && uv sync


COPY . /app/

# Run the server
ENTRYPOINT ["uv", "run", "mcp-server-googlesearch"]
