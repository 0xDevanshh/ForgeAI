from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    # Local Docker: 8000
    # Hugging Face Spaces: 7860
    ai_service_port: int = 8000

    database_url: str = ""
    redis_url: str = ""
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    internal_service_secret: str = ""
    node_backend_url: str = ""
    anthropic_api_key: str = ""

    langsmith_api_key: str = ""
    langsmith_project: str = "ai-codebase-copilot"
    langchain_tracing_v2: bool = True


settings = Settings()


class AgentModelConfig(BaseModel):
    planner: str = "claude-haiku-4-5-20251001"
    architecture: str = "claude-sonnet-5"
    bug_investigation: str = "claude-sonnet-5"
    pr_summary: str = "claude-haiku-4-5-20251001"
    documentation: str = "claude-haiku-4-5-20251001"
    reviewer: str = "claude-sonnet-5"


agent_models = AgentModelConfig()