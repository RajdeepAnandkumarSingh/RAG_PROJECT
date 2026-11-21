# =====================================================================
# Stage 1: Build stage with dependencies and wheels
# =====================================================================
FROM python:3.12-slim AS builder

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies into user directory
RUN pip install --user --no-cache-dir -r requirements.txt

# =====================================================================
# Stage 2: Production runtime stage
# =====================================================================
FROM python:3.12-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PATH=/home/nexus/.local/bin:$PATH

# Install runtime dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root application user and persist directories
RUN useradd -m -u 1000 -s /bin/bash nexus && \
    mkdir -p /app/chroma_db /app/data && \
    chown -R nexus:nexus /app

# Copy installed python wheels from builder
COPY --from=builder --chown=nexus:nexus /root/.local /home/nexus/.local

# Copy application source code
COPY --chown=nexus:nexus . .

USER nexus

EXPOSE 8000

# Healthcheck probing FastAPI documentation endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

# Start non-blocking FastAPI ASGI server
CMD ["uvicorn", "server:server", "--host", "0.0.0.0", "--port", "8000"]
