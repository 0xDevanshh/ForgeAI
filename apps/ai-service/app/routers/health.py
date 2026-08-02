import asyncio

from fastapi import APIRouter, Response, status

from app.services.db import check_db_connection
from app.services.qdrant import check_qdrant_connection

router = APIRouter(prefix="/health")


@router.get("/live")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def readiness(response: Response) -> dict[str, str]:
    db_ok, qdrant_ok = await asyncio.gather(check_db_connection(), check_qdrant_connection())
    ready = db_ok and qdrant_ok

    response.status_code = status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if ready else "unavailable",
        "db": "up" if db_ok else "down",
        "qdrant": "up" if qdrant_ok else "down",
    }
