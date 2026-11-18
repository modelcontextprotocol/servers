# The `memory` server's container image (#5345). Build it from the repository
# root, which is the build context:
#
#   docker build -f src/memory/Dockerfile -t mcp/memory .
#
# `memory` is an npm workspace, so its lockfile and the `overrides` that pin
# its transitive dependencies live in the root package.json and
# package-lock.json, not in src/memory. Both stages install from them with
# `npm ci`, so the image gets exactly the versions this repository tested,
# rather than whatever a lockfile-less `npm install` resolves on the day.
# Dockerfile.dockerignore (next to this file) keeps the context to what the
# build reads. The shape is src/everything/Dockerfile's (#3309).
#
# The server stays reachable at /app, to keep existing setups working. The
# README stores the graph in a named volume mounted over /app/dist, which is
# where the default memory file lives (next to dist/index.js), so /app is a
# symlink to the workspace directory and that mount still lands on the
# server's dist.
#
# Like that image, it runs as the unprivileged `node` user (#4741). A volume an
# earlier, root-running image created is owned by root, so the server can read
# that graph but not save it; the README's upgrade step gives it to `node`.

FROM node:24-alpine AS builder

WORKDIR /repo

# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json package-lock.json .npmrc tsconfig.json ./
COPY src/memory/package.json src/memory/

# `--ignore-scripts` skips the workspace's `prepare` build, which needs the
# source; the build runs explicitly below.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/memory --ignore-scripts

COPY src/memory src/memory
RUN npm run build --workspace src/memory


FROM node:24-alpine AS release

ENV NODE_ENV=production

WORKDIR /repo

COPY package.json package-lock.json .npmrc ./
COPY src/memory/package.json src/memory/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/memory --omit=dev --ignore-scripts

# The default memory.jsonl, its lock and its temporary save files live in
# dist (the README mounts a named volume over /app/dist), so the `node` user
# the server runs as must own it. A new named volume takes this ownership from
# the image when it is first mounted.
COPY --from=builder --chown=node:node /repo/src/memory/dist src/memory/dist

RUN ln -s /repo/src/memory /app

# /data is where the README's alternative setup mounts a volume of its own for
# the graph (MEMORY_FILE_PATH=/data/memory.jsonl). Docker creates a missing
# mount point owned by root, which the `node` user could not save to; a new
# named volume takes this directory's ownership instead.
RUN mkdir /data && chown node:node /data

WORKDIR /app

# Run as the base image's unprivileged `node` user (UID 1000), not root
# (#4741), so the image passes `runAsNonRoot` admission policies.
# It is named by number because Kubernetes cannot verify that a named user is
# not root, and refuses to start the container under `runAsNonRoot`.
USER 1000:1000

# The server handles SIGTERM itself, removing any lock it holds before it
# exits (#5485). Node running as PID 1 would otherwise ignore `docker stop`'s
# SIGTERM, leaving it to wait out its timeout and SIGKILL the server. SIGINT
# is handled the same way; it is the stop signal everything's image uses.
STOPSIGNAL SIGINT

ENTRYPOINT ["node", "dist/index.js"]
