FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=7860 \
    FASTEMBED_CACHE_PATH=/home/user/.cache/fastembed

# Install system dependencies (curl for healthcheck and model downloads)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up dedicated user (UID 1000) for Hugging Face Spaces and Render compatibility
RUN useradd -m -u 1000 user && \
    mkdir -p /app/data /app/chroma_db /home/user/.cache && \
    chown -R user:user /app /home/user

# Install Python dependencies (Pure ONNX runtime + FastAPI + ChromaDB + LangGraph, no multi-GB PyTorch/CUDA)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY server.py main.py ingest.py config.py Customer_Support_Training_Dataset.csv ./
COPY schemas/ ./schemas/
COPY utils/ ./utils/
COPY docs/ ./docs/
COPY evals/ ./evals/

# Ensure all application files and home directory are owned by user
RUN chown -R user:user /app /home/user

# Switch to non-root user (UID 1000)
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Pre-bake SQLite DB, ChromaDB, BM25 index, and ONNX all-MiniLM-L6-v2 / FlashRank model caches during build time
RUN python ingest.py

# Expose default port (7860 for HF Spaces, dynamically overridable by Render / Cloud Run via $PORT)
EXPOSE 7860

# Healthcheck probing FastAPI documentation endpoint on active PORT
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-7860}/docs || exit 1

# Start non-blocking FastAPI ASGI server respecting Render/HF PORT environment variable
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}"]
