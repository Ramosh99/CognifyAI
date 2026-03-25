from typing import List, Union
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "CognifyAI API"
    API_V1_STR: str = "/api/v1"
    
    # BACKEND_CORS_ORIGINS is a JSON-formatted list of origins
    # e.g: '["http://localhost", "http://localhost:4200", "http://localhost:3000", "http://localhost:8080"]'
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost:3000", # Next.js default porta
        "http://127.0.0.1:3000",
    ]
    
    # LLM Settings
    OPENROUTER_API_KEY: str = ""
    
    model_config = {
        "case_sensitive": True,
        "env_file": ".env"
    }

settings = Settings()
