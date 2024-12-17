FROM node:22.12-alpine as builder

# Must be entire project because `prepare` script is run during `npm install` and requires all files.
COPY src/google-maps /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22-alpine AS release

COPY --from=builder /app/dist /app
COPY --from=builder /app/node_modules /app/node_modules

ENV NODE_ENV=production

WORKDIR /app

CMD ["node", "dist/index.js"]