#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="ai-usage-monitor:smoke-local"
CONTAINER_NAME="ai-usage-monitor-smoke"
PORT="3901"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "Building production image..."
docker build --build-arg GIT_COMMIT_SHA="$(git rev-parse --short HEAD)" -t "$IMAGE_TAG" .

echo "Starting production container..."
docker run -d --name "$CONTAINER_NAME" -p "$PORT:3001" "$IMAGE_TAG" >/dev/null

echo "Waiting for health endpoint..."
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done

echo "Verifying core endpoints..."
curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null
curl -fsS "http://127.0.0.1:${PORT}/version" >/dev/null
curl -fsS "http://127.0.0.1:${PORT}/api/auth/status" >/dev/null

echo "Production smoke check passed."
