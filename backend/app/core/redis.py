import os
import redis.asyncio as redis

def get_redis_url() -> str:
    host = os.getenv("REDIS_HOST", "redis")
    port = os.getenv("REDIS_PORT", "6379")
    return f"redis://{host}:{port}/0"

redis_client = redis.from_url(get_redis_url(), decode_responses=True)

async def get_redis():
    return redis_client
