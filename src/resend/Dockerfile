FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package*.json ./

RUN npm install --production

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"] 