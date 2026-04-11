FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Устанавливаем только необходимые системные библиотеки для PostgreSQL и OpenCV
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc libpq-dev curl docker.io \
       libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

COPY . /app/

RUN chmod +x prestart.sh

CMD ["/bin/bash", "-c", "./prestart.sh && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
