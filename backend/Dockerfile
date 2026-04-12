# Use official NVIDIA CUDA image with CuDNN for GPU support
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Install Python and Docker CLI
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
    && rm -rf /var/lib/apt/lists/*

# Set python3 as default python
RUN ln -s /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

# Copy application code
COPY . /app/

# Ensure prestart is executable
RUN chmod +x prestart.sh

# The command is overridden in docker-compose.yml
CMD ["./prestart.sh"]
