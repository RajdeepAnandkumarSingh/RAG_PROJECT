import os
import asyncio
import logging
from typing import List, Optional, Any

try:
    from langchain_core.embeddings import Embeddings
except ImportError:
    class Embeddings:
        """Fallback base class when langchain_core is not installed."""
        pass

try:
    from fastembed import TextEmbedding
except ImportError:
    TextEmbedding = None

logger = logging.getLogger("nexus.embeddings")


class FastEmbedEmbeddings(Embeddings):
    """
    Lightweight, LangChain-compatible embedding wrapper backed by fastembed (ONNX Runtime).
    Replaces heavy PyTorch sentence-transformers (~800MB-1GB) with pure ONNX (~30MB runtime),
    enabling production deployment within 512MB RAM constraints (e.g. Render free tier).
    """

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        cache_dir: Optional[str] = None,
        threads: Optional[int] = None,
        **kwargs: Any
    ):
        # Normalize model identifier
        if model_name in ("all-MiniLM-L6-v2", "sentence-transformers/all-MiniLM-L6-v2"):
            self.model_name = "sentence-transformers/all-MiniLM-L6-v2"
        else:
            self.model_name = model_name

        self.cache_dir = cache_dir or os.getenv("FASTEMBED_CACHE_PATH")
        self.threads = threads
        self.kwargs = kwargs
        self._model: Optional[Any] = None

    def _get_model(self) -> Any:
        """Lazy initialization of the ONNX TextEmbedding model."""
        if self._model is None:
            if TextEmbedding is None:
                raise ImportError(
                    "The 'fastembed' package is required for FastEmbedEmbeddings. "
                    "Install it via `pip install fastembed`."
                )
            init_kwargs: dict = {"model_name": self.model_name}
            if self.cache_dir is not None:
                init_kwargs["cache_dir"] = self.cache_dir
            if self.threads is not None:
                init_kwargs["threads"] = self.threads
            logger.info(f"Initializing FastEmbed ONNX embedding model: {self.model_name}")
            self._model = TextEmbedding(**init_kwargs)
        return self._model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Embeds a list of document strings into dense float vectors.
        ChromaDB expects a List[List[float]].
        """
        if not texts:
            return []
        model = self._get_model()
        embeddings_gen = model.embed(texts)
        return [
            vec.tolist() if hasattr(vec, "tolist") else list(vec)
            for vec in embeddings_gen
        ]

    def embed_query(self, text: str) -> List[float]:
        """
        Embeds a single query string into a dense float vector.
        ChromaDB and SemanticCache expect a List[float].
        """
        if not text:
            text = " "
        model = self._get_model()
        embeddings_gen = model.embed([text])
        for vec in embeddings_gen:
            return vec.tolist() if hasattr(vec, "tolist") else list(vec)
        return []

    async def aembed_documents(self, texts: List[str]) -> List[List[float]]:
        """Asynchronously embeds documents in a background worker thread."""
        return await asyncio.to_thread(self.embed_documents, texts)

    async def aembed_query(self, text: str) -> List[float]:
        """Asynchronously embeds a query in a background worker thread."""
        return await asyncio.to_thread(self.embed_query, text)


# Singleton instance helper
_global_embeddings: Optional[FastEmbedEmbeddings] = None

def get_embeddings(model_name: Optional[str] = None) -> FastEmbedEmbeddings:
    """Returns a shared singleton FastEmbedEmbeddings instance."""
    global _global_embeddings
    if _global_embeddings is None:
        target_model = model_name or "sentence-transformers/all-MiniLM-L6-v2"
        _global_embeddings = FastEmbedEmbeddings(model_name=target_model)
    return _global_embeddings


# Backwards compatibility alias
HuggingFaceEmbeddings = FastEmbedEmbeddings
