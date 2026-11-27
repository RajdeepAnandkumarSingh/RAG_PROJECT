import os
import re
import glob
import pickle
import sqlite3
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
import pandas as pd
from langchain_chroma import Chroma
from utils.embeddings import FastEmbedEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from rank_bm25 import BM25Okapi

from config import settings
from utils.auth import init_auth_db, seed_demo_users
from utils.order_db import init_orders_table
from utils.hybrid_retriever import get_bm25_path

TENANT_SEED_DOCS = {
    "org_amazon": {
        "dir": "docs/tenants/amazon",
        "filename": "amazon_return_policy.md",
        "content": (
            "# Amazon Support Return & Refund Policy\n\n"
            "## 30-Day Electronics Return Window\n"
            "Amazon Support provides a **30-day electronics return window** from the date of delivery "
            "for eligible consumer electronics, smart home devices (including Echo and Fire hardware), "
            "laptops, and accessories.\n\n"
            "- **Condition Requirements**: Returned electronics must include all original accessories, "
            "power adapters, and manufacturer packaging.\n"
            "- **Amazon Prime Logistics Pickup**: Prime-eligible returns qualify for free doorstep pickup "
            "or drop-off at Amazon Hub Locker locations.\n"
            "- **Refund Timeline**: Refunds are credited back to the original payment method within "
            "**3 to 5 business days** after carrier scan or inspection.\n"
            "- **Order Tracking**: Live shipment updates for Amazon orders are managed through Amazon Prime Logistics.\n"
        ),
    },
    "org_flipkart": {
        "dir": "docs/tenants/flipkart",
        "filename": "flipkart_return_policy.md",
        "content": (
            "# Flipkart Support Return & Replacement Policy\n\n"
            "## 7-Day Replacement Guarantee\n"
            "Flipkart Support provides a **7-day replacement guarantee** from the date of delivery "
            "for eligible electronics, smartwatches, audio devices, and mobile accessories.\n\n"
            "- **Replacement Eligibility**: Defective, damaged, or mismatched items reported within 7 calendar days "
            "are eligible for an instant replacement or pickup via **Ekart Logistics**.\n"
            "- **Open-Box Inspection**: High-value electronics delivered via Ekart Logistics may include "
            "Open-Box Delivery verification at the doorstep.\n"
            "- **Refund Timeline**: When a replacement unit is out of stock, refunds are processed to the original "
            "payment method or Flipkart Gift Card within **5 to 7 business days** after Ekart pickup.\n"
            "- **Order Tracking**: Live delivery updates for Flipkart orders are tracked through Ekart Logistics.\n"
        ),
    },
}

def tokenize_corpus_text(text: str) -> List[str]:
    """Tokenizes text into lowercase alphanumeric tokens for BM25."""
    return re.findall(r'\w+', text.lower())

def ingest_csv_to_sqlite(
    csv_path: str = "Customer_Support_Training_Dataset.csv",
    db_path: str = settings.SQLITE_DB_PATH
) -> int:
    """
    Loads Customer_Support_Training_Dataset.csv into a clean SQLite database
    (data/nexus_structured.db) under table 'support_tickets' with B-Tree indexes.
    """
    if not os.path.exists(csv_path):
        print(f"[SQLite Ingest] Warning: CSV not found at {csv_path}. Skipping.")
        return 0

    print(f"[SQLite Ingest] Reading CSV from {csv_path}...")
    df = pd.read_csv(csv_path)

    # Clean rows with missing critical information
    initial_len = len(df)
    df = df.dropna(subset=['instruction', 'response', 'intent'])
    print(f"[SQLite Ingest] Cleaned dataset from {initial_len} to {len(df)} records.")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    print(f"[SQLite Ingest] Storing structured data in {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create table with primary key and clean schema
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flags TEXT,
            instruction TEXT NOT NULL,
            category TEXT,
            intent TEXT NOT NULL,
            response TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Populate table
    df[['flags', 'instruction', 'category', 'intent', 'response']].to_sql(
        'support_tickets',
        conn,
        if_exists='replace',
        index=False
    )

    # Create indexes for fast filtering and intent lookup
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tickets_intent ON support_tickets(intent);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tickets_category ON support_tickets(category);")
    conn.commit()
    conn.close()

    print(f"[SQLite Ingest] Successfully populated {len(df)} records into {db_path}.")
    return len(df)


def load_docs_and_pdfs(
    docs_dirs: Optional[Union[str, List[str]]] = None,
    org_id: str = "org_nexus",
) -> List[Document]:
    """
    Loads text, markdown, and PDF documents from docs/ and data/ directories.
    Authoritative single source of truth for Nexus Enterprise is docs/enterprise_support_policies.md.
    Excludes tenant-specific directories when loading baseline Nexus Enterprise docs.
    """
    # 0. Clean up duplicate and test files if present
    dup_policy = Path("docs/enterprise_support_policy.md")
    if dup_policy.exists():
        try:
            dup_policy.unlink()
            print(f"[Doc Loader] Removed duplicate file: {dup_policy}")
        except Exception as e:
            print(f"[Doc Loader] Notice cleaning duplicate: {e}")

    leftover_test_upload = Path("data/uploads/cloud_migration_policy.txt")
    if leftover_test_upload.exists():
        try:
            leftover_test_upload.unlink()
            print(f"[Doc Loader] Removed leftover test upload: {leftover_test_upload}")
        except Exception as e:
            print(f"[Doc Loader] Notice cleaning test file: {e}")

    if docs_dirs is None:
        target_dirs = ["docs", "data"]
    elif isinstance(docs_dirs, str):
        target_dirs = [docs_dirs]
        if docs_dirs == "docs" and os.path.exists("data"):
            target_dirs.append("data")
    else:
        target_dirs = list(docs_dirs)

    loaded_docs: List[Document] = []
    seen_paths = set()
    is_default_org = (org_id or "org_nexus") == "org_nexus"

    for d in target_dirs:
        if not os.path.exists(d):
            continue

        # 1. Text & Markdown Files (.md, .txt)
        for ext in ("*.md", "*.txt"):
            patterns = [os.path.join(d, ext), os.path.join(d, "**", ext)]
            for pat in patterns:
                for file_path in glob.glob(pat, recursive=True):
                    norm_path = file_path.replace("\\", "/")
                    if "enterprise_support_policy.md" in norm_path and "enterprise_support_policies.md" not in norm_path:
                        continue
                    if "data/uploads/cloud_migration_policy.txt" in norm_path:
                        continue
                    if is_default_org and (
                        "/tenants/" in norm_path
                        or norm_path.startswith("docs/tenants/")
                        or "/bm25/" in norm_path
                        or "/uploads/" in norm_path
                    ):
                        continue

                    canonical_path = os.path.abspath(file_path)
                    if canonical_path in seen_paths:
                        continue
                    seen_paths.add(canonical_path)

                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        if content.strip():
                            loaded_docs.append(Document(
                                page_content=content,
                                metadata={
                                    "source": os.path.basename(file_path),
                                    "path": file_path
                                }
                            ))
                            print(f"[Doc Loader] Ingested document: {file_path}")
                    except UnicodeDecodeError:
                        try:
                            with open(file_path, "r", encoding="latin-1") as f:
                                content = f.read()
                            if content.strip():
                                loaded_docs.append(Document(
                                    page_content=content,
                                    metadata={
                                        "source": os.path.basename(file_path),
                                        "path": file_path
                                    }
                                ))
                                print(f"[Doc Loader] Ingested document (latin-1): {file_path}")
                        except Exception as e:
                            print(f"[Doc Loader] Error reading {file_path}: {e}")
                    except Exception as e:
                        print(f"[Doc Loader] Error reading {file_path}: {e}")

        # 2. PDF Files
        patterns_pdf = [os.path.join(d, "*.pdf"), os.path.join(d, "**", "*.pdf")]
        for pat in patterns_pdf:
            for file_path in glob.glob(pat, recursive=True):
                canonical_path = os.path.abspath(file_path)
                if canonical_path in seen_paths:
                    continue
                seen_paths.add(canonical_path)

                try:
                    from pypdf import PdfReader
                    reader = PdfReader(file_path)
                    full_text = []
                    for idx, page in enumerate(reader.pages):
                        page_text = page.extract_text()
                        if page_text:
                            full_text.append(page_text)
                    if full_text:
                        pdf_content = "\n\n".join(full_text)
                        loaded_docs.append(Document(
                            page_content=pdf_content,
                            metadata={
                                "source": os.path.basename(file_path),
                                "path": file_path
                            }
                        ))
                        print(f"[Doc Loader] Ingested PDF document: {file_path}")
                except ImportError:
                    print("[Doc Loader] Notice: 'pypdf' not installed. Skipping PDF parsing.")
                except Exception as e:
                    print(f"[Doc Loader] Error reading PDF {file_path}: {e}")

    return loaded_docs


def ingest_documents_dual_index(
    docs_dirs: Optional[Union[str, List[str]]] = None,
    chroma_path: str = settings.CHROMA_PERSIST_DIRECTORY,
    collection_name: str = settings.CHROMA_COLLECTION_NAME,
    bm25_path: Optional[str] = None,
    org_id: str = "org_nexus",
) -> int:
    """
    Splits documents/PDFs into chunks and builds BOTH for a specific organization (`org_id`):
    1. ChromaDB dense vector store with metadata `{"org_id": org_id, "source": filename}`
    2. Persisted per-organization BM25 sparse index (`data/bm25/{org_id}.pkl`)
    Prefixes every chunk ID with `{org_id}__{stem}__{idx}` to prevent cross-tenant overwrites.
    """
    resolved_org = (org_id or "org_nexus").strip() or "org_nexus"
    resolved_bm25_path = bm25_path or get_bm25_path(resolved_org)

    raw_docs = load_docs_and_pdfs(docs_dirs, org_id=resolved_org)
    if not raw_docs:
        if resolved_org in TENANT_SEED_DOCS:
            seed_cfg = TENANT_SEED_DOCS[resolved_org]
            seed_dir = Path(seed_cfg["dir"])
            seed_dir.mkdir(parents=True, exist_ok=True)
            seed_file = seed_dir / seed_cfg["filename"]
            if not seed_file.exists():
                seed_file.write_text(seed_cfg["content"], encoding="utf-8")
            raw_docs = load_docs_and_pdfs([str(seed_dir)], org_id=resolved_org)
        else:
            print(f"[Dual Ingest] No documents found for org={resolved_org}. Creating default policy...")
            os.makedirs("docs", exist_ok=True)
            default_policy_path = os.path.join("docs", "enterprise_support_policies.md")
            if not os.path.exists(default_policy_path):
                with open(default_policy_path, "w", encoding="utf-8") as f:
                    f.write("# Nexus Support Policies\nReturn window is 30 days.\nShipping takes 3-5 days.")
            raw_docs = load_docs_and_pdfs("docs", org_id=resolved_org)

    # 1. Chunk documents
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", " ", ""]
    )
    chunks = text_splitter.split_documents(raw_docs)

    # Stamp every chunk with org_id, source filename, and tenant-namespaced chunk_id
    chunk_ids = []
    for idx, chunk in enumerate(chunks):
        filepath_str = chunk.metadata.get("path") or chunk.metadata.get("source", "doc")
        filename = os.path.basename(filepath_str)
        stem = Path(filepath_str).stem
        chunk_id = f"{resolved_org}__{stem}__{idx}"
        chunk.metadata["org_id"] = resolved_org
        chunk.metadata["source"] = chunk.metadata.get("source") or filename
        chunk.metadata["chunk_id"] = chunk_id
        chunk_ids.append(chunk_id)

    print(f"[Dual Ingest] Generated {len(chunks)} chunks for org='{resolved_org}' from {len(raw_docs)} documents.")

    # 2. Dense Indexing: ChromaDB
    print(f"[Dual Ingest] Loading FastEmbed ONNX embedding model ({settings.EMBEDDING_MODEL})...")
    embeddings = FastEmbedEmbeddings(model_name=settings.EMBEDDING_MODEL)

    print(f"[Dual Ingest] Indexing chunks into ChromaDB at {chroma_path} (collection: {collection_name}, org: {resolved_org})...")
    try:
        vector_db = Chroma(
            collection_name=collection_name,
            persist_directory=chroma_path,
            embedding_function=embeddings
        )
        # Safely clear stale entries ONLY for this org_id (preserving other tenants)
        try:
            if resolved_org == "org_nexus":
                existing = vector_db.get(include=["metadatas"])
                ids_to_delete = [
                    doc_id
                    for doc_id, meta in zip(existing.get("ids", []), existing.get("metadatas", []))
                    if not meta or not meta.get("org_id") or meta.get("org_id") == resolved_org
                ]
                if ids_to_delete:
                    vector_db.delete(ids=ids_to_delete)
            else:
                vector_db._collection.delete(where={"org_id": resolved_org})
        except Exception:
            existing = vector_db.get(where={"org_id": resolved_org})
            if existing and existing.get("ids"):
                vector_db.delete(ids=existing["ids"])
        vector_db.add_documents(chunks, ids=chunk_ids)
    except Exception as e:
        print(f"[Dual Ingest] Chroma collection notice ({e}). Creating from documents...")
        vector_db = Chroma.from_documents(
            documents=chunks,
            ids=chunk_ids,
            embedding=embeddings,
            persist_directory=chroma_path,
            collection_name=collection_name
        )
    print(f"[Dual Ingest] ChromaDB dense index updated with {len(chunks)} documents for '{resolved_org}'.")

    # 3. Sparse Indexing: Per-Org BM25
    print(f"[Dual Ingest] Building BM25 index for org='{resolved_org}'...")
    tokenized_corpus = [tokenize_corpus_text(doc.page_content) for doc in chunks]
    bm25 = BM25Okapi(tokenized_corpus)

    bm25_parent = os.path.dirname(resolved_bm25_path)
    if bm25_parent:
        os.makedirs(bm25_parent, exist_ok=True)
    bm25_payload = {
        "org_id": resolved_org,
        "bm25": bm25,
        "documents": [
            {
                "page_content": doc.page_content,
                "metadata": doc.metadata
            }
            for doc in chunks
        ],
        "tokenized_corpus": tokenized_corpus
    }

    with open(resolved_bm25_path, "wb") as f:
        pickle.dump(bm25_payload, f)
    print(f"[Dual Ingest] BM25 sparse index persisted to {resolved_bm25_path}.")

    try:
        from main import reload_retriever_indices
        reload_retriever_indices(resolved_org)
    except Exception:
        pass

    return len(chunks)


def ensure_tenant_seed_docs_files() -> None:
    """Ensures pre-seeded Amazon and Flipkart policy markdown files exist on disk."""
    for org_id, cfg in TENANT_SEED_DOCS.items():
        seed_dir = Path(cfg["dir"])
        seed_dir.mkdir(parents=True, exist_ok=True)
        seed_file = seed_dir / cfg["filename"]
        if not seed_file.exists():
            seed_file.write_text(cfg["content"], encoding="utf-8")


def ensure_tenant_seed_docs_indexed(
    chroma_path: Optional[str] = None,
    collection_name: Optional[str] = None,
    bm25_dir: Optional[str] = None,
) -> None:
    """
    Idempotently ensures pre-seeded tenant policy documents (Amazon & Flipkart)
    are indexed into ChromaDB and per-org BM25 files during startup or ingestion.
    """
    ensure_tenant_seed_docs_files()
    resolved_chroma = chroma_path or settings.CHROMA_PERSIST_DIRECTORY
    resolved_collection = collection_name or settings.CHROMA_COLLECTION_NAME
    for org_id, cfg in TENANT_SEED_DOCS.items():
        bm25_file = get_bm25_path(org_id, bm25_dir=bm25_dir)
        if not os.path.exists(bm25_file):
            ingest_documents_dual_index(
                docs_dirs=[cfg["dir"]],
                chroma_path=resolved_chroma,
                collection_name=resolved_collection,
                bm25_path=bm25_file,
                org_id=org_id,
            )


def run_full_ingestion():
    """Runs structured SQLite ingestion, multi-tenant seeding, and dual dense/sparse document indexing."""
    print("=== Starting Nexus Multi-Tenant Ingestion Pipeline ===")
    # 1. Structured CSV -> SQLite
    csv_file = "Customer_Support_Training_Dataset.csv"
    ingest_csv_to_sqlite(csv_file)

    # 1b. Auth Schema, Organizations, Orders & Pre-Seeded Demo Accounts -> SQLite
    print("[Auth & Orders DB] Initializing multi-tenant tables and seeding Nexus, Amazon, and Flipkart workspaces...")
    init_auth_db()
    seed_demo_users(include_tenants=True)
    init_orders_table()

    # 2. Documents & PDFs -> ChromaDB (org-filtered) + Per-Org BM25
    ensure_tenant_seed_docs_files()
    ingest_documents_dual_index(org_id="org_nexus")
    for org_id, cfg in TENANT_SEED_DOCS.items():
        ingest_documents_dual_index(docs_dirs=[cfg["dir"]], org_id=org_id)

    # 3. Pre-cache FastEmbed ONNX embedding model for container pre-baking
    try:
        print(f"[Model Pre-bake] Pre-caching FastEmbed ONNX model ({settings.EMBEDDING_MODEL})...")
        model = FastEmbedEmbeddings(model_name=settings.EMBEDDING_MODEL)
        model.embed_query("warmup query")
        print(f"[Model Pre-bake] FastEmbed ONNX model ({settings.EMBEDDING_MODEL}) cached successfully.")
    except Exception as e:
        print(f"[Model Pre-bake] FastEmbed caching notice: {e}")

    # 4. Pre-cache FlashRank local cross-encoder model for container pre-baking
    try:
        from flashrank import Ranker
        print(f"[Model Pre-bake] Pre-caching FlashRank model ({settings.RERANKER_MODEL})...")
        Ranker(model_name=settings.RERANKER_MODEL)
        print(f"[Model Pre-bake] FlashRank model ({settings.RERANKER_MODEL}) cached successfully.")
    except Exception as e:
        print(f"[Model Pre-bake] FlashRank caching notice: {e}")

    print("=== Nexus Multi-Tenant Ingestion Pipeline Complete ===")


def append_documents_to_indices(
    chunks: List[Document],
    chroma_path: str = settings.CHROMA_PERSIST_DIRECTORY,
    collection_name: str = settings.CHROMA_COLLECTION_NAME,
    bm25_path: Optional[str] = None,
    org_id: str = "org_nexus",
) -> int:
    """
    Safely upserts tenant-tagged chunks into ChromaDB and rebuilds the organization's
    BM25 index file (`data/bm25/{org_id}.pkl`), hot-reloading the in-memory retriever.
    """
    if not chunks:
        return 0

    resolved_org = (org_id or "org_nexus").strip() or "org_nexus"
    resolved_bm25_path = bm25_path or get_bm25_path(resolved_org)

    # Ensure all chunks have org_id metadata and tenant-scoped unique chunk_ids
    chunk_ids = []
    for idx, chunk in enumerate(chunks):
        if chunk.metadata is None:
            chunk.metadata = {}
        chunk.metadata["org_id"] = resolved_org
        cid = chunk.metadata.get("chunk_id")
        if not cid:
            filepath_str = chunk.metadata.get("path") or chunk.metadata.get("source", "doc")
            stem = Path(filepath_str).stem
            cid = f"{resolved_org}__{stem}__{idx}"
        elif not str(cid).startswith(f"{resolved_org}__"):
            cid = f"{resolved_org}__{cid}"
        chunk.metadata["chunk_id"] = cid
        chunk_ids.append(cid)

    # 1. Upsert into ChromaDB safely with explicit chunk IDs and unified collection
    embeddings = FastEmbedEmbeddings(model_name=settings.EMBEDDING_MODEL)
    vector_db = Chroma(
        collection_name=collection_name,
        persist_directory=chroma_path,
        embedding_function=embeddings
    )
    vector_db.add_documents(chunks, ids=chunk_ids)

    # 2. Update Per-Org BM25 Index
    existing_docs = []
    if os.path.exists(resolved_bm25_path):
        try:
            with open(resolved_bm25_path, "rb") as f:
                payload = pickle.load(f)
                existing_docs = payload.get("documents", [])
        except Exception as e:
            print(f"[BM25] Notice: existing index load error ({e}). Starting fresh.")

    # Deduplicate by chunk_id
    existing_chunk_ids = {
        d.get("metadata", {}).get("chunk_id")
        for d in existing_docs if isinstance(d, dict) and d.get("metadata")
    }

    for chunk in chunks:
        cid = chunk.metadata.get("chunk_id")
        if not cid or cid not in existing_chunk_ids:
            existing_docs.append({
                "page_content": chunk.page_content,
                "metadata": chunk.metadata
            })
            if cid:
                existing_chunk_ids.add(cid)

    # Re-tokenize and re-fit BM25
    tokenized_corpus = [
        tokenize_corpus_text(doc["page_content"] if isinstance(doc, dict) else doc.page_content)
        for doc in existing_docs
    ]
    bm25 = BM25Okapi(tokenized_corpus)

    bm25_parent = os.path.dirname(resolved_bm25_path)
    if bm25_parent:
        os.makedirs(bm25_parent, exist_ok=True)
    bm25_payload = {
        "org_id": resolved_org,
        "bm25": bm25,
        "documents": existing_docs,
        "tokenized_corpus": tokenized_corpus
    }

    with open(resolved_bm25_path, "wb") as f:
        pickle.dump(bm25_payload, f)

    # 3. Hot-reload retriever in memory
    try:
        from main import reload_retriever_indices
        reload_retriever_indices(resolved_org)
    except Exception as e:
        print(f"[Retriever Hot-Reload] Notice: {e}")

    return len(chunks)


def generate_sample_questions_from_text(text: str, filename: str, max_q: int = 3) -> List[str]:
    """Generates 2-3 sample user queries based on document content."""
    try:
        if settings.GROQ_API_KEY:
            from langchain_groq import ChatGroq
            llm = ChatGroq(model=settings.GROQ_MODEL_ROUTER, api_key=settings.GROQ_API_KEY, temperature=0.2)
            prompt = (
                f"Based on the following document excerpt from '{filename}':\n"
                f"{text[:1500]}\n\n"
                f"Generate exactly {max_q} concise, realistic customer support queries asking about this document.\n"
                f"Return ONLY the queries, one per line, without numbering or bullets."
            )
            resp = llm.invoke(prompt)
            lines = [l.strip().lstrip("0123456789.-) ") for l in resp.content.split("\n") if l.strip()]
            valid = [l for l in lines if len(l) > 10]
            if len(valid) >= 2:
                return valid[:max_q]
    except Exception:
        pass

    clean_name = Path(filename).stem.replace("_", " ").title()
    return [
        f"What are the main policies outlined in {clean_name}?",
        f"Can you summarize the key guidelines in {clean_name}?",
        f"What should I do if an issue occurs according to {clean_name}?"
    ][:max_q]


def generate_sample_questions_from_df(df: pd.DataFrame, table_name: str, filename: str, max_q: int = 3) -> List[str]:
    """Generates 2-3 sample queries for uploaded structured datasets."""
    cols = [str(c) for c in df.columns]
    col_str = ", ".join(cols[:6])
    
    try:
        if settings.GROQ_API_KEY:
            from langchain_groq import ChatGroq
            llm = ChatGroq(model=settings.GROQ_MODEL_ROUTER, api_key=settings.GROQ_API_KEY, temperature=0.2)
            sample_preview = df.head(3).to_string(index=False)
            prompt = (
                f"A dataset '{table_name}' from '{filename}' has columns: {col_str}.\n"
                f"Sample rows:\n{sample_preview}\n\n"
                f"Generate exactly {max_q} realistic user support or analysis queries asking about this data.\n"
                f"Return ONLY the questions, one per line, without numbering or bullets."
            )
            resp = llm.invoke(prompt)
            lines = [l.strip().lstrip("0123456789.-) ") for l in resp.content.split("\n") if l.strip()]
            valid = [l for l in lines if len(l) > 10]
            if len(valid) >= 2:
                return valid[:max_q]
    except Exception:
        pass

    clean_title = table_name.replace("upload_", "").replace("_", " ").title()
    return [
        f"Show me the records in {clean_title}.",
        f"What columns and metrics are tracked in {clean_title}?",
        f"Summarize the latest status in {clean_title}."
    ][:max_q]


def process_uploaded_file(
    file_path: Path,
    filename: str,
    org_id: str = "org_nexus",
    chroma_path: Optional[str] = None,
    collection_name: Optional[str] = None,
    bm25_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Processes an uploaded organization file (.pdf, .xlsx, .xls, .csv, .md, .txt) scoped to `org_id`:
    - .pdf, .md, .txt: chunk, stamp org_id metadata, upsert to ChromaDB, update data/bm25/{org_id}.pkl, hot-reload retriever.
    - .csv, .xlsx, .xls: ingest to SQLite data/nexus_structured.db as `upload_{org_id}_{table_name}`, index schema/row summary.
    - Generates 2-3 sample suggested questions.
    """
    resolved_org = re.sub(r"[^a-zA-Z0-9_]", "_", (org_id or "org_nexus").strip()) or "org_nexus"
    resolved_chroma = chroma_path or settings.CHROMA_PERSIST_DIRECTORY
    resolved_collection = collection_name or settings.CHROMA_COLLECTION_NAME
    resolved_bm25 = bm25_path or get_bm25_path(resolved_org)
    ext = file_path.suffix.lower()

    if ext in (".md", ".txt", ".pdf"):
        raw_text = ""
        if ext in (".md", ".txt"):
            try:
                raw_text = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                raw_text = file_path.read_text(encoding="latin-1")
        elif ext == ".pdf":
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(file_path))
                pages = [p.extract_text() or "" for p in reader.pages]
                raw_text = "\n\n".join([t for t in pages if t.strip()])
            except Exception as e:
                print(f"[Upload] PDF extraction error: {e}")
                raw_text = ""

        if not raw_text.strip():
            raw_text = f"Document uploaded: {filename}."

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
            separators=["\n\n", "\n", " ", ""]
        )
        doc = Document(
            page_content=raw_text,
            metadata={"org_id": resolved_org, "source": filename, "path": str(file_path)},
        )
        chunks = text_splitter.split_documents([doc])
        for idx, chunk in enumerate(chunks):
            chunk.metadata["org_id"] = resolved_org
            chunk.metadata["chunk_id"] = f"{resolved_org}__{file_path.stem}__{idx}"
            chunk.metadata["source"] = filename

        indexed_count = append_documents_to_indices(
            chunks,
            chroma_path=resolved_chroma,
            collection_name=resolved_collection,
            bm25_path=resolved_bm25,
            org_id=resolved_org,
        )
        suggested = generate_sample_questions_from_text(raw_text, filename)

        return {
            "status": "success",
            "filename": filename,
            "file_type": ext,
            "chunks_indexed": indexed_count,
            "tables_created": [],
            "suggested_prompts": suggested,
            "message": f"Successfully indexed {indexed_count} chunks from {filename} into ChromaDB and BM25 for {resolved_org}."
        }

    elif ext in (".csv", ".xlsx", ".xls"):
        tables_created = []
        summary_docs = []
        sample_df_for_prompts = None
        base_clean = re.sub(r'[^a-zA-Z0-9_]', '_', file_path.stem.lower()).strip('_')

        sqlite_parent = os.path.dirname(settings.SQLITE_DB_PATH)
        if sqlite_parent:
            os.makedirs(sqlite_parent, exist_ok=True)
        conn = sqlite3.connect(settings.SQLITE_DB_PATH)

        try:
            if ext == ".csv":
                df = pd.read_csv(file_path)
                table_name = f"upload_{resolved_org}_{base_clean}"
                df.to_sql(table_name, conn, if_exists="replace", index=False)
                tables_created.append(table_name)
                sample_df_for_prompts = df

                summary_text = (
                    f"Structured Table: {table_name}\n"
                    f"Source File: {filename}\n"
                    f"Total Rows: {len(df)}\n"
                    f"Columns: {', '.join(df.columns.astype(str))}\n\n"
                    f"Sample Rows:\n{df.head(5).to_string(index=False)}"
                )
                summary_docs.append(Document(
                    page_content=summary_text,
                    metadata={
                        "org_id": resolved_org,
                        "source": filename,
                        "table_name": table_name,
                        "chunk_id": f"{resolved_org}__{table_name}_summary",
                        "type": "structured_table"
                    }
                ))

            elif ext in (".xlsx", ".xls"):
                excel_file = pd.ExcelFile(file_path, engine="openpyxl" if ext == ".xlsx" else None)
                for sheet in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name=sheet)
                    sanitized_sheet = re.sub(r'[^a-zA-Z0-9_]', '_', str(sheet).lower()).strip('_')
                    table_name = f"upload_{resolved_org}_{base_clean}_{sanitized_sheet}"
                    df.to_sql(table_name, conn, if_exists="replace", index=False)
                    tables_created.append(table_name)
                    if sample_df_for_prompts is None:
                        sample_df_for_prompts = df

                    summary_text = (
                        f"Structured Table: {table_name} (Sheet: {sheet})\n"
                        f"Source File: {filename}\n"
                        f"Total Rows: {len(df)}\n"
                        f"Columns: {', '.join(df.columns.astype(str))}\n\n"
                        f"Sample Rows:\n{df.head(5).to_string(index=False)}"
                    )
                    summary_docs.append(Document(
                        page_content=summary_text,
                        metadata={
                            "org_id": resolved_org,
                            "source": filename,
                            "table_name": table_name,
                            "sheet": str(sheet),
                            "chunk_id": f"{resolved_org}__{table_name}_summary",
                            "type": "structured_table"
                        }
                    ))
            conn.commit()
        finally:
            conn.close()

        indexed_count = append_documents_to_indices(
            summary_docs,
            chroma_path=resolved_chroma,
            collection_name=resolved_collection,
            bm25_path=resolved_bm25,
            org_id=resolved_org,
        )
        first_table = tables_created[0] if tables_created else base_clean
        suggested = generate_sample_questions_from_df(sample_df_for_prompts, first_table, filename) if sample_df_for_prompts is not None else [
            f"What data is inside table {first_table}?",
            f"Show top rows for table {first_table}."
        ]

        return {
            "status": "success",
            "filename": filename,
            "file_type": ext,
            "chunks_indexed": indexed_count,
            "tables_created": tables_created,
            "suggested_prompts": suggested,
            "message": f"Successfully loaded {len(tables_created)} table(s) into SQLite and indexed schema summary for {resolved_org}."
        }

    else:
        raise ValueError(f"Unsupported file format '{ext}'. Allowed: .pdf, .xlsx, .xls, .csv, .md, .txt")


if __name__ == "__main__":
    run_full_ingestion()
