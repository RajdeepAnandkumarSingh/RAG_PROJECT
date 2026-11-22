FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=7860

# Install system dependencies (curl for healthcheck and model downloads)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up dedicated user (UID 1000) for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user && \
    mkdir -p /app/data /app/chroma_db && \
    chown -R user:user /app

# Install Python dependencies
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

# Switch to non-root user (UID 1000 for Hugging Face Spaces)
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Pre-bake SQLite DB, ChromaDB, BM25 index, and HuggingFace/FlashRank model caches during build time
RUN python ingest.py

EXPOSE 7860

# Healthcheck probing FastAPI documentation endpoint on port 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:7860/docs || exit 1

# Start non-blocking FastAPI ASGI server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
