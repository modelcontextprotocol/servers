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
# Two things differ from that image, both to keep existing setups working:
#
# - The server stays reachable at /app. The README stores the graph in a named
#   volume mounted over /app/dist, which is where the default memory file
#   lives (next to dist/index.js), so /app is a symlink to the workspace
#   directory and that mount still lands on the server's dist.
# - It still runs as root. A volume an earlier image created holds a graph
#   owned by root, which a non-root server could read but not save. The switch
#   is decided with the other images in #4741.

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

COPY --from=builder /repo/src/memory/dist src/memory/dist

RUN ln -s /repo/src/memory /app

WORKDIR /app

ENTRYPOINT ["node", "dist/index.js"]
