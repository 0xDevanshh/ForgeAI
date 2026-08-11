import logging
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, status

from app.services.redis_client import get_client

logger = logging.getLogger(__name__)


def rate_limiter(max_requests: int, window_seconds: int) -> Callable[[Request], Awaitable[None]]:
    """Returns a FastAPI dependency enforcing `max_requests` per
    `window_seconds`, keyed by the caller's IP — a plain Redis INCR+EXPIRE
    counter (INCR, then EXPIRE only on the first hit in a window), the same
    pattern node-backend's own per-resource rate limits use, rather than
    pulling in a separate rate-limiting library for this.
    """

    async def _dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{request.url.path}:{client_ip}"

        client = get_client()
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, window_seconds)

        if count > max_requests:
            logger.warning(
                "Rate limit exceeded: path=%s client_ip=%s count=%d", request.url.path, client_ip, count
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, please try again later",
            )

    return _dependency
