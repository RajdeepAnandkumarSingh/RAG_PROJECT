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
    SQLITE_DB_PATH: str = Field(default="data/nexus_structured.db")
    BM25_INDEX_PATH: str = Field(default="data/bm25_index.pkl")
    RERANKER_MODEL: str = Field(default="ms-marco-MiniLM-L-12-v2")

    # Langfuse Cloud Observability
    LANGFUSE_PUBLIC_KEY: str = Field(default="")
    LANGFUSE_SECRET_KEY: str = Field(default="")
    LANGFUSE_BASE_URL: str = Field(default="https://cloud.langfuse.com")

settings = Settings()
