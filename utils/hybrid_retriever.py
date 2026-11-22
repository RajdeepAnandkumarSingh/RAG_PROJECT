import os
import re
import pickle
import hashlib
import asyncio
import logging
from typing import List, Dict, Any, Optional

from langchain_core.documents import Document
from langchain_chroma import Chroma
from utils.embeddings import FastEmbedEmbeddings

from config import settings

logger = logging.getLogger("nexus.hybrid_retriever")

try:
    from flashrank import Ranker, RerankRequest
except (ImportError, ModuleNotFoundError):
    Ranker = None

    class RerankRequest:
        def __init__(self, query: str = None, passages: Optional[List[Dict[str, Any]]] = None, **kwargs):
            self.query = query
            self.passages = passages or []

def tokenize_query(query: str) -> List[str]:
    """Tokenizes text into lowercase alphanumeric words for BM25 scoring."""
    return re.findall(r'\w+', query.lower())


class HybridRetriever:
    """
    Production Hybrid Retriever combining:
    - Dense Vector Search (ChromaDB, top-15)
    - Sparse Keyword Search (BM25Okapi, top-15)
    - Reciprocal Rank Fusion (RRF, k=60)
    - Local Reranking (FlashRank ms-marco-MiniLM-L-12-v2, top-4)
    All blocking I/O and neural ranking are wrapped in asyncio.to_thread.
    """

    def __init__(
        self,
        chroma_db: Optional[Chroma] = None,
        chroma_path: str = settings.CHROMA_PERSIST_DIRECTORY,
        collection_name: str = settings.CHROMA_COLLECTION_NAME,
        bm25_path: str = settings.BM25_INDEX_PATH,
        reranker_model: str = settings.RERANKER_MODEL,
        dense_top_k: int = 15,
        sparse_top_k: int = 15,
        rrf_k: int = 60,
        final_top_k: int = 4
    ):
        self.chroma_db = chroma_db
        self.chroma_path = chroma_path
        self.collection_name = collection_name
        self.bm25_path = bm25_path
        self.reranker_model = reranker_model
        self.dense_top_k = dense_top_k
        self.sparse_top_k = sparse_top_k
        self.rrf_k = rrf_k
        self.final_top_k = final_top_k

        self._bm25_data: Optional[Dict[str, Any]] = None
        self._ranker = None

    def _get_vector_db(self) -> Chroma:
        """Lazy access to ChromaDB."""
        if self.chroma_db is not None:
            return self.chroma_db
        embeddings = FastEmbedEmbeddings(model_name=settings.EMBEDDING_MODEL)
        self.chroma_db = Chroma(
            collection_name=self.collection_name,
            persist_directory=self.chroma_path,
            embedding_function=embeddings
        )
        return self.chroma_db

    def _load_bm25_index(self) -> Optional[Dict[str, Any]]:
        """Lazy loads persisted BM25 index and documents from pickle."""
        if self._bm25_data is not None:
            return self._bm25_data
        
        if not os.path.exists(self.bm25_path):
            logger.warning(f"BM25 index file not found at {self.bm25_path}. Sparse retrieval will return empty.")
            return None

        try:
            with open(self.bm25_path, "rb") as f:
                self._bm25_data = pickle.load(f)
            return self._bm25_data
        except Exception as e:
            logger.error(f"Failed to load BM25 index from {self.bm25_path}: {e}")
            return None

    def reload_index(self):
        """Forces in-memory reload of BM25 index and ChromaDB reference from disk."""
        self._bm25_data = None
        self.chroma_db = None
        return self._load_bm25_index()

    def _get_ranker(self):
        """Lazy initializes FlashRank local cross-encoder ranker."""
        if self._ranker is not None:
            return self._ranker
        if Ranker is None:
            logger.warning("FlashRank module is not installed. Reranking will fallback to RRF order.")
            return None
        try:
            self._ranker = Ranker(model_name=self.reranker_model)
            return self._ranker
        except Exception as e:
            logger.warning(f"Could not load FlashRank ({e}). Reranking will fallback to RRF order.")
            return None

    # --- Synchronous Blocking Retrieval Methods ---

    def dense_search(self, query: str, k: int = 15) -> List[Document]:
        """Fetches top-k dense semantic chunks from ChromaDB."""
        try:
            db = self._get_vector_db()
            docs = db.similarity_search(query, k=k)
            for idx, doc in enumerate(docs):
                if not hasattr(doc, "metadata") or doc.metadata is None:
                    doc.metadata = {}
                doc.metadata["dense_rank"] = idx + 1
            return docs
        except Exception as e:
            logger.error(f"Dense vector search failed: {e}")
            return []

    def sparse_search(self, query: str, k: int = 15) -> List[Document]:
        """Fetches top-k sparse keyword chunks using BM25."""
        bm25_data = self._load_bm25_index()
        if not bm25_data or "bm25" not in bm25_data or "documents" not in bm25_data:
            return []

        bm25 = bm25_data["bm25"]
        stored_docs = bm25_data["documents"]

        query_tokens = tokenize_query(query)
        if not query_tokens:
            return []

        try:
            scores = bm25.get_scores(query_tokens)
            # Find indices of top-k scores in descending order
            top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]

            results = []
            for rank_idx, doc_idx in enumerate(top_indices):
                score = float(scores[doc_idx])
                raw_item = stored_docs[doc_idx]
                
                # Convert dict representation to Document if needed
                if isinstance(raw_item, Document):
                    doc = Document(
                        page_content=raw_item.page_content,
                        metadata=dict(raw_item.metadata)
                    )
                else:
                    doc = Document(
                        page_content=raw_item.get("page_content", ""),
                        metadata=dict(raw_item.get("metadata", {}))
                    )

                doc.metadata["bm25_score"] = score
                doc.metadata["sparse_rank"] = rank_idx + 1
                results.append(doc)

            return results
        except Exception as e:
            logger.error(f"Sparse BM25 search failed: {e}")
            return []

    def reciprocal_rank_fusion(
        self,
        dense_docs: List[Document],
        sparse_docs: List[Document],
        k: int = 60
    ) -> List[Document]:
        """
        Merges dense and sparse result lists using Reciprocal Rank Fusion (RRF):
        RRF_Score(d) = sum(1.0 / (k + rank_m(d)))
        Deduplicates candidate documents by chunk_id or content hash.
        """
        fused_scores: Dict[str, float] = {}
        doc_store: Dict[str, Document] = {}

        def _doc_key(doc: Document) -> str:
            if doc.metadata and doc.metadata.get("chunk_id"):
                return str(doc.metadata["chunk_id"])
            return hashlib.md5(doc.page_content.strip().encode("utf-8")).hexdigest()

        # Score Dense Ranks (1-based)
        for rank_1b, doc in enumerate(dense_docs, start=1):
            key = _doc_key(doc)
            fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (k + rank_1b))
            if key not in doc_store:
                doc_store[key] = doc

        # Score Sparse Ranks (1-based)
        for rank_1b, doc in enumerate(sparse_docs, start=1):
            key = _doc_key(doc)
            fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (k + rank_1b))
            if key not in doc_store:
                doc_store[key] = doc

        # Sort candidate documents by fused score descending
        sorted_keys = sorted(fused_scores.keys(), key=lambda x: fused_scores[x], reverse=True)
        fused_results: List[Document] = []
        for key in sorted_keys:
            doc = doc_store[key]
            doc.metadata["rrf_score"] = fused_scores[key]
            fused_results.append(doc)

        return fused_results

    def rerank(
        self,
        query: str,
        candidate_docs: List[Document],
        top_k: int = 4
    ) -> List[Dict[str, Any]]:
        """
        Reranks candidate documents locally using FlashRank cross-encoder.
        Returns the top-k chunks with source metadata and relevance scores.
        If initializing or running FlashRank raises an error, logs a warning
        and gracefully returns top_k candidate documents ordered by rrf_score.
        """
        if not candidate_docs:
            return []

        try:
            ranker = self._get_ranker()
            if ranker is not None:
                passages = [
                    {
                        "id": idx,
                        "text": doc.page_content,
                        "meta": doc.metadata
                    }
                    for idx, doc in enumerate(candidate_docs)
                ]
                rerank_req = RerankRequest(query=query, passages=passages)
                ranked_passages = ranker.rerank(rerank_req)

                results = []
                for item in ranked_passages[:top_k]:
                    score_val = float(item.get("score", 0.0))
                    meta_dict = item.get("meta", {})
                    rrf_val = float(meta_dict.get("rrf_score", 0.0))

                    # Preserve ranked passage text, fallback to candidate_docs if needed
                    content = item.get("text")
                    if content is None:
                        idx = item.get("id")
                        if isinstance(idx, int) and 0 <= idx < len(candidate_docs):
                            content = candidate_docs[idx].page_content
                        else:
                            content = item.get("content", "")

                    results.append({
                        "content": content,
                        "metadata": meta_dict,
                        "score": score_val,
                        "rerank_score": score_val,
                        "rrf_score": rrf_val
                    })
                return results
            else:
                logger.warning("FlashRank ranker not available. Falling back to RRF ordering.")
        except Exception as e:
            logger.warning(f"FlashRank rerank initialization or execution failed: {e}. Falling back to RRF ordering.")

        # Fallback to RRF order if FlashRank is unavailable or fails
        sorted_candidates = sorted(
            candidate_docs,
            key=lambda d: d.metadata.get("rrf_score", 0.0) if d.metadata else 0.0,
            reverse=True
        )
        results = []
        for doc in sorted_candidates[:top_k]:
            rrf_val = float(doc.metadata.get("rrf_score", 0.0)) if doc.metadata else 0.0
            results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": rrf_val,
                "rerank_score": rrf_val,
                "rrf_score": rrf_val
            })
        return results

    # --- Async Non-Blocking Interface ---

    async def aretrieve(self, query: str) -> List[Dict[str, Any]]:
        """
        Asynchronously fetches top dense and sparse matches concurrently,
        fuses them with RRF (k=60), and reranks with FlashRank in a worker thread.
        """
        # Execute dense and sparse retrieval in parallel background threads
        dense_task = asyncio.to_thread(self.dense_search, query, self.dense_top_k)
        sparse_task = asyncio.to_thread(self.sparse_search, query, self.sparse_top_k)
        dense_docs, sparse_docs = await asyncio.gather(dense_task, sparse_task)

        # Merge with Reciprocal Rank Fusion
        fused_docs = self.reciprocal_rank_fusion(dense_docs, sparse_docs, k=self.rrf_k)

        # Execute local cross-encoder reranking in background thread
        reranked_chunks = await asyncio.to_thread(self.rerank, query, fused_docs, self.final_top_k)
        return reranked_chunks

    def retrieve(self, query: str) -> List[Dict[str, Any]]:
        """Synchronous wrapper for aretrieve."""
        dense_docs = self.dense_search(query, self.dense_top_k)
        sparse_docs = self.sparse_search(query, self.sparse_top_k)
        fused_docs = self.reciprocal_rank_fusion(dense_docs, sparse_docs, k=self.rrf_k)
        return self.rerank(query, fused_docs, self.final_top_k)
