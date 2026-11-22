import pytest
from httpx import AsyncClient, ASGITransport
from server import server, collect_telemetry_stats

@pytest.mark.asyncio
async def test_telemetry_endpoint_success():
    """
    Tests GET /api/telemetry to ensure it returns 200 OK and structured
    telemetry data with valid RAGAS benchmarks and index statistics.
    """
    transport = ASGITransport(app=server)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/telemetry")
        assert response.status_code == 200
        data = response.json()

        # Validate RAGAS scores
        assert "composite_score" in data
        assert isinstance(data["composite_score"], float)
        assert 0.0 <= data["composite_score"] <= 1.0

        assert "faithfulness" in data
        assert isinstance(data["faithfulness"], float)
        assert 0.0 <= data["faithfulness"] <= 1.0

        assert "answer_relevancy" in data
        assert isinstance(data["answer_relevancy"], float)

        assert "context_precision" in data
        assert isinstance(data["context_precision"], float)

        # Validate index metrics
        assert "chroma_chunk_count" in data
        assert isinstance(data["chroma_chunk_count"], int)
        assert data["chroma_chunk_count"] >= 0

        assert "bm25_status" in data
        assert isinstance(data["bm25_status"], str)

        assert "sqlite_row_count" in data
        assert isinstance(data["sqlite_row_count"], int)
        assert data["sqlite_row_count"] >= 0

        assert "embedding_model" in data
        assert "reranker_model" in data
        assert "groq_model" in data

@pytest.mark.asyncio
async def test_telemetry_alias_endpoint():
    """Tests GET /telemetry alias route."""
    transport = ASGITransport(app=server)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/telemetry")
        assert response.status_code == 200
        data = response.json()
        assert data["composite_score"] > 0

def test_collect_telemetry_stats_fallback():
    """Verifies that collect_telemetry_stats handles errors and returns non-empty defaults."""
    stats = collect_telemetry_stats()
    assert isinstance(stats, dict)
    assert stats["composite_score"] >= 0.8
    assert stats["chroma_chunk_count"] >= 1
    assert stats["sqlite_row_count"] >= 1
    assert "MiniLM" in stats["embedding_model"]
