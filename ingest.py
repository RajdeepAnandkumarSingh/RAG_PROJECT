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
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from rank_bm25 import BM25Okapi

from config import settings

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


def load_docs_and_pdfs(docs_dirs: Optional[Union[str, List[str]]] = None) -> List[Document]:
    """
    Loads text, markdown, and PDF documents from docs/ and data/ directories.
    Authoritative single source of truth is docs/enterprise_support_policies.md.
    Cleans up duplicate docs/enterprise_support_policy.md and leftover test files.
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

    for d in target_dirs:
        if not os.path.exists(d):
            continue

        # 1. Text & Markdown Files (.md, .txt)
        for ext in ("*.md", "*.txt"):
            patterns = [os.path.join(d, ext), os.path.join(d, "**", ext)]
            for pat in patterns:
                for file_path in glob.glob(pat, recursive=True):
                    # Ignore duplicate legacy file and temporary test uploads
                    norm_path = file_path.replace("\\", "/")
                    if "enterprise_support_policy.md" in norm_path and not "enterprise_support_policies.md" in norm_path:
                        continue
                    if "data/uploads/cloud_migration_policy.txt" in norm_path:
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
    bm25_path: str = settings.BM25_INDEX_PATH
) -> int:
    """
    Splits documents/PDFs from docs/ and data/ into chunks and builds BOTH:
    1. ChromaDB dense vector store (safely cleared using collection.delete without shutil.rmtree)
    2. Persisted BM25 sparse index (bm25_index.pkl)
    Prefixes every chunk ID with its filename stem (f"{filepath.stem}__{idx}") to prevent overwrites.
    """
    raw_docs = load_docs_and_pdfs(docs_dirs)
    if not raw_docs:
        print("[Dual Ingest] No documents found in 'docs/' or 'data/'. Creating default policy...")
        os.makedirs("docs", exist_ok=True)
        default_policy_path = os.path.join("docs", "enterprise_support_policies.md")
        if not os.path.exists(default_policy_path):
            with open(default_policy_path, "w", encoding="utf-8") as f:
                f.write("# Nexus Support Policies\nReturn window is 30 days.\nShipping takes 3-5 days.")
        raw_docs = load_docs_and_pdfs("docs")

    # 1. Chunk documents
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", " ", ""]
    )
    chunks = text_splitter.split_documents(raw_docs)

    # Enrich metadata with unique chunk_id prefixed by filename stem
    chunk_ids = []
    for idx, chunk in enumerate(chunks):
        filepath_str = chunk.metadata.get("path") or chunk.metadata.get("source", "doc")
        stem = Path(filepath_str).stem
        chunk_id = f"{stem}__{idx}"
        chunk.metadata["chunk_id"] = chunk_id
        chunk_ids.append(chunk_id)

    print(f"[Dual Ingest] Generated {len(chunks)} chunks from {len(raw_docs)} documents.")

    # 2. Dense Indexing: ChromaDB
    print(f"[Dual Ingest] Loading embedding model ({settings.EMBEDDING_MODEL})...")
    embeddings = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)

    print(f"[Dual Ingest] Indexing chunks into ChromaDB at {chroma_path} (collection: {collection_name})...")
    try:
        vector_db = Chroma(
            collection_name=collection_name,
            persist_directory=chroma_path,
            embedding_function=embeddings
        )
        # Safely clear stale entries from ChromaDB collection (never shutil.rmtree to prevent Windows file locks)
        try:
            vector_db._collection.delete(where={"source": {"$ne": ""}})
        except Exception:
            existing = vector_db.get()
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
    print(f"[Dual Ingest] ChromaDB dense index created with {len(chunks)} documents in '{collection_name}'.")

    # 3. Sparse Indexing: BM25
    print(f"[Dual Ingest] Building BM25 index...")
    tokenized_corpus = [tokenize_corpus_text(doc.page_content) for doc in chunks]
    bm25 = BM25Okapi(tokenized_corpus)

    # Save BM25 and serializable document metadata
    os.makedirs(os.path.dirname(bm25_path), exist_ok=True)
    bm25_payload = {
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

    with open(bm25_path, "wb") as f:
        pickle.dump(bm25_payload, f)
    print(f"[Dual Ingest] BM25 sparse index persisted to {bm25_path}.")

    try:
        from main import reload_retriever_indices
        reload_retriever_indices()
    except Exception:
        pass

    return len(chunks)


def run_full_ingestion():
    """Runs structured SQLite ingestion and dual dense/sparse document indexing."""
    print("=== Starting Nexus Ingestion Pipeline ===")
    # 1. Structured CSV -> SQLite
    csv_file = "Customer_Support_Training_Dataset.csv"
    ingest_csv_to_sqlite(csv_file)

    # 2. Documents & PDFs -> ChromaDB + BM25
    ingest_documents_dual_index()
    print("=== Nexus Ingestion Pipeline Complete ===")


def append_documents_to_indices(
    chunks: List[Document],
    chroma_path: str = settings.CHROMA_PERSIST_DIRECTORY,
    collection_name: str = settings.CHROMA_COLLECTION_NAME,
    bm25_path: str = settings.BM25_INDEX_PATH
) -> int:
    """
    Safely upserts chunks into ChromaDB and rebuilds the BM25 index file,
    hot-reloading the in-memory retriever without deleting directories or locking files.
    """
    if not chunks:
        return 0

    # Ensure all chunks have unique chunk_ids prefixed by filename stem
    chunk_ids = []
    for idx, chunk in enumerate(chunks):
        cid = chunk.metadata.get("chunk_id")
        if not cid:
            filepath_str = chunk.metadata.get("path") or chunk.metadata.get("source", "doc")
            stem = Path(filepath_str).stem
            cid = f"{stem}__{idx}"
            chunk.metadata["chunk_id"] = cid
        chunk_ids.append(cid)

    # 1. Upsert into ChromaDB safely with explicit chunk IDs and unified collection
    embeddings = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
    vector_db = Chroma(
        collection_name=collection_name,
        persist_directory=chroma_path,
        embedding_function=embeddings
    )
    vector_db.add_documents(chunks, ids=chunk_ids)

    # 2. Update BM25 Index
    existing_docs = []
    if os.path.exists(bm25_path):
        try:
            with open(bm25_path, "rb") as f:
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

    os.makedirs(os.path.dirname(bm25_path), exist_ok=True)
    bm25_payload = {
        "bm25": bm25,
        "documents": existing_docs,
        "tokenized_corpus": tokenized_corpus
    }

    with open(bm25_path, "wb") as f:
        pickle.dump(bm25_payload, f)

    # 3. Hot-reload retriever in memory
    try:
        from main import reload_retriever_indices
        reload_retriever_indices()
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


def process_uploaded_file(file_path: Path, filename: str) -> Dict[str, Any]:
    """
    Processes an uploaded organization file (.pdf, .xlsx, .xls, .csv, .md, .txt):
    - .pdf, .md, .txt: chunk, upsert to ChromaDB, update BM25, hot-reload retriever.
    - .csv, .xlsx, .xls: ingest to SQLite data/nexus_structured.db, index schema/row summary to ChromaDB + BM25.
    - Generates 2-3 sample suggested questions.
    """
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
        doc = Document(page_content=raw_text, metadata={"source": filename, "path": str(file_path)})
        chunks = text_splitter.split_documents([doc])
        for idx, chunk in enumerate(chunks):
            chunk.metadata["chunk_id"] = f"{file_path.stem}__{idx}"
            chunk.metadata["source"] = filename

        indexed_count = append_documents_to_indices(chunks)
        suggested = generate_sample_questions_from_text(raw_text, filename)

        return {
            "status": "success",
            "filename": filename,
            "file_type": ext,
            "chunks_indexed": indexed_count,
            "tables_created": [],
            "suggested_prompts": suggested,
            "message": f"Successfully indexed {indexed_count} chunks from {filename} into ChromaDB and BM25."
        }

    elif ext in (".csv", ".xlsx", ".xls"):
        tables_created = []
        summary_docs = []
        sample_df_for_prompts = None
        base_clean = re.sub(r'[^a-zA-Z0-9_]', '_', file_path.stem.lower()).strip('_')
        
        os.makedirs(os.path.dirname(settings.SQLITE_DB_PATH), exist_ok=True)
        conn = sqlite3.connect(settings.SQLITE_DB_PATH)

        try:
            if ext == ".csv":
                df = pd.read_csv(file_path)
                table_name = f"upload_{base_clean}"
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
                    metadata={"source": filename, "table_name": table_name, "chunk_id": f"{table_name}_summary", "type": "structured_table"}
                ))

            elif ext in (".xlsx", ".xls"):
                excel_file = pd.ExcelFile(file_path, engine="openpyxl" if ext == ".xlsx" else None)
                for sheet in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name=sheet)
                    sanitized_sheet = re.sub(r'[^a-zA-Z0-9_]', '_', str(sheet).lower()).strip('_')
                    table_name = f"upload_{base_clean}_{sanitized_sheet}"
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
                        metadata={"source": filename, "table_name": table_name, "sheet": str(sheet), "chunk_id": f"{table_name}_summary", "type": "structured_table"}
                    ))
            conn.commit()
        finally:
            conn.close()

        indexed_count = append_documents_to_indices(summary_docs)
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
            "message": f"Successfully loaded {len(tables_created)} table(s) into SQLite and indexed schema summary."
        }

    else:
        raise ValueError(f"Unsupported file format '{ext}'. Allowed: .pdf, .xlsx, .xls, .csv, .md, .txt")


if __name__ == "__main__":
    run_full_ingestion()
