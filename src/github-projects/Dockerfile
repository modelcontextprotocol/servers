FROM node:20-slim

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Expose port if needed for future extensions
# EXPOSE 3000

# Environment variables
ENV NODE_ENV=production

# Run the server
CMD ["node", "dist/index.js"] 