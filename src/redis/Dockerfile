FROM node:22.12-alpine as builder

COPY src/redis /app

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN npm run build

FROM node:22-alpine AS release

COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

WORKDIR /app

RUN npm ci --ignore-scripts --omit-dev

ENTRYPOINT ["node", "build/index.js"]