from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_service_port: int = 8000
    database_url: str = ""
    redis_url: str = ""
    qdrant_url: str = ""
    internal_service_secret: str = ""
    anthropic_api_key: str = ""
    langsmith_api_key: str = ""


settings = Settings()
