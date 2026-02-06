# Build stage for frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy workspace configuration
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy shared package first (frontend depends on it)
COPY shared/ ./shared/

# Copy and build frontend
COPY frontend/ ./frontend/
RUN npm run build -w frontend

# Backend preparation stage (generates version file)
FROM node:24-alpine AS backend-prep

ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci

# Copy shared package first (backend depends on it)
COPY shared/ ./shared/

# Copy backend and generate version
COPY backend/ ./backend/
RUN npm run generate-version -w backend

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy workspace configuration and install production deps
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
RUN npm ci --production

# Copy shared package source
COPY shared/src ./shared/src

# Copy backend source (with generated version.ts)
COPY --from=backend-prep /app/backend/src ./backend/src
COPY --from=backend-prep /app/backend/scripts ./backend/scripts

# Copy frontend build to serve static files
COPY --from=frontend-builder /app/frontend/dist ./backend/frontend-dist

# Create data directory
RUN mkdir -p data

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "backend"]
