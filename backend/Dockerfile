# ============================================
# SKYN3T ACCESS CONTROL - MAIN BACKEND DOCKERFILE
# ============================================

# Multi-stage build for production optimization
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ============================================
# PRODUCTION STAGE
# ============================================
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk update && apk add --no-cache \
    dumb-init \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Copy database files
COPY --chown=nodejs:nodejs src/database/ ./database/

# Create logs directory
RUN mkdir -p /var/log/skyn3t && chown nodejs:nodejs /var/log/skyn3t

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server.js"]