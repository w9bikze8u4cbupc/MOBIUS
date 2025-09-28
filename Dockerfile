FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create uploads directory
RUN mkdir -p src/api/uploads

# Expose port
EXPOSE 5001

# Start the application
CMD ["node", "src/api/index.js"]