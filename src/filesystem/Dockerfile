FROM node:22.12-alpine as builder

WORKDIR /app

COPY src/filesystem /app
COPY tsconfig.json /tsconfig.json

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev


FROM node:22-alpine AS release

COPY --from=builder /app/dist /app
COPY --from=builder /app/node_modules /app/node_modules
ENV NODE_ENV=production

WORKDIR /app

CMD ["node", "dist/index.js"]