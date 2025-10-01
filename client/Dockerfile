# Use Node.js 20 LTS as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Build the React app
RUN npm run build

# Install serve to run the production build
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Run as non-root user for security
RUN useradd -m -u 1001 mobius && \
    chown -R mobius:mobius /app
USER mobius

# Start the application
CMD ["serve", "-s", "build", "-l", "3000"]
