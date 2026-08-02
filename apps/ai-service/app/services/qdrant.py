from qdrant_client import AsyncQdrantClient

from app.config import settings

_client: AsyncQdrantClient | None = None


def get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=settings.qdrant_url)
    return _client


async def check_qdrant_connection() -> bool:
    try:
        client = get_client()
        await client.get_collections()
        return True
    except Exception:
        return False


async def close_qdrant_connection() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
