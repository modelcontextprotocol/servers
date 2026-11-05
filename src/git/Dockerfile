# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS uv

# Install the project into `/app`
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Install the Python that .python-version pins under /python rather than the
# default /root/.local, which the unprivileged runtime user cannot read (/root
# is mode 700). The virtualenv's interpreter links into this directory.
ENV UV_PYTHON_INSTALL_DIR=/python

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

# `safe.directory '*'`: a bind-mounted repository shows up owned by whatever UID
# the host or Docker Desktop maps it to, rarely the unprivileged `app` user the
# server runs as, so git's ownership check would refuse every repository the
# container is given (#4741). The only repositories the container sees are the
# ones its user chose to mount, which is the trust that check stands in for.
RUN apt-get update && apt-get install -y git git-lfs && rm -rf /var/lib/apt/lists/* \
    && git lfs install --system \
    && git config --system --add safe.directory '*'

WORKDIR /app
 
COPY --from=uv /python /python

# The server runs as the unprivileged `app` user, not root (#4741), so files it
# writes into a bind mount are not root-owned on the host and the image passes
# `runAsNonRoot` admission policies. The user gets a home directory, where
# HOME points, for any per-user configuration a tool reads.
RUN if ! id -u app >/dev/null 2>&1; then \
      useradd -rUm -d /home/app -s /usr/sbin/nologin app; \
    fi
COPY --from=uv --chown=app:app /app/.venv /app/.venv

USER app

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# when running the container, add --db-path and a bind mount to the host's db file
ENTRYPOINT ["mcp-server-git"]
