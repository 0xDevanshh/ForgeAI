import asyncio

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.services import embedder
from app.services.vector_store import EMBEDDING_DIM
from app.tools import rag_search

OTP_CHUNK = {
    "content": (
        "def verify_otp(user_id, code):\n"
        "    stored = get_stored_otp(user_id)\n"
        "    return stored is not None and stored == code and not is_expired(stored)"
    ),
    "file_path": "auth/otp.py",
    "chunk_type": "function",
    "name": "verify_otp",
    "start_line": 1,
    "end_line": 3,
    "language": "Python",
}

PAYMENT_CHUNK = {
    "content": (
        "def process_payment(order_id, amount, card_token):\n"
        "    charge = stripe_client.charge(card_token, amount)\n"
        "    record_transaction(order_id, charge.id)\n"
        "    return charge"
    ),
    "file_path": "billing/payments.py",
    "chunk_type": "function",
    "name": "process_payment",
    "start_line": 1,
    "end_line": 4,
    "language": "Python",
}

PROFILE_CHUNK = {
    "content": (
        "def update_user_profile(user_id, display_name, bio):\n"
        "    user = get_user(user_id)\n"
        "    user.display_name = display_name\n"
        "    user.bio = bio\n"
        "    user.save()"
    ),
    "file_path": "users/profile.py",
    "chunk_type": "function",
    "name": "update_user_profile",
    "start_line": 1,
    "end_line": 5,
    "language": "Python",
}

TEST_CHUNKS = [OTP_CHUNK, PAYMENT_CHUNK, PROFILE_CHUNK]


def test_search_codebase_ranks_otp_chunk_highest_for_otp_query(monkeypatch) -> None:
    # No pytest-asyncio in this project's dev requirements — drive the
    # coroutine with asyncio.run() from an ordinary sync test instead.
    async def run() -> list[rag_search.RetrievedChunk]:
        test_client = AsyncQdrantClient(location=":memory:")
        monkeypatch.setattr(rag_search, "get_client", lambda: test_client)

        repo_id = "test-repo"
        collection = rag_search.collection_name(repo_id)

        await test_client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )

        points = []
        for i, chunk in enumerate(TEST_CHUNKS):
            vector = await embedder.embed_query(chunk["content"])
            points.append(PointStruct(id=i, vector=vector, payload=chunk))

        await test_client.upsert(collection_name=collection, points=points)

        return await rag_search.search_codebase(repo_id, "how does OTP verification work")

    results = asyncio.run(run())

    assert len(results) > 0
    assert results[0].name == "verify_otp"
    assert results[0].file_path == "auth/otp.py"

    # Sanity check the rest of the payload made it through RetrievedChunk.
    assert results[0].chunk_type == "function"
    assert results[0].score > 0


def test_search_codebase_returns_empty_list_for_unindexed_repo(monkeypatch) -> None:
    async def run() -> list[rag_search.RetrievedChunk]:
        test_client = AsyncQdrantClient(location=":memory:")
        monkeypatch.setattr(rag_search, "get_client", lambda: test_client)

        return await rag_search.search_codebase("no-such-repo", "anything")

    assert asyncio.run(run()) == []
