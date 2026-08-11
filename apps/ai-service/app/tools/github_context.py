import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_COMMIT_LIMIT = 10

# Below this, an agent's context budget matters more than seeing the whole
# diff — better to truncate with a note than blow the prompt up.
MAX_DIFF_CHARS = 8000


def _node_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.node_backend_url,
        headers={"X-Internal-Key": settings.internal_service_secret},
        timeout=30.0,
    )


async def fetch_recent_commits(
    repo_id: str, file_paths: list[str], limit: int = DEFAULT_COMMIT_LIMIT
) -> list[dict]:
    """Recent commits touching any of `file_paths`, for the bug-investigation
    agent to correlate a report against recent changes.

    Proxied through node-backend's GET /internal/repos/:id/commits rather
    than calling GitHub directly — node-backend already owns the encrypted
    GitHub token + decryption logic (getDecryptedGithubToken); duplicating
    that here would mean managing the encryption key in two services
    instead of one, for no benefit.

    Returns a list of { sha, message, author, date, files_changed }.
    """
    async with _node_client() as client:
        response = await client.get(
            f"/internal/repos/{repo_id}/commits",
            params={"paths": ",".join(file_paths), "limit": limit},
        )
        response.raise_for_status()
        commits = response.json()["commits"]

    # Node's CommitSummary is camelCase (filesChanged) — renamed at the
    # boundary so callers on this side only ever deal with snake_case.
    return [
        {
            "sha": commit["sha"],
            "message": commit["message"],
            "author": commit["author"],
            "date": commit["date"],
            "files_changed": commit["filesChanged"],
        }
        for commit in commits
    ]


async def fetch_commit_diff(repo_id: str, sha: str) -> str:
    """Raw unified diff for a single commit, via node-backend's
    GET /internal/repos/:id/commits/:sha/diff. Truncated to MAX_DIFF_CHARS
    with a note appended, rather than passed through in full, if it's huge.
    """
    async with _node_client() as client:
        response = await client.get(f"/internal/repos/{repo_id}/commits/{sha}/diff")
        response.raise_for_status()
        diff = response.json()["diff"]

    if len(diff) <= MAX_DIFF_CHARS:
        return diff

    logger.info("Truncating commit diff: repo_id=%s sha=%s original_len=%d", repo_id, sha, len(diff))
    return diff[:MAX_DIFF_CHARS] + f"\n\n[diff truncated — exceeded {MAX_DIFF_CHARS} characters]"
