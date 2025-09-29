FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install production dependencies with npm ci for faster, reliable builds
RUN npm ci --only=production

# Copy application sources
COPY . .

# Create a non-root user for good practice
RUN addgroup -S app && adduser -S app -G app
USER app

ENV PORT=5001
EXPOSE 5001

# Use a simple entrypoint for CI / smoke tests
CMD ["node", "index.js"]