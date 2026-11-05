# The `sequentialthinking` server's container image (#5345). Build it from the
# repository root, which is the build context:
#
#   docker build -f src/sequentialthinking/Dockerfile -t mcp/sequentialthinking .
#
# `sequentialthinking` is an npm workspace, so its lockfile and the `overrides`
# that pin its transitive dependencies live in the root package.json and
# package-lock.json, not in src/sequentialthinking. Both stages install from
# them with `npm ci`, so the image gets exactly the versions this repository
# tested, rather than whatever a lockfile-less `npm install` resolves on the
# day. Dockerfile.dockerignore (next to this file) keeps the context to what
# the build reads. The shape is src/everything/Dockerfile's (#3309).
#
# The server keeps no state on disk, so it runs as the base image's `node`
# user rather than root.

FROM node:24-alpine AS builder

WORKDIR /repo

# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json package-lock.json .npmrc tsconfig.json ./
COPY src/sequentialthinking/package.json src/sequentialthinking/

# `--ignore-scripts` skips the workspace's `prepare` build, which needs the
# source; the build runs explicitly below.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/sequentialthinking --ignore-scripts

COPY src/sequentialthinking src/sequentialthinking
RUN npm run build --workspace src/sequentialthinking


FROM node:24-alpine AS release

ENV NODE_ENV=production

WORKDIR /repo

COPY package.json package-lock.json .npmrc ./
COPY src/sequentialthinking/package.json src/sequentialthinking/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/sequentialthinking --omit=dev --ignore-scripts

COPY --from=builder /repo/src/sequentialthinking/dist src/sequentialthinking/dist

WORKDIR /repo/src/sequentialthinking

# Run as the base image's unprivileged `node` user (UID 1000), not root
# (#4741), so the image passes `runAsNonRoot` admission policies.
# It is named by number because Kubernetes cannot verify that a named user is
# not root, and refuses to start the container under `runAsNonRoot`.
USER 1000:1000

ENTRYPOINT ["node", "dist/index.js"]
