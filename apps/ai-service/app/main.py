from fastapi import FastAPI

from app.config import settings
from app.routers.health import router as health_router
from app.services.db import close_db_connection
from app.services.qdrant import close_qdrant_connection

app = FastAPI(title="ai-service")
app.include_router(health_router)


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_db_connection()
    await close_qdrant_connection()


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "ai-service is running", "port": str(settings.ai_service_port)}
