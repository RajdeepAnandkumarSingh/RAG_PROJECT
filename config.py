from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

    GROQ_API_KEY: str = Field(default="")
    GROQ_MODEL_ROUTER: str = Field(default="openai/gpt-oss-20b")
    GROQ_MODEL_GENERATOR: str = Field(default="openai/gpt-oss-120b")
    CHROMA_PERSIST_DIRECTORY: str = Field(default="chroma_db")
    EMBEDDING_MODEL: str = Field(default="all-MiniLM-L6-v2")

settings = Settings()
