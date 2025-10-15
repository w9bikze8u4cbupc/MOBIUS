# Dockerfile for Mobius Tutorial Generator Rendering Pipeline
FROM node:18-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create directories for input/output
RUN mkdir -p /app/assets /app/out

# Expose port (if needed for any web services)
EXPOSE 3000

# Default command
CMD ["node", "scripts/render.js", "--help"]