from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_service_port: int = 8000
    database_url: str = ""
    redis_url: str = ""
    qdrant_url: str = ""
    qdrant_api_key: str = ""  # only needed for Qdrant Cloud; local/docker Qdrant has no auth
    internal_service_secret: str = ""
    node_backend_url: str = ""  # base URL for calling back into node-backend's /internal routes
    anthropic_api_key: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "ai-codebase-copilot"
    langchain_tracing_v2: bool = True


settings = Settings()


class AgentModelConfig(BaseModel):
    planner: str = "claude-haiku-4-5-20251001"
    architecture: str = "claude-sonnet-5"  # latest Sonnet model id as of this build
    bug_investigation: str = "claude-sonnet-5"
    pr_summary: str = "claude-haiku-4-5-20251001"
    documentation: str = "claude-haiku-4-5-20251001"
    reviewer: str = "claude-sonnet-5"


# Plain BaseModel (not BaseSettings) — hardcoded defaults for now. Could be
# swapped for BaseSettings later to allow overriding per-agent models via env
# vars without a code change, but that's not needed yet.
agent_models = AgentModelConfig()
