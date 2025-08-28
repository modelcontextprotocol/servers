FROM node:22.12-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY index.ts ./

RUN echo '{ "compilerOptions": { "target": "ES2022", "module": "Node16", "moduleResolution": "Node16", "strict": true, "esModuleInterop": true, "skipLibCheck": true, "forceConsistentCasingInFileNames": true, "resolveJsonModule": true, "outDir": "./dist", "rootDir": "." }, "include": ["./**/*.ts"], "exclude": ["node_modules"] }' > tsconfig.json

RUN npm install --only=dev

RUN npm run build

FROM node:22-alpine AS release

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm ci --omit=dev --ignore-scripts

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV PORT=3000
ENV MEMORY_FILE_PATH=/data/memory.json

RUN mkdir -p /data

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]