from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="ai-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "ai-service is running", "port": str(settings.ai_service_port)}
