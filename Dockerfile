# Multi-stage build for production efficiency
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with SSL handling for CI environments
RUN npm config set strict-ssl false && \
    npm ci --only=production && \
    npm config set strict-ssl true

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install system dependencies needed for the app
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/cache/apk/*

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001

# Copy dependencies from builder stage
COPY --from=builder --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --chown=nodeapp:nodejs . .

# Create required directories
RUN mkdir -p uploads tmp artifacts && \
    chown -R nodeapp:nodejs uploads tmp artifacts

# Expose the port
EXPOSE 5001

# Health check (simplified for CI environments)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/ || exit 1

# Switch to non-root user
USER nodeapp

# Start the application
CMD ["node", "src/api/index.js"]