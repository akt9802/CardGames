#!/usr/bin/env bash
set -euo pipefail

# Run from the CardGames tree on the box:
#   /home/alok-aman/games/CardGames
# Nginx vhost: nginx/games → /etc/nginx/sites-available/games
# (games.zakarias.in → 127.0.0.1:3010; do not bind 3001 — FinSense uses it)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

COMPOSE_FILE="$ROOT/docker-compose.yml"
ENV_FILE="$ROOT/.env"

echo "[deploy] Root: $ROOT"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[deploy] ERROR: docker-compose.yml not found at $COMPOSE_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy] ERROR: .env not found at $ENV_FILE — copy .env.example and fill SMTP / PUBLIC_URL."
  exit 1
fi

if [[ -d "$ROOT/.git" ]]; then
  echo "[deploy] Pulling latest..."
  git pull --ff-only
else
  echo "[deploy] WARN: not a git repo. Skipping pull."
fi

mkdir -p "$ROOT/server/data"

wait_for_service_health() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local started_at
  started_at="$(date +%s)"
  while true; do
    local container_id
    container_id="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$service")"
    if [[ -n "$container_id" ]]; then
      local health
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$health" == "healthy" || "$health" == "running" ]]; then
        echo "[deploy] $service is $health."
        return 0
      fi
      if [[ "$health" == "unhealthy" || "$health" == "exited" || "$health" == "dead" ]]; then
        echo "[deploy] ERROR: $service entered unhealthy state: $health"
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail 80 "$service" || true
        return 1
      fi
    fi
    local now
    now="$(date +%s)"
    if (( now - started_at >= timeout_seconds )); then
      echo "[deploy] ERROR: Timed out waiting for $service health."
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail 80 "$service" || true
      return 1
    fi
    sleep 3
  done
}

echo "[deploy] Building image (old container keeps serving until recreate)..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build

echo "[deploy] Recreating baithak..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[deploy] Waiting for health..."
wait_for_service_health baithak 240

echo "[deploy] Status:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "[deploy] Done."
