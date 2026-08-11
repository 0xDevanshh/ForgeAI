import logging

from pydantic import BaseModel

from app.services.embedder import embed_query
from app.services.qdrant import get_client
from app.services.vector_store import collection_name

logger = logging.getLogger(__name__)

DEFAULT_TOP_K = 8

# Below this cosine similarity, a match is noise rather than signal — better
# to return fewer chunks than pad the LLM's context with irrelevant ones.
MIN_SIMILARITY_SCORE = 0.3


class RetrievedChunk(BaseModel):
    content: str
    file_path: str
    chunk_type: str
    name: str | None
    start_line: int
    end_line: int
    score: float


async def search_codebase(repo_id: str, query: str, top_k: int = DEFAULT_TOP_K) -> list[RetrievedChunk]:
    """Finds the chunks in `repo_id`'s indexed codebase most semantically
    relevant to `query`, for grounding an agent's answer.

    Embeds `query` with the same model used at indexing time (see
    app/services/embedder.py), then does a cosine-similarity search against
    the repo's Qdrant collection, dropping any match below
    MIN_SIMILARITY_SCORE.
    """
    client = get_client()
    name = collection_name(repo_id)

    if not await client.collection_exists(name):
        logger.warning("search_codebase called for unindexed repo: repo_id=%s", repo_id)
        return []

    query_vector = await embed_query(query)

    results = await client.search(
        collection_name=name,
        query_vector=query_vector,
        limit=top_k,
        score_threshold=MIN_SIMILARITY_SCORE,
        with_payload=True,
    )

    chunks = []
    for point in results:
        # with_payload=True above guarantees this is populated — every
        # point we ever upsert (see vector_store.upsert_chunks) carries one.
        payload = point.payload or {}
        chunks.append(
            RetrievedChunk(
                content=payload["content"],
                file_path=payload["file_path"],
                chunk_type=payload["chunk_type"],
                name=payload["name"],
                start_line=payload["start_line"],
                end_line=payload["end_line"],
                score=point.score,
            )
        )
    return chunks
