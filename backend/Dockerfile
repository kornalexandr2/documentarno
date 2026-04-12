# Use official NVIDIA CUDA image with CuDNN for GPU support
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Install Python 3.10, Docker CLI and dos2unix
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    python3-dev \
    gcc \
    libpq-dev \
    curl \
    docker.io \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

# Set python3.10 as default python
RUN ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

# Copy application code
COPY . /app/

# CRITICAL: Convert line endings and set permissions
RUN dos2unix prestart.sh && sed -i 's/\r$//' prestart.sh && chmod +x prestart.sh

# Entrypoint runs the script, which then executes whatever CMD is passed
ENTRYPOINT ["/app/prestart.sh"]
