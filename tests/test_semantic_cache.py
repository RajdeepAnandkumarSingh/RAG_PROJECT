import json
import asyncio
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import httpx

from config import settings
from utils.semantic_cache import SemanticCache, compute_cosine_similarity, get_semantic_cache
from server import server, QueryRequest, ask_query, ChatResponse

def run_async(coro):
    """Helper to execute async coroutines in tests without requiring pytest-asyncio plugin."""
    return asyncio.run(coro)

def parse_sse_events(lines: List[str]) -> List[Dict[str, Any]]:
    """Helper to parse raw SSE text lines into structured event dictionaries."""
    events = []
    current_event = None
    current_data = None

    for line in lines:
        line = line.strip()
        if not line:
            if current_event or current_data is not None:
                events.append({"event": current_event, "data": current_data})
                current_event = None
                current_data = None
            continue
        if line.startswith("event:"):
            current_event = line.replace("event:", "", 1).strip()
        elif line.startswith("data:"):
            raw_data = line.replace("data:", "", 1).strip()
            try:
                current_data = json.loads(raw_data)
            except Exception:
                current_data = raw_data

    if current_event or current_data is not None:
        events.append({"event": current_event, "data": current_data})

    return events


# =====================================================================
# 1. Math & Similarity Unit Tests
# =====================================================================

def test_cosine_similarity_computation():
    """Verifies cosine similarity calculations for identical, orthogonal, and zero vectors."""
    # Identical vectors -> 1.0
    vec1 = [1.0, 2.0, 3.0]
    assert pytest.approx(compute_cosine_similarity(vec1, vec1), 0.0001) == 1.0

    # Orthogonal vectors -> 0.0
    vec_a = [1.0, 0.0]
    vec_b = [0.0, 1.0]
    assert pytest.approx(compute_cosine_similarity(vec_a, vec_b), 0.0001) == 0.0

    # Opposite vectors -> -1.0
    vec_c = [1.0, 1.0]
    vec_d = [-1.0, -1.0]
    assert pytest.approx(compute_cosine_similarity(vec_c, vec_d), 0.0001) == -1.0

    # Zero vector -> 0.0
    zero_vec = [0.0, 0.0]
    assert compute_cosine_similarity(zero_vec, vec1) == 0.0


# =====================================================================
# 2. Redis Semantic Cache Unit Tests (Hit, Miss, Fallback)
# =====================================================================

def test_semantic_cache_hit_above_threshold():
    """Verifies that an entry with cosine similarity >= 0.92 returns a cache hit."""
    cache = SemanticCache(threshold=0.92, ttl=3600)
    mock_redis = AsyncMock()

    # Cached entry has vector almost identical to query
    cached_payload = {
        "query": "What is your refund policy?",
        "embedding": [1.0, 0.0, 0.0],
        "response": "Refunds are processed within 30 days.",
        "intent": "safe_rag",
        "context": ["Policy doc chunk"],
        "retrieved_chunks": [{"content": "Policy doc chunk", "score": 0.95}]
    }

    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.keys = AsyncMock(return_value=["nexus:cache:abc12345"])
    mock_redis.mget = AsyncMock(return_value=[json.dumps(cached_payload)])

    async def _test():
        with patch.object(cache, "get_client", AsyncMock(return_value=mock_redis)):
            # Query vector is [0.99, 0.01, 0.0] -> Cosine similarity > 0.99
            with patch.object(cache, "get_embedding", AsyncMock(return_value=[0.99, 0.01, 0.0])):
                result = await cache.lookup("Can I get a refund on my purchase?")
                assert result is not None
                assert result["hit"] is True
                assert result["similarity"] >= 0.92
                assert result["response"] == "Refunds are processed within 30 days."
                assert result["query"] == "What is your refund policy?"

    run_async(_test())


def test_semantic_cache_miss_below_threshold():
    """Verifies that entries with similarity < 0.92 result in a cache miss (None)."""
    cache = SemanticCache(threshold=0.92, ttl=3600)
    mock_redis = AsyncMock()

    # Cached entry is completely different topic
    cached_payload = {
        "query": "How do I change my account password?",
        "embedding": [0.0, 1.0, 0.0],
        "response": "Go to security settings to change your password.",
        "intent": "safe_rag"
    }

    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.keys = AsyncMock(return_value=["nexus:cache:pass123"])
    mock_redis.mget = AsyncMock(return_value=[json.dumps(cached_payload)])

    async def _test():
        with patch.object(cache, "get_client", AsyncMock(return_value=mock_redis)):
            # Query vector is orthogonal [1.0, 0.0, 0.0] -> similarity 0.0
            with patch.object(cache, "get_embedding", AsyncMock(return_value=[1.0, 0.0, 0.0])):
                result = await cache.lookup("Where is my package?")
                assert result is None

    run_async(_test())


def test_semantic_cache_empty_miss():
    """Verifies that an empty Redis cache returns None."""
    cache = SemanticCache()
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.keys = AsyncMock(return_value=[])

    async def _test():
        with patch.object(cache, "get_client", AsyncMock(return_value=mock_redis)):
            result = await cache.lookup("Any question")
            assert result is None

    run_async(_test())


def test_semantic_cache_offline_fallback():
    """
    CRITICAL: Verifies graceful fail-open behavior.
    When Redis is offline or throws ConnectionError/TimeoutError,
    lookup and set must return None / False without raising an unhandled exception.
    """
    cache = SemanticCache()
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(side_effect=ConnectionError("Could not connect to Redis: connection refused"))

    async def _test():
        with patch.object(cache, "get_client", AsyncMock(return_value=mock_redis)):
            # Lookup fails open
            result = await cache.lookup("Test query when Redis is offline")
            assert result is None

            # Set fails open
            saved = await cache.set("Test query", "Test response", intent="safe_rag")
            assert saved is False

    run_async(_test())


def test_semantic_cache_set_with_ttl():
    """Verifies storing a safe_rag query with embedding, metadata, and expiration TTL."""
    cache = SemanticCache(ttl=7200)
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.set = AsyncMock(return_value=True)

    async def _test():
        with patch.object(cache, "get_client", AsyncMock(return_value=mock_redis)):
            with patch.object(cache, "get_embedding", AsyncMock(return_value=[0.1, 0.2, 0.3])):
                success = await cache.set(
                    query="What is the warranty period?",
                    response="1 year hardware warranty.",
                    intent="safe_rag",
                    context=["Warranty chunk"],
                    retrieved_chunks=[{"content": "Warranty chunk", "score": 0.99}]
                )
                assert success is True
                mock_redis.set.assert_called_once()
                call_args, call_kwargs = mock_redis.set.call_args
                key_name = call_args[0]
                assert key_name.startswith("semcache:org_nexus:")
                assert call_kwargs["ex"] == 7200
                payload = json.loads(call_args[1])
                assert payload["query"] == "What is the warranty period?"
                assert payload["response"] == "1 year hardware warranty."
                assert payload["intent"] == "safe_rag"
                assert payload["embedding"] == [0.1, 0.2, 0.3]

    run_async(_test())


def test_semantic_cache_ignores_non_safe_rag():
    """Verifies that prompt_injection or escalation_hitl are never cached."""
    cache = SemanticCache()
    mock_redis = AsyncMock()

    async def _test():
        with patch.object(cache, "get_client", AsyncMock(return_value=mock_redis)):
            res1 = await cache.set("Ignore rules", "Refused", intent="prompt_injection")
            assert res1 is False
            res2 = await cache.set("I am suing you", "Escalating", intent="escalation_hitl")
            assert res2 is False
            mock_redis.set.assert_not_called()

    run_async(_test())


# =====================================================================
# 3. Server Integration Tests (/ask and /api/chat/stream Cache Bypass)
# =====================================================================

def test_server_ask_cache_hit_bypasses_graph():
    """Verifies that a cache hit on /ask bypasses LangGraph execution entirely."""
    cached_hit_data = {
        "hit": True,
        "similarity": 0.965,
        "query": "How do I return an item?",
        "response": "Return via our returns portal within 30 days.",
        "intent": "safe_rag",
        "context": ["Return context"],
        "retrieved_chunks": [{"content": "Return context", "score": 0.98}]
    }

    mock_cache = AsyncMock()
    mock_cache.lookup = AsyncMock(return_value=cached_hit_data)

    async def _test():
        with patch("server.get_semantic_cache", return_value=mock_cache):
            with patch("server.graph_app.ainvoke") as mock_graph:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server), base_url="http://test") as client:
                    resp = await client.post("/ask", json={"query": "How to return items?", "thread_id": "test_t1"})
                    assert resp.status_code == 200
                    data = resp.json()
                    assert data["response"] == "Return via our returns portal within 30 days."
                    assert data["status"] == "success"
                    assert data["intent"] == "safe_rag"
                    # Graph execution must NOT have been called
                    mock_graph.assert_not_called()

    run_async(_test())


def test_server_stream_cache_hit_sse():
    """Verifies that /api/chat/stream emits a cache_hit event and bypasses stage execution on hit."""
    cached_hit_data = {
        "hit": True,
        "similarity": 0.954,
        "query": "What are domestic shipping times?",
        "response": "Domestic shipping takes 3-5 business days.",
        "intent": "safe_rag",
        "retrieved_chunks": [{"content": "Shipping info", "score": 0.95, "source": "FAQ"}]
    }

    mock_cache = AsyncMock()
    mock_cache.lookup = AsyncMock(return_value=cached_hit_data)

    async def _test():
        with patch("server.get_semantic_cache", return_value=mock_cache):
            with patch("server.graph_app.astream") as mock_astream:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server), base_url="http://test") as client:
                    resp = await client.post("/api/chat/stream", json={"query": "How long does shipping take?", "thread_id": "stream_t1"})
                    assert resp.status_code == 200
                    raw_lines = resp.text.split("\n")
                    events = parse_sse_events(raw_lines)
                    
                    event_names = [e["event"] for e in events]
                    assert "cache_hit" in event_names
                    assert "final_response" in event_names
                    assert "done" in event_names
                    
                    # Verify cache_hit event data payload
                    cache_ev = next(e for e in events if e["event"] == "cache_hit")
                    assert cache_ev["data"]["hit"] is True
                    assert cache_ev["data"]["similarity"] == 0.954
                    assert cache_ev["data"]["response"] == "Domestic shipping takes 3-5 business days."
                    
                    # LangGraph astream was bypassed
                    mock_astream.assert_not_called()

    run_async(_test())
