import redis.asyncio as redis

from app.config import settings

_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def check_redis_connection() -> bool:
    try:
        client = get_client()
        return await client.ping()
    except Exception:
        return False


async def close_redis_connection() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
