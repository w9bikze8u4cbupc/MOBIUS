# Use Node.js 20 LTS as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip optional dependencies to avoid build issues)
RUN npm install --omit=dev --ignore-scripts

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/MobiusGames uploads/images uploads/pages

# Expose port
EXPOSE 5001

# Add health check using node instead of wget
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]