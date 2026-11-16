from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FRASI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    app_name: str = "Frasi API"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite+aiosqlite:///./frasi.sqlite3"
    redis_url: str = "redis://localhost:6379/0"
    task_queue: str = "transcription"
    storage_backend: str = "filesystem"
    storage_root: Path = Path("./data/assets")
    s3_endpoint: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_bucket: str = "frasi-audio"
    jwt_secret: str = "development-only-secret-change-before-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    max_upload_mb: int = 200
    youtube_api_key: str | None = None
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def production(self) -> bool:
        return self.env.lower() == "production"

    def validate_production(self) -> None:
        if self.production and self.jwt_secret.startswith("development-"):
            raise RuntimeError("FRASI_JWT_SECRET must be replaced in production")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_production()
    return settings
