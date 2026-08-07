# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS uv

# Install the project into `/app`
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Install the project's dependencies using the lockfile and settings
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev --no-editable

# Then, add the rest of the project source code and install it
# Installing separately from its dependencies allows optimal layer caching
ADD . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

FROM python:3.12-slim-bookworm

WORKDIR /app
 
COPY --from=uv /root/.local /root/.local
COPY --from=uv --chown=app:app /app/.venv /app/.venv

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Set the LOCAL_TIMEZONE environment variable
ENV LOCAL_TIMEZONE=${LOCAL_TIMEZONE:-"UTC"}

# Exec-form ENTRYPOINT does not invoke a shell, so "${LOCAL_TIMEZONE}" below was
# never expanded — it was passed to the process as the literal string
# "${LOCAL_TIMEZONE}", which ZoneInfo() then rejected on every run.
# Shell form expands the variable; `exec` still replaces the shell so signals
# (e.g. SIGTERM) reach mcp-server-time directly, same as exec form would.
# when running the container, add --local-timezone and a bind mount to the host's db file
ENTRYPOINT exec mcp-server-time --local-timezone "$LOCAL_TIMEZONE"
