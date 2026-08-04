from fastapi import Depends, FastAPI

from app.config import settings
from app.lib.logging import configure_logging
from app.middleware.internal_auth import verify_internal_key
from app.routers.health import router as health_router
from app.services.db import close_db_connection
from app.services.qdrant import close_qdrant_connection

configure_logging()

app = FastAPI(title="ai-service")

# /health/* is the one route group NOT behind verify_internal_key —
# orchestrator/load-balancer probes have no way to attach the internal
# secret. There's no app-wide catch-all dependency here (that would also
# lock out /health with no way to opt out), so every other router must be
# included with dependencies=[Depends(verify_internal_key)] to stay
# protected — this is the one thing to remember when adding a new router.
app.include_router(health_router)


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_db_connection()
    await close_qdrant_connection()


@app.get("/", dependencies=[Depends(verify_internal_key)])
def root() -> dict[str, str]:
    return {"message": "ai-service is running", "port": str(settings.ai_service_port)}
