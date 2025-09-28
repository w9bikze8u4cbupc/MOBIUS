FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache curl

# Copy the main package.json from root directory for dependencies
COPY ../../package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001 || exit 1

# Start the API server
CMD ["node", "index.js"]