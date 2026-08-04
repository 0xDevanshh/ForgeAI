import hmac
import logging

from fastapi import Header, HTTPException, status

from app.config import settings
from app.lib.logging import request_id_var

logger = logging.getLogger(__name__)


async def verify_internal_key(
    x_internal_key: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
) -> None:
    """FastAPI dependency guarding every route except /health/*.

    Verifies the shared secret node-backend's internalHttpClient attaches to
    every call (X-Internal-Key), using a constant-time comparison so a
    mismatch can't be timed byte-by-byte to guess the secret. Also stashes
    X-Request-Id — set by that same client — in a ContextVar so log lines
    for this request carry the same id Node logged it under.
    """
    request_id_var.set(x_request_id)

    expected = settings.internal_service_secret
    if not expected or not x_internal_key or not hmac.compare_digest(x_internal_key, expected):
        logger.warning("Rejected request with missing or invalid X-Internal-Key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal service credentials",
        )
