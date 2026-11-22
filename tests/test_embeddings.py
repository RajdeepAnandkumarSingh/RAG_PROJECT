import asyncio
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from utils.embeddings import FastEmbedEmbeddings, get_embeddings, HuggingFaceEmbeddings


def test_model_name_normalization():
    """Verifies that short model names are normalized to canonical fastembed identifiers."""
    emb1 = FastEmbedEmbeddings(model_name="all-MiniLM-L6-v2")
    assert emb1.model_name == "sentence-transformers/all-MiniLM-L6-v2"

    emb2 = FastEmbedEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    assert emb2.model_name == "sentence-transformers/all-MiniLM-L6-v2"

    emb_custom = FastEmbedEmbeddings(model_name="BAAI/bge-small-en-v1.5")
    assert emb_custom.model_name == "BAAI/bge-small-en-v1.5"


def test_huggingface_alias_backwards_compatibility():
    """Verifies HuggingFaceEmbeddings alias points to FastEmbedEmbeddings for zero breaking changes."""
    assert HuggingFaceEmbeddings is FastEmbedEmbeddings


def test_embed_documents_empty_list():
    """Verifies that passing an empty list returns [] immediately without initializing model."""
    emb = FastEmbedEmbeddings()
    assert emb.embed_documents([]) == []


def test_embed_documents_mocked():
    """Verifies embed_documents transforms fastembed numpy generator into List[List[float]]."""
    emb = FastEmbedEmbeddings()

    mock_vec1 = np.array([0.1, 0.2, 0.3], dtype=np.float32)
    mock_vec2 = np.array([0.4, 0.5, 0.6], dtype=np.float32)

    mock_text_embedding = MagicMock()
    mock_text_embedding.embed.return_value = [mock_vec1, mock_vec2]

    emb._model = mock_text_embedding

    result = emb.embed_documents(["First doc", "Second doc"])
    assert len(result) == 2
    assert result[0] == pytest.approx([0.1, 0.2, 0.3])
    assert result[1] == pytest.approx([0.4, 0.5, 0.6])
    assert isinstance(result[0], list)
    assert isinstance(result[1], list)
    mock_text_embedding.embed.assert_called_once_with(["First doc", "Second doc"])


def test_embed_query_mocked():
    """Verifies embed_query transforms fastembed numpy output into List[float]."""
    emb = FastEmbedEmbeddings()

    mock_vec = np.array([0.7, 0.8, 0.9], dtype=np.float32)
    mock_text_embedding = MagicMock()
    mock_text_embedding.embed.return_value = [mock_vec]

    emb._model = mock_text_embedding

    result = emb.embed_query("Search query")
    assert isinstance(result, list)
    assert result == pytest.approx([0.7, 0.8, 0.9])
    mock_text_embedding.embed.assert_called_once_with(["Search query"])


@pytest.mark.asyncio
async def test_async_embedding_methods():
    """Verifies non-blocking async embedding execution via aembed_documents and aembed_query."""
    emb = FastEmbedEmbeddings()

    mock_vec = np.array([0.2, 0.4, 0.6], dtype=np.float32)
    mock_text_embedding = MagicMock()
    mock_text_embedding.embed.return_value = [mock_vec]
    emb._model = mock_text_embedding

    query_res = await emb.aembed_query("Async query")
    assert query_res == pytest.approx([0.2, 0.4, 0.6])

    docs_res = await emb.aembed_documents(["Async doc"])
    assert len(docs_res) == 1
    assert docs_res[0] == pytest.approx([0.2, 0.4, 0.6])


def test_singleton_get_embeddings():
    """Verifies get_embeddings() helper returns a persistent singleton instance."""
    emb1 = get_embeddings()
    emb2 = get_embeddings()
    assert emb1 is emb2
    assert isinstance(emb1, FastEmbedEmbeddings)


def test_chroma_langchain_interface_compatibility():
    """Verifies that Chroma vector store accepts FastEmbedEmbeddings as embedding_function."""
    from langchain_chroma import Chroma
    from langchain_core.documents import Document

    emb = FastEmbedEmbeddings()

    # Mock the underlying fastembed model so test runs without network
    dim = 384
    mock_vec = np.zeros(dim, dtype=np.float32)
    mock_vec[0] = 1.0

    mock_text_embedding = MagicMock()
    mock_text_embedding.embed.side_effect = lambda texts: [mock_vec for _ in texts]
    emb._model = mock_text_embedding

    # In-memory ephemeral ChromaDB collection
    import uuid
    col_name = f"test_col_{uuid.uuid4().hex[:8]}"
    vector_db = Chroma(
        collection_name=col_name,
        embedding_function=emb
    )

    doc = Document(page_content="Test document for Chroma compatibility", metadata={"source": "test"})
    vector_db.add_documents([doc])

    results = vector_db.similarity_search("Test query", k=1)
    assert len(results) >= 1
    assert "Test document" in results[0].page_content
