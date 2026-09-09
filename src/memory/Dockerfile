FROM node:22.12-alpine AS builder

COPY src/memory /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22-alpine AS release

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

WORKDIR /app

RUN npm ci --ignore-scripts --omit-dev

# Without MEMORY_FILE_PATH set, the server persists its knowledge graph next
# to its own compiled entrypoint (dist/memory.jsonl) — dist was just copied in
# as root, so the app user needs ownership of it before it can create/update
# that file, including when a named volume (see README) mounts over dist/.
RUN chown -R node:node /app/dist

USER node

ENTRYPOINT ["node", "dist/index.js"]