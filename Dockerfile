# Simplified Dockerfile for API smoke testing
FROM node:20-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (not just production)
RUN npm ci --ignore-scripts

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create necessary directories
RUN mkdir -p /app/uploads/MobiusGames /app/uploads/pages /app/uploads/images

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the API server
CMD ["node", "src/api/index.js"]