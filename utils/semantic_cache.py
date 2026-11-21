import json
import time
import hashlib
import logging
import asyncio
from typing import Optional, Dict, Any, List
import numpy as np
import redis.asyncio as aioredis
from langchain_huggingface import HuggingFaceEmbeddings

from config import settings

logger = logging.getLogger("nexus.semantic_cache")

def compute_cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Computes cosine similarity between two float vectors using numpy."""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


class SemanticCache:
    """
    Production Redis-backed Semantic Cache for Nexus RAG v2.0.
    
    Features:
    - Asynchronous I/O via redis.asyncio
    - Local dense embedding generation (all-MiniLM-L6-v2) run in asyncio.to_thread
    - Configurable TTL and cosine similarity threshold (>= 0.92)
    - Graceful fail-open fallback: if Redis is unreachable or offline, operations
      fail open (cache miss / no-op set) so local dev and tests never break.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        ttl: Optional[int] = None,
        threshold: Optional[float] = None
    ):
        self.redis_url = redis_url or settings.REDIS_URL
        self.ttl = ttl if ttl is not None else settings.SEMANTIC_CACHE_TTL
        self.threshold = threshold if threshold is not None else settings.SEMANTIC_CACHE_THRESHOLD
        self._redis_client: Optional[aioredis.Redis] = None
        self._embeddings_model: Optional[HuggingFaceEmbeddings] = None
        self._key_prefix = "nexus:cache:"

    def _get_embeddings_model(self) -> HuggingFaceEmbeddings:
        """Lazy access to HuggingFace embeddings model."""
        if self._embeddings_model is None:
            self._embeddings_model = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
        return self._embeddings_model

    async def get_embedding(self, text: str) -> List[float]:
        """Generates embedding asynchronously without blocking event loop."""
        model = self._get_embeddings_model()
        return await asyncio.to_thread(model.embed_query, text)

    async def get_client(self) -> aioredis.Redis:
        """Lazy initialization of async Redis client."""
        if self._redis_client is None:
            self._redis_client = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=1.0,
                socket_timeout=1.0
            )
        return self._redis_client

    async def lookup(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Looks up query in the semantic cache.
        Returns matched dict if similarity >= threshold, else None.
        Fails open gracefully on any Redis error.
        """
        try:
            client = await self.get_client()
            
            # Check Redis connection quickly
            try:
                await client.ping()
            except Exception as e:
                logger.warning(f"Redis offline or unreachable in lookup: {e}. Failing open.")
                return None

            # Find all semantic cache keys
            keys = await client.keys(f"{self._key_prefix}*")
            if not keys:
                return None

            query_embedding = await self.get_embedding(query)
            
            # Fetch all cached entries in batch
            raw_entries = await client.mget(keys)
            
            best_match: Optional[Dict[str, Any]] = None
            highest_score: float = -1.0

            for raw in raw_entries:
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                    cached_embedding = entry.get("embedding")
                    if not cached_embedding:
                        continue
                    
                    score = await asyncio.to_thread(
                        compute_cosine_similarity, query_embedding, cached_embedding
                    )
                    
                    if score > highest_score:
                        highest_score = score
                        best_match = entry
                except Exception as parse_err:
                    logger.debug(f"Error parsing cache entry: {parse_err}")
                    continue

            if best_match and highest_score >= self.threshold:
                logger.info(
                    f"Semantic cache HIT (score={highest_score:.4f} >= {self.threshold}): "
                    f"'{query}' matched '{best_match.get('query')}'"
                )
                return {
                    "hit": True,
                    "similarity": highest_score,
                    "query": best_match.get("query"),
                    "response": best_match.get("response"),
                    "intent": best_match.get("intent", "safe_rag"),
                    "context": best_match.get("context", []),
                    "retrieved_chunks": best_match.get("retrieved_chunks", [])
                }
            
            return None

        except Exception as e:
            logger.warning(f"Redis semantic cache lookup failed with error: {e}. Failing open.")
            return None

    async def set(
        self,
        query: str,
        response: str,
        intent: str = "safe_rag",
        context: Optional[List[str]] = None,
        retrieved_chunks: Optional[List[Dict[str, Any]]] = None,
        embedding: Optional[List[float]] = None
    ) -> bool:
        """
        Stores query, response, and metadata in semantic cache with TTL.
        Fails open gracefully without throwing.
        """
        # Only cache safe_rag responses
        if intent != "safe_rag":
            return False

        try:
            client = await self.get_client()
            
            try:
                await client.ping()
            except Exception as e:
                logger.warning(f"Redis offline in set: {e}. Skipping cache save.")
                return False

            if embedding is None:
                embedding = await self.get_embedding(query)

            payload = {
                "query": query,
                "response": response,
                "intent": intent,
                "context": context or [],
                "retrieved_chunks": retrieved_chunks or [],
                "embedding": embedding,
                "created_at": time.time()
            }

            key_hash = hashlib.sha256(query.encode("utf-8")).hexdigest()[:16]
            cache_key = f"{self._key_prefix}{key_hash}"

            await client.set(cache_key, json.dumps(payload), ex=self.ttl)
            logger.info(f"Cached semantic query '{query}' (key={cache_key}, TTL={self.ttl}s)")
            return True

        except Exception as e:
            logger.warning(f"Failed to write to Redis semantic cache: {e}. Failing open.")
            return False

    async def close(self):
        """Closes the async Redis client connection cleanly."""
        if self._redis_client is not None:
            try:
                await self._redis_client.aclose()
            except Exception:
                pass
            self._redis_client = None


# Singleton instance
_semantic_cache: Optional[SemanticCache] = None

def get_semantic_cache() -> SemanticCache:
    """Returns the singleton SemanticCache instance."""
    global _semantic_cache
    if _semantic_cache is None:
        _semantic_cache = SemanticCache()
    return _semantic_cache
