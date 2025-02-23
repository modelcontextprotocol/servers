FROM node:22.12-alpine AS builder

# 复制项目文件
COPY src/gitee /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

# 安装依赖并构建
RUN --mount=type=cache,target=/root/.npm npm install

FROM node:22.12-alpine AS release

# 从构建阶段复制必要文件
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

WORKDIR /app

# 安装生产依赖
RUN npm ci --ignore-scripts --omit=dev

ENTRYPOINT ["node", "dist/bin.js"]
