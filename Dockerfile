# Build stage for frontend assets only
FROM node:24-alpine AS frontend-builder

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy workspace configuration for frontend/shared only
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install frontend build dependencies without backend workspace deps
RUN npm ci --workspace frontend --workspace shared

# Copy frontend sources and build
COPY shared/ ./shared/
COPY frontend/ ./frontend/
RUN npm run build -w frontend

# Generate backend version file without installing dependencies
FROM node:24-alpine AS backend-prep

ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

WORKDIR /app

COPY backend/package*.json ./backend/
COPY backend/scripts ./backend/scripts
COPY backend/src ./backend/src
RUN node --experimental-strip-types backend/scripts/generate-version.ts

# Build runtime dependencies (includes native sqlite bindings)
FROM node:24-alpine AS runtime-deps

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apk add --no-cache python3 make g++ gcc

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
RUN npm ci --omit=dev --workspace backend --workspace shared

# Production stage (minimal runtime image)
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
COPY --from=runtime-deps /app/node_modules ./node_modules

COPY shared/src ./shared/src
COPY --from=backend-prep /app/backend/src ./backend/src
COPY --from=backend-prep /app/backend/scripts ./backend/scripts
COPY --from=frontend-builder /app/frontend/dist ./backend/frontend-dist

RUN mkdir -p data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "backend"]
