import json
import logging
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

async def emit_event(event_name: str, payload: dict):
    """
    Publishes an event to the Redis event bus.
    Subscribers (like the Telegram Bot) can listen to this channel.
    """
    try:
        message = json.dumps({"event": event_name, "payload": payload})
        await redis_client.publish("documentarno_events", message)
        logger.info(f"Emitted event {event_name}")
    except Exception as e:
        logger.error(f"Failed to emit event {event_name}: {e}")

# Synchronous version for Celery workers
def emit_event_sync(event_name: str, payload: dict):
    import redis
    import os
    r = None
    try:
        host = os.getenv("REDIS_HOST", "redis")
        port = os.getenv("REDIS_PORT", "6379")
        r = redis.Redis(host=host, port=port, db=0)
        message = json.dumps({"event": event_name, "payload": payload})
        r.publish("documentarno_events", message)
    except Exception as e:
        logger.error(f"Failed to emit sync event {event_name}: {e}")
    finally:
        if r is not None:
            r.close()
