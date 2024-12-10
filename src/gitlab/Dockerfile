FROM node:22.12-alpine as builder

COPY src/gitlab /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

FROM node:22-alpine AS release

COPY --from=builder /app/dist /app

ENV NODE_ENV=production

WORKDIR /app

CMD ["node", "dist/index.js"]