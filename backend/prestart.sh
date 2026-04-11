#!/bin/bash

set -e



# Run migrations

echo "Running database migrations..."

alembic upgrade head



# Initialize initial data

echo "Initializing database data..."

python -m app.initial_data



# Initialize Qdrant Collection

echo "Initializing Qdrant Collection..."

python -m app.core.qdrant

