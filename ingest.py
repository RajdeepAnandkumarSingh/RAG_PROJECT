import os
import pandas as pd
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from preprocess import load_and_preprocess

CHROMA_PATH = "chroma_db"

def ingest_data(file_path):
    # 1. Load data
    df = load_and_preprocess(file_path, sample_size=2000) # Balanced size for local test
    
    # 2. Convert to Documents
    documents = []
    for _, row in df.iterrows():
        doc = Document(
            page_content=row['text_to_embed'],
            metadata={
                "category": row['category'],
                "intent": row['intent'],
                "response": row['response']
            }
        )
        documents.append(doc)
    
    # 3. Embeddings
    print("Loading embedding model...")
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    
    # 4. ChromaDB
    print(f"Creating ChromaDB at {CHROMA_PATH}...")
    if os.path.exists(CHROMA_PATH):
        import shutil
        shutil.rmtree(CHROMA_PATH) # Start fresh
        
    vector_db = Chroma.from_documents(
        documents=documents,
        embedding=embeddings,
        persist_directory=CHROMA_PATH
    )
    
    print(f"Ingestion complete. {len(documents)} documents stored.")

if __name__ == "__main__":
    CSV_PATH = "Customer_Support_Training_Dataset.csv"
    ingest_data(CSV_PATH)
