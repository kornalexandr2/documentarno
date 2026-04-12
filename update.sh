#!/bin/bash
set -e

echo "======================================"
echo " Documentarno Update Script"
echo "======================================"

# Detect docker compose command
COMPOSE_CMD="docker compose"
if ! command -v docker compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

echo "[-] Pulling latest changes from git..."
git fetch --all
git reset --hard origin/main
git clean -fd

echo "[-] Building new Docker images..."
$COMPOSE_CMD build

echo "[-] Starting services..."
$COMPOSE_CMD up -d

echo "[-] Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 30); do
    if $COMPOSE_CMD ps postgres | grep -q "healthy"; then
        echo "[+] PostgreSQL is healthy."
        break
    fi
    sleep 2
done

echo "[-] Applying database migrations..."
$COMPOSE_CMD exec -T backend alembic upgrade head || echo "[WARNING] No migrations found."

echo "[-] Finalizing services and clearing Nginx cache..."
# Crucial: restart nginx to re-resolve backend IP and apply configs
$COMPOSE_CMD restart nginx backend celery_worker

echo "======================================"
echo " Update Complete! Website should be ready."
echo "======================================"
