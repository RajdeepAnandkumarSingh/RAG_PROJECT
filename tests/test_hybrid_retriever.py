import os
import pickle
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from langchain_core.documents import Document
from utils.hybrid_retriever import HybridRetriever, tokenize_query
from main import retrieve_node, AgentState

def run_async(coro):
    return asyncio.run(coro)


# --- 1. RRF Mathematics & Deduplication Unit Tests ---

def test_rrf_scoring_formula():
    """
    Verifies that Reciprocal Rank Fusion uses the exact formula:
    RRF_Score(d) = sum(1.0 / (k + rank_m(d))) with k=60.
    """
    retriever = HybridRetriever(rrf_k=60)

    # Document A is #1 in dense, Document B is #2 in dense
    dense_docs = [
        Document(page_content="Content A", metadata={"chunk_id": "A"}),
        Document(page_content="Content B", metadata={"chunk_id": "B"}),
    ]
    # Document A is #2 in sparse, Document C is #1 in sparse
    sparse_docs = [
        Document(page_content="Content C", metadata={"chunk_id": "C"}),
        Document(page_content="Content A", metadata={"chunk_id": "A"}),
    ]

    fused = retriever.reciprocal_rank_fusion(dense_docs, sparse_docs, k=60)

    # Expected Scores:
    # A: 1/(60+1) + 1/(60+2) = 1/61 + 1/62 ≈ 0.0163934 + 0.0161290 = 0.0325224
    # C: 1/(60+1) = 1/61 ≈ 0.0163934
    # B: 1/(60+2) = 1/62 ≈ 0.0161290
    expected_score_a = (1.0 / 61.0) + (1.0 / 62.0)
    expected_score_c = 1.0 / 61.0
    expected_score_b = 1.0 / 62.0

    assert len(fused) == 3
    assert fused[0].metadata["chunk_id"] == "A"
    assert pytest.approx(fused[0].metadata["rrf_score"], rel=1e-5) == expected_score_a

    assert fused[1].metadata["chunk_id"] == "C"
    assert pytest.approx(fused[1].metadata["rrf_score"], rel=1e-5) == expected_score_c

    assert fused[2].metadata["chunk_id"] == "B"
    assert pytest.approx(fused[2].metadata["rrf_score"], rel=1e-5) == expected_score_b


def test_rrf_deduplication_via_content_hash():
    """Verifies document deduplication when chunk_id is not explicitly provided in metadata."""
    retriever = HybridRetriever(rrf_k=60)

    # Both dense and sparse return identical content without chunk_id
    dense_docs = [
        Document(page_content="Identical Policy Content", metadata={"source": "dense.pdf"}),
    ]
    sparse_docs = [
        Document(page_content="Identical Policy Content", metadata={"source": "sparse.md"}),
    ]

    fused = retriever.reciprocal_rank_fusion(dense_docs, sparse_docs, k=60)

    # Must be deduplicated into a single document with combined score (1/61 + 1/61)
    assert len(fused) == 1
    assert fused[0].page_content == "Identical Policy Content"
    assert pytest.approx(fused[0].metadata["rrf_score"], rel=1e-5) == (2.0 / 61.0)


# --- 2. BM25 Search & Persistence Tests ---

def test_bm25_search_and_index_persistence(tmp_path):
    """Verifies BM25 index serialization, loading, and keyword matching."""
    from rank_bm25 import BM25Okapi

    bm25_test_path = str(tmp_path / "test_bm25_index.pkl")

    sample_docs = [
        {"page_content": "Returns and refunds are permitted within 30 days.", "metadata": {"source": "returns.md"}},
        {"page_content": "Express shipping arrives in 1 to 2 business days.", "metadata": {"source": "shipping.md"}},
        {"page_content": "Hardware warranty covers manufacturing defects for 1 year.", "metadata": {"source": "warranty.md"}},
    ]

    tokenized_corpus = [tokenize_query(d["page_content"]) for d in sample_docs]
    bm25 = BM25Okapi(tokenized_corpus)

    # Persist
    with open(bm25_test_path, "wb") as f:
        pickle.dump({"bm25": bm25, "documents": sample_docs, "tokenized_corpus": tokenized_corpus}, f)

    retriever = HybridRetriever(bm25_path=bm25_test_path)
    sparse_results = retriever.sparse_search("refunds and returns", k=2)

    assert len(sparse_results) > 0
    # Top result should be the returns document
    assert "Returns and refunds" in sparse_results[0].page_content
    assert sparse_results[0].metadata["source"] == "returns.md"
    assert sparse_results[0].metadata["bm25_score"] > 0
    assert sparse_results[0].metadata["sparse_rank"] == 1


def test_bm25_missing_file_graceful_fallback(tmp_path):
    """Verifies that a missing BM25 index returns an empty list without crashing."""
    non_existent_path = str(tmp_path / "does_not_exist.pkl")
    retriever = HybridRetriever(bm25_path=non_existent_path)
    results = retriever.sparse_search("any query", k=10)
    assert results == []


# --- 3. Local Reranking (FlashRank) Tests ---

def test_flashrank_reranker_top_4_selection():
    """Verifies that FlashRank selects top-4 chunks with relevance scores."""
    retriever = HybridRetriever(final_top_k=4)

    mock_ranker = MagicMock()
    # Mock ranker returning 5 passages with scores
    mock_ranker.rerank.return_value = [
        {"id": 1, "text": "Passage 1 - Most Relevant", "score": 0.95, "meta": {"source": "p1.pdf", "rrf_score": 0.03}},
        {"id": 2, "text": "Passage 2 - Highly Relevant", "score": 0.88, "meta": {"source": "p2.pdf", "rrf_score": 0.02}},
        {"id": 3, "text": "Passage 3 - Relevant", "score": 0.75, "meta": {"source": "p3.pdf", "rrf_score": 0.015}},
        {"id": 4, "text": "Passage 4 - Moderate", "score": 0.60, "meta": {"source": "p4.pdf", "rrf_score": 0.01}},
        {"id": 5, "text": "Passage 5 - Low Relevance", "score": 0.20, "meta": {"source": "p5.pdf", "rrf_score": 0.005}},
    ]

    candidate_docs = [
        Document(page_content=f"Passage {i}", metadata={"source": f"p{i}.pdf"})
        for i in range(1, 6)
    ]

    with patch.object(retriever, "_get_ranker", return_value=mock_ranker):
        results = retriever.rerank("What is the policy?", candidate_docs, top_k=4)

        assert len(results) == 4
        assert results[0]["content"] == "Passage 1 - Most Relevant"
        assert results[0]["score"] == 0.95
        assert results[0]["metadata"]["source"] == "p1.pdf"
        assert results[3]["score"] == 0.60
        # 5th passage should have been truncated by top_k=4
        assert not any(r["content"] == "Passage 5 - Low Relevance" for r in results)


def test_flashrank_error_fallback_to_rrf():
    """Verifies fallback to RRF ordering when FlashRank raises an exception."""
    retriever = HybridRetriever(final_top_k=2)

    candidate_docs = [
        Document(page_content="Doc 1", metadata={"source": "d1.txt", "rrf_score": 0.05}),
        Document(page_content="Doc 2", metadata={"source": "d2.txt", "rrf_score": 0.04}),
        Document(page_content="Doc 3", metadata={"source": "d3.txt", "rrf_score": 0.03}),
    ]

    with patch.object(retriever, "_get_ranker", side_effect=Exception("ONNX Runtime Error")):
        results = retriever.rerank("test query", candidate_docs, top_k=2)

        # Should fall back to top 2 by RRF order
        assert len(results) == 2
        assert results[0]["content"] == "Doc 1"
        assert results[0]["score"] == 0.05
        assert results[0]["rerank_score"] == 0.05
        assert results[0]["rrf_score"] == 0.05
        assert results[1]["content"] == "Doc 2"
        assert results[1]["score"] == 0.04
        assert results[1]["rerank_score"] == 0.04
        assert results[1]["rrf_score"] == 0.04


# --- 4. Async Non-Blocking Execution (asyncio.to_thread) Tests ---

def test_hybrid_retriever_aretrieve_async():
    """Verifies that aretrieve executes asynchronously without blocking the loop."""
    async def _test():
        retriever = HybridRetriever(dense_top_k=5, sparse_top_k=5, final_top_k=2)

        mock_dense_doc = Document(page_content="Dense Doc", metadata={"source": "dense.pdf"})
        mock_sparse_doc = Document(page_content="Sparse Doc", metadata={"source": "sparse.pdf"})

        with patch.object(retriever, "dense_search", return_value=[mock_dense_doc]) as mock_dense, \
             patch.object(retriever, "sparse_search", return_value=[mock_sparse_doc]) as mock_sparse, \
             patch.object(retriever, "rerank", return_value=[
                 {"content": "Dense Doc", "metadata": {"source": "dense.pdf"}, "score": 0.92, "rrf_score": 0.016},
                 {"content": "Sparse Doc", "metadata": {"source": "sparse.pdf"}, "score": 0.85, "rrf_score": 0.016}
             ]) as mock_rerank:

            results = await retriever.aretrieve("return policy")

            assert len(results) == 2
            assert results[0]["content"] == "Dense Doc"
            assert results[0]["score"] == 0.92
            assert results[0]["metadata"]["source"] == "dense.pdf"
            mock_dense.assert_called_once_with("return policy", 5)
            mock_sparse.assert_called_once_with("return policy", 5)
            mock_rerank.assert_called_once()

    run_async(_test())


# --- 5. LangGraph retrieve_node State Integration Tests ---

def test_retrieve_node_state_integration():
    """Verifies retrieve_node enriches AgentState with context and retrieved_chunks."""
    async def _test():
        mock_chunks = [
            {
                "content": "Return window is 30 calendar days.",
                "metadata": {"source": "policies.md", "response": "You have 30 days to return."},
                "score": 0.9754,
                "rrf_score": 0.032
            },
            {
                "content": "Defective items ship for free.",
                "metadata": {"source": "shipping.md"},
                "score": 0.8120,
                "rrf_score": 0.016
            }
        ]

        mock_retriever = AsyncMock()
        mock_retriever.aretrieve = AsyncMock(return_value=mock_chunks)

        with patch("main.get_hybrid_retriever", return_value=mock_retriever):
            state: AgentState = {
                "query": "How do I return a damaged product?",
                "user_query": "How do I return a damaged product?",
                "masked_query": "How do I return a damaged product?",
                "intent": "safe_rag",
                "route_decision": None,
                "context": [],
                "retrieved_chunks": [],
                "response": "",
                "needs_escalation": False,
                "human_feedback": None,
                "order_data": None
            }

            result_state = await retrieve_node(state)

            assert "context" in result_state
            assert "retrieved_chunks" in result_state
            assert len(result_state["retrieved_chunks"]) == 2
            assert result_state["retrieved_chunks"][0]["score"] == 0.9754

            # Verify context string formatting includes source attribution, rerank score, and suggested response
            first_ctx = result_state["context"][0]
            assert "[Source: policies.md | Score: 0.9754]" in first_ctx
            assert "Return window is 30 calendar days." in first_ctx
            assert "Suggested Response: You have 30 days to return." in first_ctx

            second_ctx = result_state["context"][1]
            assert "[Source: shipping.md | Score: 0.8120]" in second_ctx
            assert "Defective items ship for free." in second_ctx

    run_async(_test())
