FROM node:20

# Create non-root user
RUN groupadd -g 1001 -r nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create uploads directory and set permissions
RUN mkdir -p uploads/MobiusGames && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Start the application
CMD ["npm", "start"]