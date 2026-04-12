#!/bin/bash
set -e

# 1. Run migrations
echo "Running database migrations..."
python3 -m alembic upgrade head

# 2. Initial data
echo "Initializing database data..."
python3 -m app.initial_data

# 3. Start the application (exec the command passed from docker-compose)
echo "Starting application..."
exec "$@"
