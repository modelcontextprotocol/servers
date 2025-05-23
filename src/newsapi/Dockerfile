# Stage 1: Build the TypeScript project
FROM node:22.12-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json tsconfig.json ./
RUN npm install

# Copy source code
COPY . ./

# Build the TypeScript project
RUN npm run build

# Stage 2: Create a lightweight production image
FROM node:22-alpine AS release

# Set working directory
WORKDIR /app

# Copy built app and necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Set environment to production
ENV NODE_ENV=production

# Install production dependencies only
RUN npm ci --ignore-scripts --omit=dev

# Start the app
ENTRYPOINT ["node", "dist/index.js"]
