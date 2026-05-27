from typing import List
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "CognifyAI API"
    API_V1_STR: str = "/api/v1"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # LLM
    GROQ_API_KEY: str = ""

    # Embeddings
    # Dedicated embedding Space. Required so this backend stays lightweight.
    EMBEDDING_SERVICE_URL: str = ""
    EMBEDDING_SERVICE_TOKEN: str = ""
    EMBEDDING_SERVICE_TIMEOUT: float = 120.0

    # Supabase / PostgreSQL
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""   # Project Settings → API → JWT Secret
    DATABASE_URL: str = ""

    model_config = {
        "case_sensitive": True,
        "env_file": ".env",
        "extra": "ignore",   # silently ignore unknown env vars (e.g. HF_TOKEN leftovers)
    }


settings = Settings()
