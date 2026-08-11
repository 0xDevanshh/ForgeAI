import asyncio
import logging

from sentence_transformers import SentenceTransformer

from app.services.code_parser import CodeChunk

logger = logging.getLogger(__name__)

# Loaded once at import time (service startup), not per-request/per-chunk —
# loading a model means a disk read + memory allocation, which would be
# wasteful (and slow) to repeat on every call.
model = SentenceTransformer("all-MiniLM-L6-v2")

ENCODE_BATCH_SIZE = 32
OUTER_BATCH_SIZE = 200
BATCH_DELAY_SECONDS = 0.1


async def embed_chunks(chunks: list[CodeChunk]) -> list[list[float]]:
    """Encodes each chunk's content into an embedding vector, in the same
    order as `chunks`.

    Chunks are processed in outer batches of OUTER_BATCH_SIZE (each itself
    batch-encoded internally at ENCODE_BATCH_SIZE by SentenceTransformer,
    which is what actually makes this fast) rather than one call across
    every chunk, for two reasons: progress can be logged incrementally —
    this feeds into the progress % reported back to Node for large repos —
    and each model.encode() call (CPU-bound and blocking) runs via
    asyncio.to_thread so it doesn't freeze the event loop for the whole
    job's duration; the delay between batches is a real await point too,
    giving other requests a chance to run in between.
    """
    total = len(chunks)
    embeddings: list[list[float]] = []

    for start in range(0, total, OUTER_BATCH_SIZE):
        batch = chunks[start : start + OUTER_BATCH_SIZE]
        texts = [c.content for c in batch]

        batch_embeddings = await asyncio.to_thread(
            model.encode, texts, batch_size=ENCODE_BATCH_SIZE, show_progress_bar=False
        )
        embeddings.extend(vector.tolist() for vector in batch_embeddings)

        processed = min(start + OUTER_BATCH_SIZE, total)
        logger.info("embedded %d/%d chunks", processed, total)

        if processed < total:
            await asyncio.sleep(BATCH_DELAY_SECONDS)

    return embeddings


async def embed_query(query: str) -> list[float]:
    """Embeds a single search query with the same model used for indexed
    chunks — query and chunk vectors must come from the identical model, or
    they land in different vector spaces and cosine similarity is meaningless.
    """
    embeddings = await asyncio.to_thread(model.encode, [query], show_progress_bar=False)
    return embeddings[0].tolist()
