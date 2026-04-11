#!/bin/bash

set -e



echo "======================================"

echo " Documentarno Installation Script"

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



# 1. Check for Docker

if ! command -v docker &> /dev/null; then

    echo "[!] Docker is not installed. Please install Docker first."

    exit 1

fi



# 2. Check for .env file

if [ ! -f .env ]; then

    echo "[-] .env file not found. Creating from .env.example..."

    if [ -f .env.example ]; then

        cp .env.example .env

        echo "[+] .env created. Please update it with your actual settings."

        echo "Please adjust settings like POSTGRES_PASSWORD, JWT_SECRET, and DOC_SOURCE_PATH."

        read -p "Press Enter when you have updated the .env file to continue..."

    else

        echo "[!] .env.example not found! Cannot create .env."

        exit 1

    fi

fi



# 3. Create necessary directories for volumes

echo "[-] Ensuring volume directories exist..."

mkdir -p ./data/postgres

mkdir -p ./data/redis

mkdir -p ./data/qdrant

mkdir -p ./data/ollama/models

mkdir -p ./doc_source

echo "[+] Volume directories ready."



# 4. Check for GPU (NVIDIA) and Handle CPU Fallback

echo "[-] Checking for NVIDIA GPU..."

HAS_GPU=false

if command -v nvidia-smi &> /dev/null; then

    echo "[+] NVIDIA GPU detected."

    HAS_GPU=true

else

    echo "[WARNING] Р’РёРґРµРѕРєР°СЂС‚Р° NVIDIA РЅРµ РѕР±РЅР°СЂСѓР¶РµРЅР°! РЎРёСЃС‚РµРјР° Р±СѓРґРµС‚ СЂР°Р±РѕС‚Р°С‚СЊ РІ СЂРµР¶РёРјРµ CPU."

    echo "[WARNING] РРЅС„РµСЂРµРЅСЃ LLM Рё СЂР°СЃРїРѕР·РЅР°РІР°РЅРёРµ (OCR) Р±СѓРґСѓС‚ СЂР°Р±РѕС‚Р°С‚СЊ РјРµРґР»РµРЅРЅРѕ."

fi



# Remove GPU deploy configurations from docker-compose.yml for CPU-only systems

if [ "$HAS_GPU" = false ]; then

    echo "[-] Removing GPU reservations from docker-compose.yml for CPU mode..."



    # Check if PyYAML is available, install if needed

    if ! python3 -c "import yaml" 2>/dev/null; then

        echo "[-] Installing PyYAML for docker-compose.yml modification..."

        pip3 install pyyaml 2>/dev/null || pip install pyyaml 2>/dev/null || {

            echo "[ERROR] Cannot install PyYAML automatically."

            echo "[ERROR] Please install it manually: pip3 install pyyaml"

            exit 1

        }

    fi



    python3 -c "

import yaml

import sys



try:

    with open('docker-compose.yml', 'r') as f:

        config = yaml.safe_load(f)



    services = config.get('services', {})



    # Remove GPU from ollama

    if 'ollama' in services and 'deploy' in services['ollama']:

        del services['ollama']['deploy']



    # Remove GPU from celery_worker

    if 'celery_worker' in services and 'deploy' in services['celery_worker']:

        del services['celery_worker']['deploy']



    with open('docker-compose.yml', 'w') as f:

        yaml.dump(config, f, default_flow_style=False, sort_keys=False)



    print('[+] GPU reservations removed from docker-compose.yml')

except Exception as e:

    print(f'[ERROR] Failed to modify docker-compose.yml: {e}')

    sys.exit(1)

"

fi



# 5. Pull and build containers

echo "[-] Building and pulling containers..."

$COMPOSE_CMD build --pull



# 6. Start DB and cache first, wait for health

echo "[-] Starting Database and cache services..."

$COMPOSE_CMD up -d postgres redis qdrant



echo "[-] Waiting for PostgreSQL to be healthy..."

# Poll health status instead of fixed sleep

for i in $(seq 1 60); do

    if $COMPOSE_CMD ps postgres | grep -q "healthy"; then

        echo "[+] PostgreSQL is healthy."

        break

    fi

    if [ $i -eq 60 ]; then

        echo "[ERROR] PostgreSQL did not become healthy in 60 seconds."

        exit 1

    fi

    sleep 2

done



echo "[-] Waiting for Redis to be healthy..."

for i in $(seq 1 30); do

    if $COMPOSE_CMD ps redis | grep -q "healthy"; then

        echo "[+] Redis is healthy."

        break

    fi

    if [ $i -eq 30 ]; then

        echo "[ERROR] Redis did not become healthy in 30 seconds."

        exit 1

    fi

    sleep 2

done



echo "[-] Waiting for Qdrant to be healthy..."

for i in $(seq 1 30); do

    if $COMPOSE_CMD ps qdrant | grep -q "healthy"; then

        echo "[+] Qdrant is healthy."

        break

    fi

    if [ $i -eq 30 ]; then

        echo "[WARNING] Qdrant healthcheck may still be initializing."

        break

    fi

    sleep 2

done



# 7. Start the rest of the application

echo "[-] Starting the rest of the application..."

$COMPOSE_CMD up -d



echo "======================================"

echo " Installation Complete!"

echo " Frontend: http://localhost:8080"

echo " API Docs: http://localhost:8080/api/docs"

echo "======================================"