# The `everything` server's container image (#3309). Build it from the
# repository root, which is the build context:
#
#   docker build -f src/everything/Dockerfile -t mcp/everything .
#
# `everything` is an npm workspace, so its lockfile and the `overrides` that pin
# its transitive dependencies live in the root package.json and
# package-lock.json, not in src/everything. Both stages install from them with
# `npm ci`, so the image gets exactly the versions this repository tested,
# rather than whatever a lockfile-less `npm install` resolves on the day.
# Dockerfile.dockerignore (next to this file) keeps the context to what the
# build reads.
#
# The image runs the server over stdio by default (`docker run -i`); give the
# transport name as the argument to run another, e.g. `streamableHttp`, which
# listens on PORT (3001) on every interface so a published port reaches it.
# The README's "Running with Docker" section has both commands. This repository
# publishes no image: `mcp/everything` on Docker Hub is built by Docker.

FROM node:24-alpine AS builder

WORKDIR /repo

# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json package-lock.json .npmrc tsconfig.json ./
COPY src/everything/package.json src/everything/

# `--ignore-scripts` skips the workspace's `prepare` build, which needs the
# source; the build runs explicitly below.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/everything --ignore-scripts

COPY src/everything src/everything
RUN npm run build --workspace src/everything


FROM node:24-alpine AS release

ENV NODE_ENV=production

WORKDIR /repo

COPY package.json package-lock.json .npmrc ./
COPY src/everything/package.json src/everything/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace src/everything --omit=dev --ignore-scripts

COPY --from=builder /repo/src/everything/dist src/everything/dist

WORKDIR /repo/src/everything

USER node

# The Streamable HTTP (and deprecated HTTP+SSE) transports' default port.
ENV PORT=3001
EXPOSE 3001

# Both transports close cleanly on SIGINT; node running as PID 1 would ignore
# the default SIGTERM, leaving `docker stop` to wait out its timeout.
STOPSIGNAL SIGINT

ENTRYPOINT ["node", "dist/index.js"]
CMD ["stdio"]
