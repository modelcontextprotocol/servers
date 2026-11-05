FROM node:24-alpine AS builder

WORKDIR /app

COPY src/filesystem /app
COPY tsconfig.json /tsconfig.json

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev


FROM node:24-alpine AS release

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

RUN npm ci --ignore-scripts --omit-dev

# Run as the base image's unprivileged `node` user (UID 1000), not root
# (#4741), so the image passes `runAsNonRoot` admission policies and files
# it writes into a bind mount are not root-owned on the host.
# It is named by number because Kubernetes cannot verify that a named user is
# not root, and refuses to start the container under `runAsNonRoot`.
USER 1000:1000

ENTRYPOINT ["node", "/app/dist/index.js"]
