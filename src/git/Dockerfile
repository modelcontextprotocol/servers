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

RUN apt-get update && apt-get install -y git git-lfs && rm -rf /var/lib/apt/lists/* \
    && git lfs install --system

WORKDIR /app
 
COPY --from=uv /root/.local /root/.local
# /root defaults to 700, which blocks any non-root user from even traversing
# into /root/.local — and the venv's own python binary is a symlink into
# /root/.local/share/uv/python/.../bin/python3.11, resolved at every startup,
# not just at build time. Without this, switching to a non-root USER below
# breaks the interpreter itself, not just file access.
RUN chmod o+rx /root

RUN if ! id -u app >/dev/null 2>&1; then \
      useradd -rUM -s /usr/sbin/nologin app; \
    fi
COPY --from=uv --chown=app:app /app/.venv /app/.venv

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# The container's job is exclusively to operate on whichever repo is bind-mounted
# in, so there's no meaningful "wrong owner" for git to protect against here the
# way there is on a shared host; without this, git refuses to touch a repo owned
# by a different uid than the app user once we stop running as root below.
RUN git config --system --add safe.directory '*'

USER app

# when running the container, add --db-path and a bind mount to the host's db file
ENTRYPOINT ["mcp-server-git"]
