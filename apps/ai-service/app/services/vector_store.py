from uuid import uuid4

from qdrant_client.models import Distance, PointStruct, VectorParams

from app.services.code_parser import CodeChunk
from app.services.qdrant import get_client

# Qdrant's own recommendation for large upserts — one giant request across
# thousands of points can be slow and timeout-prone.
UPSERT_BATCH_SIZE = 100

# all-MiniLM-L6-v2 (the sentence-transformers model used for embeddings)
# outputs 384-dim vectors — a good speed/quality tradeoff for a
# portfolio-scale project versus a larger model like all-mpnet-base-v2
# (768 dims, ~4x the inference cost for marginally better retrieval).
EMBEDDING_DIM = 384


def collection_name(repo_id: str) -> str:
    # One Qdrant collection per repo: clean isolation (deleting a repo is
    # just deleting its one collection), and queries never need a repo_id
    # filter — unlike one giant collection mixing every user's code together.
    return f"repo_{repo_id}"


async def ensure_collection(repo_id: str) -> None:
    """Creates the per-repo collection if it doesn't already exist — a no-op
    otherwise, so re-indexing a repo never errors on a collection that's
    already there.
    """
    client = get_client()
    name = collection_name(repo_id)

    if await client.collection_exists(name):
        return

    await client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
    )


async def delete_collection(repo_id: str) -> None:
    """Called when a Repo is deleted (Node's DELETE /repos/:id triggers this
    via an internal call — wired in Step 7.4). Checks existence first for
    the same reason ensure_collection does: idempotent, no error if the
    collection is already gone.
    """
    client = get_client()
    name = collection_name(repo_id)

    if await client.collection_exists(name):
        await client.delete_collection(name)


async def upsert_chunks(repo_id: str, chunks: list[CodeChunk], embeddings: list[list[float]]) -> None:
    """Stores each chunk's embedding in the repo's collection, with the
    chunk's own text and metadata alongside it in the payload — retrieval
    needs the actual content to pass to the LLM, and storing it here avoids
    a second round-trip back to Postgres for it.
    """
    if len(chunks) != len(embeddings):
        raise ValueError(f"chunks ({len(chunks)}) and embeddings ({len(embeddings)}) counts must match")

    await ensure_collection(repo_id)

    points = [
        PointStruct(
            id=str(uuid4()),
            vector=embedding,
            payload={
                "file_path": chunk.file_path,
                "chunk_type": chunk.chunk_type,
                "name": chunk.name,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "language": chunk.language,
                "content": chunk.content,
            },
        )
        for chunk, embedding in zip(chunks, embeddings)
    ]

    client = get_client()
    name = collection_name(repo_id)

    for start in range(0, len(points), UPSERT_BATCH_SIZE):
        batch = points[start : start + UPSERT_BATCH_SIZE]
        await client.upsert(collection_name=name, points=batch)
