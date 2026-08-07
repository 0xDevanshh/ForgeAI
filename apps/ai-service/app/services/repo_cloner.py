import logging
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)

CLONE_BASE_DIR = Path("/tmp/repo-clones")
CLONE_TIMEOUT_SECONDS = 60
MAX_REPO_SIZE_BYTES = 500 * 1024 * 1024  # 500MB

# Matches the basic-auth credentials embedded in an authenticated clone URL
# (https://x-access-token:<token>@github.com/...) so they can be stripped
# before the URL ever touches a log line or error message.
_CREDENTIALS_IN_URL = re.compile(r"https://[^:@/]+:[^@/]+@")


class RepoCloneError(Exception):
    """Raised for any clone_repo failure. `code` is a stable, machine-readable
    reason (e.g. "REPO_TOO_LARGE") a caller can branch on without parsing
    the message."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


def _mask_url(url: str) -> str:
    return _CREDENTIALS_IN_URL.sub("https://***@", url)


def _build_authenticated_url(clone_url: str, token: str) -> str:
    parts = urlsplit(clone_url)
    netloc = f"x-access-token:{token}@{parts.hostname}"
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def _dir_size_bytes(path: Path) -> int:
    total = 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            if not os.path.islink(file_path):
                total += os.path.getsize(file_path)
    return total


def clone_repo(clone_url: str, branch: str, job_id: str, token: str | None = None) -> str:
    """Shallow-clones a single branch into an isolated temp directory and
    returns its path.

    `token`, when given, is injected as HTTP basic-auth credentials
    (x-access-token:<token>@...) for a private repo — the resulting
    authenticated URL is never logged or included in an error message; only
    the masked form (_mask_url) ever is.

    Raises RepoCloneError (code one of CLONE_TIMEOUT, CLONE_FAILED,
    REPO_TOO_LARGE) on any failure. The partial clone directory is always
    removed before raising or returning an error, so a failed job never
    leaks disk usage.
    """
    CLONE_BASE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CLONE_BASE_DIR / f"{job_id}-{uuid.uuid4()}"
    authenticated_url = _build_authenticated_url(clone_url, token) if token else clone_url

    logger.info("Cloning repo for job %s (branch=%s) into %s", job_id, branch, dest)

    success = False
    try:
        try:
            subprocess.run(
                [
                    "git",
                    "clone",
                    "--depth",
                    "1",
                    "--branch",
                    branch,
                    "--single-branch",
                    authenticated_url,
                    str(dest),
                ],
                check=True,
                timeout=CLONE_TIMEOUT_SECONDS,
                capture_output=True,
                text=True,
            )
        except subprocess.TimeoutExpired as exc:
            logger.error("git clone timed out for job %s after %ds", job_id, CLONE_TIMEOUT_SECONDS)
            raise RepoCloneError(
                f"git clone timed out after {CLONE_TIMEOUT_SECONDS}s", "CLONE_TIMEOUT"
            ) from exc
        except subprocess.CalledProcessError as exc:
            masked_stderr = _mask_url(exc.stderr or "").strip()
            logger.error("git clone failed for job %s: %s", job_id, masked_stderr)
            raise RepoCloneError(f"git clone failed: {masked_stderr}", "CLONE_FAILED") from exc

        size_bytes = _dir_size_bytes(dest)
        if size_bytes > MAX_REPO_SIZE_BYTES:
            logger.warning(
                "Repo for job %s exceeds size limit: %d bytes > %d bytes",
                job_id,
                size_bytes,
                MAX_REPO_SIZE_BYTES,
            )
            raise RepoCloneError(
                f"Repository is {size_bytes // (1024 * 1024)}MB, "
                f"which exceeds the {MAX_REPO_SIZE_BYTES // (1024 * 1024)}MB limit",
                "REPO_TOO_LARGE",
            )

        logger.info("Cloned repo for job %s: %d bytes at %s", job_id, size_bytes, dest)
        success = True
        return str(dest)
    finally:
        if not success:
            shutil.rmtree(dest, ignore_errors=True)


def cleanup_repo(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)
