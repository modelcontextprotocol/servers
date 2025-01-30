FROM node:22.12-alpine AS builder

COPY src/gdrive /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22-alpine AS release

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY src/gdrive/replace_open.sh /replace_open.sh

ENV NODE_ENV=production

RUN npm ci --ignore-scripts --omit-dev

RUN sh /replace_open.sh

RUN rm /replace_open.sh

ENTRYPOINT ["node", "dist/index.js"]