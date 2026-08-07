import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.internal_auth import verify_internal_key
from app.services.indexing_pipeline import ParseRepoRequest, ParseResult, run_parse_stage
from app.services.repo_cloner import RepoCloneError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", dependencies=[Depends(verify_internal_key)])

# Large repos shouldn't hang the whole request indefinitely while there's no
# real async job handling yet (that's Step 6) — this is just a safety net.
PARSE_REPO_TIMEOUT_SECONDS = 180

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
