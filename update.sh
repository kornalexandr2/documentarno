#!/bin/bash
set -e

echo "======================================"
echo " Documentarno Update Script"
echo "======================================"

# Detect docker compose command (v1 or v2)
COMPOSE_CMD=""
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    echo "[+] Using 'docker compose' (v2)"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    echo "[+] Using 'docker-compose' (v1)"
else
    echo "[!] Docker Compose is not installed."
    exit 1
fi

echo "[-] Pulling latest changes from git..."
# Hard reset to origin/main to ensure clean state as requested
git fetch --all
git reset --hard origin/main
git clean -fd

echo "[-] Building new Docker images..."
$COMPOSE_CMD build

echo "[-] Starting database services for migrations..."
$COMPOSE_CMD up -d postgres redis qdrant

echo "[-] Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 60); do
    if $COMPOSE_CMD ps postgres | grep -q "healthy"; then
        echo "[+] PostgreSQL is healthy."
        break
    fi
    sleep 2
done

echo "[-] Applying database migrations..."
$COMPOSE_CMD up -d backend
sleep 10
$COMPOSE_CMD exec -T backend alembic upgrade head || echo "[WARNING] No migrations found or Alembic not configured yet."

echo "[-] Restarting all services..."
$COMPOSE_CMD up -d

echo "======================================"
echo " Update Complete!"
echo "======================================"
