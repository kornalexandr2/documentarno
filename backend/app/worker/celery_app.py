from celery import Celery
import os

redis_url = f"redis://{os.getenv('REDIS_HOST', 'redis')}:{os.getenv('REDIS_PORT', '6379')}/0"

celery_app = Celery(
    "doc_worker",
    broker=redis_url,
    backend=redis_url,
    include=['app.worker.tasks']
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    'collect-metrics-every-minute': {
        'task': 'app.worker.tasks.collect_system_metrics',
        'schedule': 60.0, # Every 60 seconds
    },
}

