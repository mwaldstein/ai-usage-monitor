# Build stage for frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Backend preparation stage (generates version file)
FROM node:24-alpine AS backend-prep

# Accept git commit SHA as build argument
ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN node --experimental-strip-types scripts/generate-version.ts

# Production stage
FROM node:24-alpine

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm ci --production

# Copy backend source code (with generated version.ts)
COPY --from=backend-prep /app/backend/src ./src
COPY --from=backend-prep /app/backend/scripts ./scripts

# Copy frontend build to serve static files
COPY --from=frontend-builder /app/frontend/dist ./frontend-dist

# Create data directory
RUN mkdir -p data

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "--experimental-strip-types", "src/index.ts"]
