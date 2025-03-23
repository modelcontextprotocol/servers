FROM node:22.12-alpine AS builder

# Must be entire project because `prepare` script is run during `npm install` and requires all files.
COPY src/github /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

FROM node:22.12-alpine AS release

# Install GitHub CLI
RUN apk add --no-cache curl git bash && \
    curl -Ls https://github.com/cli/cli/releases/download/v2.44.1/gh_2.44.1_linux_amd64.tar.gz | tar -xz -C /tmp && \
    mv /tmp/gh_*_linux_amd64/bin/gh /usr/local/bin/ && \
    rm -rf /tmp/gh_*_linux_amd64

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

WORKDIR /app

RUN npm ci --ignore-scripts --omit-dev

ENTRYPOINT ["node", "dist/index.js"]