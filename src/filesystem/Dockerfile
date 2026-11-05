# The `filesystem` server's container image (#5345). Build it from the
# repository root, which is the build context:
#
#   docker build -f src/filesystem/Dockerfile -t mcp/filesystem .
#
# `filesystem` is an npm workspace, so its lockfile and the `overrides` that
# pin its transitive dependencies live in the root package.json and
# package-lock.json, not in src/filesystem. Both stages install from them with
# `npm ci`, so the image gets exactly the versions this repository tested,
# rather than whatever a lockfile-less `npm install` resolves on the day.
# Dockerfile.dockerignore (next to this file) keeps the context to what the
# build reads. The shape is src/everything/Dockerfile's (#3309).
#
# Unlike that image, this one still runs as root. The server reads and writes
# the host directories bind-mounted under /projects, and a non-root user can
# only write to them when the host owner's uid matches, so the switch changes
# what existing setups can do. It is decided with the other images in #4741.

FROM node:24-alpine AS builder

WORKDIR /repo

# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json package-lock.json .npmrc tsconfig.json ./
COPY src/filesystem/package.json src/filesystem/

# `--ignore-scripts` skips the workspace's `prepare` build, which needs the
# source; the build runs explicitly below.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/filesystem --ignore-scripts

COPY src/filesystem src/filesystem
RUN npm run build --workspace src/filesystem


FROM node:24-alpine AS release

ENV NODE_ENV=production

WORKDIR /repo

COPY package.json package-lock.json .npmrc ./
COPY src/filesystem/package.json src/filesystem/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/filesystem --omit=dev --ignore-scripts

COPY --from=builder /repo/src/filesystem/dist src/filesystem/dist

WORKDIR /repo/src/filesystem

# The allowed directories are the run arguments (`/projects` in the README).
ENTRYPOINT ["node", "dist/index.js"]
