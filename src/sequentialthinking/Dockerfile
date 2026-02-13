# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1: Builder - Compile TypeScript
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./

# Install ALL dependencies (including dev for TypeScript)
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npx tsc && npx shx chmod +x dist/*.js

# =============================================================================
# Stage 2: Production - Minimal runtime image
# =============================================================================
FROM node:22-alpine AS release

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy only the built artifacts and needed files
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Install production dependencies only
RUN npm install --ignore-scripts --omit=dev && \
    npm cache clean --force

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)"

# Run the application
ENTRYPOINT ["node", "dist/index.js"]
