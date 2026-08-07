from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.middleware.internal_auth import verify_internal_key

# Every route on this router requires the internal-service key — this is the
# router-level equivalent of the per-route dependencies=[...] main.py uses
# for "/", just cleaner when a whole prefix should be protected at once.
router = APIRouter(prefix="/internal", dependencies=[Depends(verify_internal_key)])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "ai-service",
        "timestamp": datetime.now(UTC).isoformat(),
    }
