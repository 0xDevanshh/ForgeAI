import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.internal_auth import verify_internal_key
from app.services.code_parser import CodeChunk
from app.services.embedder import embed_chunks
from app.services.indexing_pipeline import ParseRepoRequest, ParseResult, run_parse_stage
from app.services.repo_cloner import RepoCloneError
from app.services.vector_store import delete_collection, upsert_chunks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", dependencies=[Depends(verify_internal_key)])

# Large repos shouldn't hang the whole request indefinitely while there's no
# real async job handling yet (that's Step 6) — this is just a safety net.
PARSE_REPO_TIMEOUT_SECONDS = 180

# Same reasoning as PARSE_REPO_TIMEOUT_SECONDS — embedding + upserting a
# large repo's chunks isn't obviously faster than parsing it, so this gets
# the same 5-minute budget Node's own internalHttpClient call uses.
EMBED_AND_STORE_TIMEOUT_SECONDS = 300

_CLONE_ERROR_STATUS: dict[str, int] = {
    "CLONE_TIMEOUT": status.HTTP_504_GATEWAY_TIMEOUT,
    "CLONE_FAILED": status.HTTP_400_BAD_REQUEST,
    "REPO_TOO_LARGE": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
}


@router.post("/parse-repo", response_model=ParseResult)
async def parse_repo(body: ParseRepoRequest) -> ParseResult:
    """Synchronously clones, analyzes, and chunks a repo, returning the full
    result in the response body. Temporary, Step-5-scope shape — no BullMQ
    job, no embeddings yet; this exists to verify clone+parse works in
    isolation before Steps 6/7 wire it into a real background job.
    """
    try:
        return await asyncio.wait_for(run_parse_stage(body), timeout=PARSE_REPO_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        logger.error(
            "parse-repo timed out: job_id=%s repo_id=%s after %ds",
            body.job_id,
            body.repo_id,
            PARSE_REPO_TIMEOUT_SECONDS,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"parse-repo exceeded the {PARSE_REPO_TIMEOUT_SECONDS}s limit",
        ) from exc
    except RepoCloneError as exc:
        logger.error(
            "parse-repo failed: job_id=%s repo_id=%s code=%s: %s",
            body.job_id,
            body.repo_id,
            exc.code,
            exc,
        )
        raise HTTPException(
            status_code=_CLONE_ERROR_STATUS.get(exc.code, status.HTTP_502_BAD_GATEWAY),
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


class EmbedAndStoreRequest(BaseModel):
    repo_id: str
    job_id: str
    chunks: list[CodeChunk]


class EmbedAndStoreResult(BaseModel):
    status: str
    vectors_stored: int


async def _run_embed_and_store(body: EmbedAndStoreRequest) -> int:
    embeddings = await embed_chunks(body.chunks)
    await upsert_chunks(body.repo_id, body.chunks, embeddings)
    return len(body.chunks)


@router.post("/embed-and-store", response_model=EmbedAndStoreResult)
async def embed_and_store(body: EmbedAndStoreRequest) -> EmbedAndStoreResult:
    """Called by Node's worker right after /parse-repo succeeds, chaining the
    parse and embed stages. Embeds every chunk's content and stores the
    resulting vectors (plus chunk metadata/text) in the repo's Qdrant
    collection.
    """
    try:
        vectors_stored = await asyncio.wait_for(_run_embed_and_store(body), timeout=EMBED_AND_STORE_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        logger.error(
            "embed-and-store timed out: job_id=%s repo_id=%s after %ds",
            body.job_id,
            body.repo_id,
            EMBED_AND_STORE_TIMEOUT_SECONDS,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"embed-and-store exceeded the {EMBED_AND_STORE_TIMEOUT_SECONDS}s limit",
        ) from exc

    return EmbedAndStoreResult(status="completed", vectors_stored=vectors_stored)


class DeleteCollectionResult(BaseModel):
    status: str


@router.delete("/collections/{repo_id}", response_model=DeleteCollectionResult)
async def delete_repo_collection(repo_id: str) -> DeleteCollectionResult:
    """Called by Node's DELETE /repos/:id after the Postgres delete already
    succeeded — idempotent (delete_collection() is a no-op if the
    collection's already gone), so a retry from Node's side is always safe.
    """
    await delete_collection(repo_id)
    return DeleteCollectionResult(status="deleted")
