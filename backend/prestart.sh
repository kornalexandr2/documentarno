#!/bin/bash
set -e

# Wait for a bit to ensure DB is ready
sleep 5

echo "--- Starting Prestart Script ---"

echo "1. Running migrations..."
python3 -m alembic upgrade head

echo "2. Initializing data..."
python3 -m app.initial_data

echo "3. Execution complete. Starting application..."
exec "$@"
