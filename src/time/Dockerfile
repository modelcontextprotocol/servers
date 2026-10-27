# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS uv

# Install the project into `/app`
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Install the project's dependencies using the lockfile and settings
COPY uv.lock pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev --no-editable

# Then, add the rest of the project source code and install it
# Installing separately from its dependencies allows optimal layer caching
ADD . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

FROM python:3.12-slim-bookworm

WORKDIR /app
 
COPY --from=uv /root/.local /root/.local

RUN if ! id -u app >/dev/null 2>&1; then \
      useradd -rUM -s /usr/sbin/nologin app; \
    fi
COPY --from=uv --chown=app:app /app/.venv /app/.venv

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# The local timezone, overridable at run time with `docker run -e LOCAL_TIMEZONE=…`
ENV LOCAL_TIMEZONE=UTC

# Docker expands no variables in an exec-form ENTRYPOINT, so a shell reads
# LOCAL_TIMEZONE when the container starts (UTC when it is set but empty).
# `exec` keeps the server as PID 1, so it receives stop signals, and "$@"
# passes any arguments given after the image name on to the server.
ENTRYPOINT ["sh", "-c", "exec mcp-server-time --local-timezone \"${LOCAL_TIMEZONE:-UTC}\" \"$@\"", "--"]
