import os
import re
import glob
import pickle
import sqlite3
import pandas as pd
from typing import List
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


def load_docs_and_pdfs(docs_dir: str = "docs") -> List[Document]:
    """
    Loads text, markdown, and PDF documents from docs_dir.
    """
    os.makedirs(docs_dir, exist_ok=True)
    loaded_docs: List[Document] = []

    # 1. Text & Markdown Files
    for ext in ("*.md", "*.txt"):
        for file_path in glob.glob(os.path.join(docs_dir, ext)):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if content.strip():
                        loaded_docs.append(Document(
                            page_content=content,
                            metadata={"source": os.path.basename(file_path), "path": file_path}
                        ))
            except Exception as e:
                print(f"[Doc Loader] Error reading {file_path}: {e}")

    # 2. PDF Files (using pypdf if available, fallback to basic read)
    for file_path in glob.glob(os.path.join(docs_dir, "*.pdf")):
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            full_text = []
            for idx, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    full_text.append(page_text)
            if full_text:
                loaded_docs.append(Document(
                    page_content="\n\n".join(full_text),
                    metadata={"source": os.path.basename(file_path), "path": file_path}
                ))
        except ImportError:
            print("[Doc Loader] Notice: 'pypdf' not installed. Skipping PDF parsing.")
        except Exception as e:
            print(f"[Doc Loader] Error reading PDF {file_path}: {e}")

    return loaded_docs


def ingest_documents_dual_index(
    docs_dir: str = "docs",
    chroma_path: str = settings.CHROMA_PERSIST_DIRECTORY,
    bm25_path: str = settings.BM25_INDEX_PATH
) -> int:
    """
    Splits documents/PDFs into chunks and builds BOTH:
    1. ChromaDB dense vector store
    2. Persisted BM25 sparse index (bm25_index.pkl)
    """
    raw_docs = load_docs_and_pdfs(docs_dir)
    if not raw_docs:
        print(f"[Dual Ingest] No documents found in '{docs_dir}'. Creating default policy...")
        # Create seed document
        default_policy_path = os.path.join(docs_dir, "enterprise_support_policies.md")
        if not os.path.exists(default_policy_path):
            with open(default_policy_path, "w", encoding="utf-8") as f:
                f.write("# Nexus Support Policies\nReturn window is 30 days.\nShipping takes 3-5 days.")
        raw_docs = load_docs_and_pdfs(docs_dir)

    # 1. Chunk documents
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", " ", ""]
    )
    chunks = text_splitter.split_documents(raw_docs)

    # Enrich metadata with unique chunk_id
    for idx, chunk in enumerate(chunks):
        src = chunk.metadata.get("source", "doc")
        chunk.metadata["chunk_id"] = f"{src}_{idx}"

    print(f"[Dual Ingest] Generated {len(chunks)} chunks from {len(raw_docs)} documents.")

    # 2. Dense Indexing: ChromaDB
    print(f"[Dual Ingest] Loading embedding model ({settings.EMBEDDING_MODEL})...")
    embeddings = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)

    print(f"[Dual Ingest] Indexing chunks into ChromaDB at {chroma_path}...")
    if os.path.exists(chroma_path):
        import shutil
        shutil.rmtree(chroma_path)

    vector_db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=chroma_path
    )
    print(f"[Dual Ingest] ChromaDB dense index created with {len(chunks)} documents.")

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


if __name__ == "__main__":
    run_full_ingestion()
