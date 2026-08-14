import asyncio
import logging
from functools import lru_cache

from sentence_transformers import SentenceTransformer

from app.services.code_parser import CodeChunk

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"

ENCODE_BATCH_SIZE = 16
OUTER_BATCH_SIZE = 100
BATCH_DELAY_SECONDS = 0.1


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    """Load the embedding model once, only when an embedding is requested."""
    logger.info("Loading embedding model: %s", MODEL_NAME)
    return SentenceTransformer(MODEL_NAME)


async def embed_chunks(chunks: list[CodeChunk]) -> list[list[float]]:
    """Encode code chunks into embedding vectors."""
    total = len(chunks)
    embeddings: list[list[float]] = []

    for start in range(0, total, OUTER_BATCH_SIZE):
        batch = chunks[start : start + OUTER_BATCH_SIZE]
        texts = [c.content for c in batch]

        model = get_model()

        batch_embeddings = await asyncio.to_thread(
            model.encode,
            texts,
            batch_size=ENCODE_BATCH_SIZE,
            show_progress_bar=False,
        )

        embeddings.extend(vector.tolist() for vector in batch_embeddings)

        processed = min(start + OUTER_BATCH_SIZE, total)
        logger.info("embedded %d/%d chunks", processed, total)

        if processed < total:
            await asyncio.sleep(BATCH_DELAY_SECONDS)

    return embeddings


async def embed_query(query: str) -> list[float]:
    """Embed a search query using the same model as code chunks."""
    model = get_model()

    embeddings = await asyncio.to_thread(
        model.encode,
        [query],
        show_progress_bar=False,
    )

    return embeddings[0].tolist()