# Build stage for frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci

# Copy and build frontend
COPY frontend/ ./frontend/
RUN npm run build -w frontend

# Backend preparation stage (generates version file)
FROM node:24-alpine AS backend-prep

ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm ci

# Copy backend and generate version
COPY backend/ ./backend/
RUN npm run generate-version -w backend

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy workspace configuration and install production deps
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --production

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
