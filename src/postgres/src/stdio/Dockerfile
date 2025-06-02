# docker/stdio/Dockerfile
FROM node:22.12-alpine AS builder

# Copy source files
COPY . /app
COPY tsconfig.json /tsconfig.json
WORKDIR /app

# Install dependencies and build
RUN --mount=type=cache,target=/root/.npm npm install
RUN npm run build

RUN apk add wget
# Production dependencies
RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit=dev

FROM node:22-alpine AS release

# Copy built application
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies
RUN npm ci --ignore-scripts --omit=dev

ENTRYPOINT ["node", "dist/src/stdioIndex.js"]
