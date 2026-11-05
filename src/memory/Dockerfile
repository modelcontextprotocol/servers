FROM node:24-alpine AS builder

COPY src/memory /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:24-alpine AS release

# The default memory.jsonl, its lock and its temporary save files live in
# /app/dist (the README mounts a named volume there), so the `node` user the
# server runs as must own it. A new named volume takes this ownership from the
# image when it is first mounted.
COPY --from=builder --chown=node:node /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

WORKDIR /app

RUN npm ci --ignore-scripts --omit-dev

# Run as the base image's unprivileged `node` user (UID 1000), not root
# (#4741), so the image passes `runAsNonRoot` admission policies.
USER node

ENTRYPOINT ["node", "dist/index.js"]
