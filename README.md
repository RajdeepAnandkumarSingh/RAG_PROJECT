---
Title: Nexus RAG v2.0 API
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# Nexus RAG v2.0 Enterprise Customer Support Engine

[![Live AI Control Plane](https://img.shields.io/badge/Live%20AI%20Control%20Plane-Vercel%20Production-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://nexus-rag-control-plane.vercel.app)
[![FastAPI Swagger Docs](https://img.shields.io/badge/FastAPI%20Swagger%20Docs-Render%20Cloud-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://nexus-rag-backend-p9i0.onrender.com/docs)
[![Ragas Evaluation Score](https://img.shields.io/badge/Ragas%20Score-0.9404-brightgreen?style=for-the-badge&logo=target&logoColor=white)](#3-benchmark--evaluation-results)
[![Test Suite](https://img.shields.io/badge/Tests-82%20Passing-success?style=for-the-badge&logo=pytest&logoColor=white)](#4-run-pytest-verification-suite)

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Production-orange.svg)](https://langchain-ai.github.io/langgraph/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX%20Runtime-300MB%20Footprint-005CED.svg)](https://github.com/qdrant/fastembed)
[![Redis](https://img.shields.io/badge/Redis-7--alpine-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED.svg)](https://www.docker.com/)

An enterprise-grade, agentic Customer Support Retrieval-Augmented Generation (RAG) platform featuring **Split Cloud Production Architecture** (Vercel CDN + Render Container), **ONNX Runtime Memory Optimization (~300 MB RAM)**, **Redis Semantic Caching (<15ms)**, **Server-Sent Events (SSE) Live Streaming**, **Corrective RAG (CRAG)** document grading, **Human-in-the-Loop (HITL)** supervisor review, and **Automated Ragas Offline Evaluation (0.9404 score)**.

> [!NOTE]
> **Production Cold-Start Notice**: The backend API is hosted on **Render's Free Tier (512 MB RAM limit)**. If the service has been inactive for $\ge 15$ minutes, the container spins down automatically. The **very first incoming request may take ~40–50 seconds** to complete its cold-start while Render provisions the container, initializes the lightweight ONNX runtime, and loads the ChromaDB and BM25 indices into memory. Subsequent requests execute with sub-second hybrid retrieval ($<850\text{ ms}$) and instant Redis semantic cache hits ($<15\text{ ms}$).

---

## 🖥️ AI Control Plane UI Showcase

The Nexus RAG v2.0 AI Control Plane features an adaptive dark/light glassmorphic interface built with React, Vite, Tailwind CSS, Framer Motion, and React Flow (`@xyflow/react`). It delivers an **Inline Live SSE Pipeline Strip** (`LivePipelineStrip.jsx`), an **Interactive 4-Branch StateGraph Visualizer** (`PipelineArchitectureModal.jsx`), **Framer Motion 3D tilt spotlight cards** (`SpotlightTiltCard.jsx`), and a glassmorphic **1-Click Demo Login** modal (`AuthModal.jsx`) with RBAC controls and live `HTTP 429` cooldown countdowns.

| Dark Mode & Live SSE Retrieval Inspector | Light Mode Enterprise Control Plane | Interactive Architecture Modal |
| :---: | :---: | :---: |
| [![Dark Mode Control Plane](docs/screenshots/control-plane-dark.png)](docs/screenshots/control-plane-dark.png) | [![Light Mode Control Plane](docs/screenshots/control-plane-light.png)](docs/screenshots/control-plane-light.png) | [![Architecture Modal](docs/screenshots/architecture-modal.png)](docs/screenshots/architecture-modal.png) |
| **Dark Mode & Retrieval Inspector**<br>Inline live SSE pipeline strip, telemetry badges (`HIT 96.5%` vs `MISS`), Top-4 FlashRank neural reranking scores, and RBAC-gated HITL supervisor override input. | **Light Mode Enterprise View**<br>Supervisor-gated multi-format knowledge upload modal (`.pdf`, `.xlsx`, `.csv`, `.md`), Framer Motion 3D spotlight test cards (`TEST-01`–`TEST-08`), and glassmorphic 1-Click Demo Login. | **Interactive React Flow Visualizer**<br>Live `@xyflow/react` 4-branch StateGraph visualizer illustrating safe refusal guardrails, SQLite order tool lookups, CRAG self-correction cycles, and HITL interrupts. |

---

## ☁️ Production Architecture & Memory Optimization

Nexus RAG v2.0 is engineered for enterprise-grade reliability and deployed across a high-performance **Split Cloud Architecture**:

```mermaid
flowchart LR
    subgraph ClientLayer["Frontend Edge (Vercel CDN)"]
        UI["React 18 + Vite UI\nhttps://nexus-rag-control-plane.vercel.app"]
        UI -->|EventSource SSE Stream| Gateway
    end

    subgraph CloudLayer["Backend Container (Render Cloud - 512 MB Tier)"]
        Gateway["FastAPI ASGI Gateway\nhttps://nexus-rag-backend-p9i0.onrender.com"]
        
        subgraph Engine["Optimized In-Memory Runtime (~300 MB RAM)"]
            Router["LangGraph Intent Router"]
            ONNX["ONNX FastEmbed\n(all-MiniLM-L6-v2)"]
            Chroma["ChromaDB Vector Store"]
            BM25["BM25Okapi Sparse Index"]
            SQLite["SQLite Structured DB"]
            FlashRank["FlashRank Reranker"]
        end

        Gateway --> Router
        Router --> ONNX
        Router --> Chroma
        Router --> BM25
        Router --> SQLite
        Router --> FlashRank
    end

    subgraph ObservabilityLayer["External Cloud Services"]
        Redis["Upstash / Managed Redis\n(Semantic Cache <15ms)"]
        Groq["Groq Cloud LPU\n(gpt-oss-20b & gpt-oss-120b)"]
        Langfuse["Langfuse Cloud\n(Distributed Tracing)"]
    end

    Gateway <--> Redis
    Router <--> Groq
    Gateway --> Langfuse
```

### 1. Split Cloud Architecture

- **Frontend on Vercel Global Edge CDN**: Hosted at [`https://nexus-rag-control-plane.vercel.app`](https://nexus-rag-control-plane.vercel.app). Compiled via Vite into static assets distributed across Vercel's global edge network, delivering instant UI load times, zero client cold starts, unbuffered Server-Sent Events (SSE) streaming reception, and dark/light mode persistence.
- **Backend on Render Docker Cloud**: Hosted at [`https://nexus-rag-backend-p9i0.onrender.com`](https://nexus-rag-backend-p9i0.onrender.com). Executes the non-blocking FastAPI ASGI backend, LangGraph state machine, local ChromaDB collection, BM25Okapi sparse index, and SQLite structured order database inside an optimized Linux Docker container.

### 2. ONNX Runtime Memory Optimization (~300 MB Footprint)

Hosting Python RAG applications on modern cloud container tiers (such as Render's 512 MB free tier) typically presents a fatal memory bottleneck:

| Optimization Vector | Traditional PyTorch RAG Stack | Nexus RAG v2.0 (ONNX + Decoupled) | Impact / Efficiency Gain |
| :--- | :---: | :---: | :---: |
| **Embedding Engine** | `sentence-transformers` (PyTorch + CUDA) | `fastembed` (ONNX Runtime C++ backend) | **Zero PyTorch/CUDA overhead** |
| **Runtime Resident RAM (RSS)** | `~1,100 MB – 1,400 MB` | **`~300 MB`** | **~73% memory reduction** (Runs comfortably within 512 MB) |
| **Docker Image Size** | `~3.8 GB` | **`~850 MB`** | **77% smaller container image** |
| **Evaluation Packages** | `ragas`, `datasets`, `huggingface-hub` bundled | Decoupled into `requirements-eval.txt` | Production image stripped of unused evaluation bloat |
| **Embedding Accuracy / Dims** | 384 dims (`all-MiniLM-L6-v2`) | 384 dims (`all-MiniLM-L6-v2`) | **Exact mathematical parity (0.9404 Ragas benchmark)** |
| **Cloud Tier Compatibility** | ❌ Fails (Instant `OOMKilled` Exit Code 137) | ✅ **Stable on Render 512 MB tier** | **Zero-cost, highly scalable production hosting** |

#### Why This Optimization Was Essential:
1. **Eliminating the PyTorch / CUDA Overhead**: Standard `sentence-transformers` pulls in multi-gigabyte PyTorch binaries, NVIDIA CUDA runtimes, and heavy CPython dynamic libraries that consume over 1 GB of resident memory immediately upon import.
2. **Quantized ONNX Execution via FastEmbed**: By migrating to `fastembed`, embeddings run on the C++ ONNX Runtime CPU execution provider using quantized `sentence-transformers/all-MiniLM-L6-v2` weights. This drops the base embedding engine footprint to under 120 MB without altering vector dimensions (384-dim) or cosine similarity metrics.
3. **Decoupled Evaluation Dependencies**: Offline evaluation frameworks (`ragas`, `datasets`, PyArrow) are isolated in `requirements-eval.txt`. Production Docker images only install `requirements.txt`, preventing hundreds of megabytes of offline benchmarking libraries from polluting production RAM.
4. **Pre-Baked Build-Time Model Caching**: The Dockerfile invokes `RUN python ingest.py` during image compilation. This pre-downloads and bakes the ONNX weights, ChromaDB vector store, BM25 pickle, and SQLite database directly into the image filesystem, avoiding cold runtime network downloads.

---

## 1. System Pipeline Architecture

```mermaid
flowchart TD
    Client["Client Interface (React Vite + 1-Click Demo AuthModal)"] --> AuthBoundary["FastAPI Auth & RBAC Security Gateway"]

    subgraph AuthLayer["Stage 0: Auth, Rate Limiting & RBAC Layer (utils/auth.py)"]
        AuthBoundary --> AuthEndpoints["POST /api/auth/* (Argon2id + HS256 JWT + Sliding-Window 429)"]
        AuthBoundary --> StreamGate["POST /api/chat/stream (Optional JWT: Guest Mode or Analyst/Supervisor Thread Tracking)"]
        AuthBoundary --> SupervisorGate["POST /api/ingest/upload & POST /api/chat/resume (Strict Supervisor RBAC Gate)"]
        SupervisorGate -- "Guest or Analyst (Non-Supervisor)" --> Denied["HTTP 401 / 403 Access Denied"]
        SupervisorGate -- "Verified Supervisor JWT" --> PrivilegedOps["Knowledge Ingestion & HITL Override"]
    end

    StreamGate --> PII

    subgraph SecurityGuardrail["Stage 1: Ingestion & Guardrails (4-Branch LangGraph StateGraph)"]
        PII["PII Scrubber (Redacts Emails, Phone, Cards)"]
        PII --> Router["Groq Intent Router (openai/gpt-oss-20b)"]
    end

    Router -- "Branch 1: prompt_injection" --> SafeRefusal["Safe Refusal Node (Refuses System Prompt Jailbreaks)"]
    Router -- "Branch 2: escalation_hitl" --> HITL["HITL Supervisor Pause (Legal, High Disputes, Complaints)"]
    PrivilegedOps -. "Resumes Paused Checkpoint" .-> HITL
    Router -- "Branch 3: live_order_tool" --> OrderDB["SQLite Order Tool (Order Status, Tracking, Items)"]

    subgraph SemanticCaching["Stage 2: Redis Semantic Cache (Branch 4: safe_rag)"]
        Router -- "Branch 4: safe_rag" --> CacheCheck{"Redis Semantic Cache (Cosine Sim >= 0.92)"}
        CacheCheck -- "HIT (< 15ms)" --> SSEHit["Emit cache_hit SSE Event"]
        SSEHit --> FastPath["Bypass Retrieval & LLM Generation"]
    end

    subgraph HybridEngine["Stage 3: Hybrid Retrieval & Ranking"]
        CacheCheck -- "MISS / Offline Fallback" --> Dense["Dense Vector Search (ChromaDB all-MiniLM-L6-v2)"]
        CacheCheck -- "MISS / Offline Fallback" --> Sparse["Sparse Keyword Search (BM25Okapi)"]
        Dense --> RRF["Reciprocal Rank Fusion (RRF k=60)"]
        Sparse --> RRF
        RRF --> FlashRank["FlashRank Neural Reranker (ms-marco-MiniLM-L-12-v2, Top-4)"]
    end

    subgraph CorrectiveRAG["Stage 4: Corrective RAG (CRAG)"]
        FlashRank --> Grader["CRAG Document Relevance Grader (openai/gpt-oss-20b)"]
        Grader -- "Irrelevant (Max 1 Retry)" --> Rewrite["Query Reformulation Assistant"]
        Rewrite --> Dense
        Grader -- "Relevant" --> Generator["Groq Answer Generator (openai/gpt-oss-120b)"]
    end

    subgraph OutputObservability["Stage 5: Output & Observability"]
        Generator --> CacheSave["Async Background Write to Redis (TTL: 86400s)"]
        Generator --> StreamResponse["Server-Sent Events (SSE) Stream"]
        FastPath --> StreamResponse
        StreamResponse --> Langfuse["Langfuse Cloud Tracing"]
        StreamResponse --> Inspector["Live SSE Strip, Retrieval Inspector & React Flow Visualizer"]
    end
```

---

## 2. Core Capabilities & Production Layer

### Enterprise Auth, Rate Limiting & RBAC (`utils/auth.py`)

- **Memory-Safe Argon2id Hashing**: Configured with OWASP container-safe parameters (`19 MiB` RAM cost, `time_cost=2`, `parallelism=1`) to prevent OOM spikes on 512 MB Render containers.
- **Dual-Token HS256 JWT + Refresh Rotation**: Issues 15-minute `HS256` JWT access tokens alongside 7-day rotating refresh tokens (`HttpOnly; Secure; SameSite=None` cookies with SHA-256 hashes persisted in SQLite `refresh_sessions` and `sessionStorage` cross-origin fallback).
- **Proxy-Aware Sliding-Window Rate Limiter**: Enforces `5 logins/min`, `3 signups/hr`, and `20 refreshes/min` using Redis `ZSET` when reachable with a thread-safe in-memory `deque` fallback, returning `HTTP 429` (`Retry-After`) plus a 15-minute account lockout after 5 consecutive failed logins.
- **Guest-First + Role-Based Access Control**: Guests and `Analyst` (`user`) accounts can execute queries and all 8 showcase presets (`TEST-01`–`TEST-08`) with authenticated thread tracking in SQLite (`user_threads`), while `POST /api/ingest/upload` and `POST /api/chat/resume` strictly require `Supervisor` (`supervisor`) clearance (`HTTP 401/403` otherwise).

| Demo Role | Header Badge | Email | Password | Access Scope |
| :--- | :---: | :--- | :--- | :--- |
| **Analyst** (`user`) | `ANALYST` | `user@nexusrag.ai` | `DemoUser@2026!` | Guest-parity chat, presets `TEST-01`–`TEST-08`, SQLite thread history |
| **Supervisor** (`supervisor`) | `SUPERVISOR` | `supervisor@nexusrag.ai` | `Supervisor@2026!` | Full access including document ingestion & HITL escalation overrides |

### Interactive Control Plane, Live SSE Strip & React Flow Visualizer (`frontend/src/`)

- **Inline Live SSE Pipeline Strip (`LivePipelineStrip.jsx`)**: Streams real-time stage badges (`Guardrail`, `Semantic Cache`, `Hybrid RRF`, `FlashRank`, `CRAG Grader`, `Generator`) and active branch indicators directly above the chat input.
- **Interactive React Flow Visualizer (`PipelineArchitectureModal.jsx`)**: Uses `@xyflow/react` to render the live 4-branch LangGraph StateGraph topology with animated execution edges, node inspection details, and live latencies.
- **Glassmorphic 1-Click Demo Login (`AuthModal.jsx`)**: Supports Sign In / Create Account tabs, live 5-rule password complexity validation, `HTTP 429` countdown timers, and zero-typing 1-Click Demo buttons for both `Analyst` and `Supervisor` roles.
- **Framer Motion 3D Tilt Spotlight Cards (`SpotlightTiltCard.jsx`)**: Powers the telemetry cards and `TEST-01`–`TEST-08` scenario grid with cursor-tracked spotlight gradients.

### Redis Semantic Caching (`utils/semantic_cache.py`)

- **Neural Embedding Comparison**: Incoming queries generate 384-dimensional dense vectors using local `all-MiniLM-L6-v2` ONNX embeddings in non-blocking worker threads (`asyncio.to_thread`).
- **Cosine Similarity Threshold**: Matches cached queries with similarity $\ge 0.92$. Hits bypass ChromaDB, BM25, and LLM generation entirely, delivering responses in under 15ms.
- **Fail-Open Graceful Fallback**: If Redis is offline, disconnected, or restarting, all cache operations fail open gracefully without throwing 500 errors, guaranteeing uninterrupted local development and production continuity.
- **Configurable TTL**: Key expiration defaults to `86400` seconds (24 hours), configurable via `REDIS_URL`, `SEMANTIC_CACHE_TTL`, and `SEMANTIC_CACHE_THRESHOLD` in `config.py` and `.env`.

### Live SSE Retrieval Inspector (`frontend/src/components/RetrievalInspector.jsx`)

- Real-time pipeline state badges for **Semantic Cache** (`HIT 96.5%` vs `MISS`), **Guardrail & Routing**, **Hybrid Retrieval** (Top-4 FlashRank scored chunks), **CRAG Relevance Grader**, and **Human-in-the-Loop Override**.
- When an escalation is triggered, the HITL card activates with a live supervisor input box allowing direct agent response override without reloading the page.

### Persistent Quick-Prompt Bar (`frontend/src/App.jsx`)

- **Dual-State UX**: Displays 4 comprehensive preset scenario cards on the initial empty welcome screen, and smoothly transitions into a compact, scrollable horizontal bar of prompt chips directly above the bottom chat input box once a conversation is active (`messages.length > 0`).
- **One-Click Scenario Testing**: Seamlessly trigger demonstration scenarios (`Order Tracking`, `Security & Guardrails`, `FAQ / Return Policy`, `Escalation & HITL`) in sequence without reloading the browser page.
- **Dynamic Thread Isolation**: Clicking any preset chip clears any active HITL pause banner, cancels pending interrupts, and automatically generates a fresh `thread_id` so subsequent queries execute against a clean state.
- **Dynamic Upload Prompts**: Suggested queries generated from uploaded enterprise documents or datasets automatically append as clickable chips in the quick-prompt bar in real time.

### Multi-Format Live Organization Knowledge Upload (`server.py`, `ingest.py`)

- **Multi-Format Ingestion**: Unified asynchronous upload endpoint (`POST /api/ingest/upload`) accepting `.pdf`, `.xlsx`, `.xls`, `.csv`, `.md`, and `.txt` files.
- **Unstructured Documents (`.pdf`, `.md`, `.txt`)**:
  - Automatically parses text and chunks content with `RecursiveCharacterTextSplitter`.
  - Assigns unique, stem-prefixed chunk IDs (`f"{filepath.stem}__{idx}"`) to eliminate overwrite collisions.
  - Safely clears and upserts into the unified ChromaDB collection (`nexus_knowledge_base`) without directory deletion (`shutil.rmtree`), preventing Windows SQLite file locks.
  - Rebuilds the persisted BM25 sparse index (`data/bm25_index.pkl`) and hot-reloads the global in-memory `HybridRetriever`.
- **Structured Datasets (`.csv`, `.xlsx`, `.xls`)**:
  - Automatically loads sheets/tables into `data/nexus_structured.db` as sanitized SQLite tables using `pandas` and `openpyxl`.
  - Indexes schema definitions and sample row previews into ChromaDB and BM25 so both SQL queries and semantic search locate structured organization records.
- **AI Suggested Prompt Generation**:
  - Analyzes document excerpt or dataset schema using Groq LLM heuristics to generate 2–3 contextual customer support queries.
  - Returns suggestions in `suggested_prompts`, dynamically updating the frontend prompt bar in real time.
- **Header Upload UI**: Features a sleek, dark-themed "Upload Knowledge Base" modal with file-type validation and live indexing status badges.

### Automated Ragas Evaluation Pipeline (`evals/run_ragas.py`)

- Automated offline benchmarking using a curated golden dataset of customer support queries (`evals/golden_dataset.json`).
- Evaluated against standard industry RAG metrics using Groq (`openai/gpt-oss-120b`) as the judge LLM and local `all-MiniLM-L6-v2` embeddings:
  - **Faithfulness**: Measures factual consistency strictly grounded in retrieved policy context chunks.
  - **Answer Relevancy**: Measures completeness, adherence to user intent, and natural query mirroring (`strictness=1`).
  - **Context Precision**: Measures signal-to-noise ratio in top-ranked FlashRank reranked chunks.
- **Zero-Token Pre-Flight Verification Gate**: Evaluates all 8 generated answers before invoking the Ragas Judge LLM. If any query triggers unexpected supervisor escalation or retrieval failure, the run aborts immediately with `sys.exit(1)`, guaranteeing zero wasted Groq tokens.

---

## 3. Benchmark & Evaluation Results

### Ragas Metric Scorecard (`evals/results.json`)

Evaluated across all 8 enterprise customer support categories in the golden dataset (`evals/golden_dataset.json`):

| Metric                |   Score    | Status  | Description                                                         |
| :-------------------- | :--------: | :-----: | :------------------------------------------------------------------ |
| **Faithfulness**      | **0.9583** | ✅ PASS | Factual consistency strictly grounded in retrieved policy context   |
| **Answer Relevancy**  | **0.8732** | ✅ PASS | High alignment and natural question mirroring with customer queries |
| **Context Precision** | **0.9896** | ✅ PASS | Top-ranked signal-to-noise ratio in FlashRank reranked chunks       |
| **Composite Score**   | **0.9404** | ✅ PASS | **Overall production RAG benchmark across 8/8 evaluated queries**   |

### Per-Query Benchmark Breakdown

|   ID    | Category        | Question                                                      | Faithfulness | Answer Relevancy | Context Precision |        Status         |
| :-----: | :-------------- | :------------------------------------------------------------ | :----------: | :--------------: | :---------------: | :-------------------: |
|  **1**  | `returns`       | What is the return policy window for items purchased online?  |  **1.0000**  |    **1.0000**    |    **1.0000**     |        ✅ PASS        |
|  **2**  | `shipping`      | How long does standard domestic shipping take to arrive?      |  **1.0000**  |    **0.8495**    |    **1.0000**     |        ✅ PASS        |
|  **3**  | `orders`        | Can I cancel or change an order after it has been placed?     |  **1.0000**  |    **0.6756**    |    **1.0000**     |        ✅ PASS        |
|  **4**  | `warranty`      | What warranty coverage is included with hardware products?    |  **1.0000**  |    **0.8357**    |    **1.0000**     |        ✅ PASS        |
|  **5**  | `damaged_goods` | What should I do if my package arrived damaged?               |  **0.6667**  |    **0.9868**    |    **0.9167**     |        ✅ PASS        |
|  **6**  | `international` | Do you offer international shipping, and are duties included? |  **1.0000**  |    **0.6862**    |    **1.0000**     |        ✅ PASS        |
|  **7**  | `billing`       | What payment methods are accepted on the platform?            |  **1.0000**  |    **0.9520**    |    **1.0000**     |        ✅ PASS        |
|  **8**  | `exchanges`     | How do I initiate a product exchange for a different size?    |  **1.0000**  |    **1.0000**    |    **1.0000**     |        ✅ PASS        |
| **AVG** | **Overall**     | **8 / 8 Queries Evaluated**                                   |  **0.9583**  |    **0.8732**    |    **0.9896**     | **Composite: 0.9404** |

### Latency & Token Economics

| Execution Path                  | Median Latency ($P_{50}$) | $P_{99}$ Latency | Groq Token Cost |
| :------------------------------ | :-----------------------: | :--------------: | :-------------: |
| **Semantic Cache Hit**          |         **12 ms**         |    **18 ms**     |  **0 Tokens**   |
| **Full Hybrid RAG Pipeline**    |        **840 ms**         |   **1,250 ms**   |   ~650 Tokens   |
| **CRAG Reformulated Retrieval** |       **1,420 ms**        |   **1,890 ms**   |  ~1,100 Tokens  |

---

## 4. Multi-Stage Docker & Cloud Deployment

The application supports both local Docker Compose orchestration and direct multi-cloud deployment.

### Architecture Services:

1. **`nexus-backend`**: Multi-stage Python 3.12-slim container with pre-baked ONNX models, ChromaDB collections, and BM25 indices. Probes `/docs` for container health.
2. **`nexus-frontend`**: Vite + React build served via Vercel Edge CDN or `nginx:alpine` in local docker compose with unbuffered SSE proxying.
3. **`nexus-redis`**: Lightweight Redis 7 Alpine cache container with append-only persistence.

### Persistent Volumes:

- `chroma_db`: Vector database persistent storage
- `nexus_data`: SQLite structured order DB and BM25 index storage
- `redis_data`: Redis semantic cache snapshots

---

## 5. Local Setup & Manual Verification

Per engineering constraints, run the following commands manually to install dependencies, run test suites, and launch the platform:

### 1. Environment Configuration

Create your backend `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Ensure your `GROQ_API_KEY` is populated:

```env
GROQ_API_KEY=gsk_...
GROQ_MODEL_ROUTER=openai/gpt-oss-20b
GROQ_MODEL_GENERATOR=openai/gpt-oss-120b
REDIS_URL=redis://localhost:6379/0
SEMANTIC_CACHE_TTL=86400
SEMANTIC_CACHE_THRESHOLD=0.92
```

Configure your frontend environment in `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Set the backend API URL (defaults to `http://localhost:8000` for local development, or your Render deployment URL for cloud testing):

```env
VITE_API_URL=http://localhost:8000
```

### 2. Install Dependencies

Install the lightweight, production ONNX runtime (~300 MB footprint):

```bash
pip install -r requirements.txt
```

*(Optional) For offline Ragas evaluation and dataset benchmarking, install the decoupled evaluation dependencies:*

```bash
pip install -r requirements-eval.txt
```

### 3. Build Hybrid Indices (ChromaDB + BM25)

Ingest enterprise support documentation, cache ONNX FastEmbed + FlashRank models, and build dense vector and sparse keyword indices:

```bash
python ingest.py
```

### 4. Run Pytest Verification Suite

Verify all **82 passing tests** across the unit and integration test suite:

```bash
pytest tests/ -v
```

*The test suite covers:*
- `tests/test_auth.py` (Argon2id hashing, HS256 JWT lifecycle, refresh token rotation, sliding-window 429 rate limiting, account lockout, and Supervisor RBAC gates)
- `tests/test_crag_and_hitl.py` (CRAG relevance grading, bounded query reformulation loops, and HITL interrupt/resume checkpoints)
- `tests/test_embeddings.py` (FastEmbed ONNX vector generation, model normalization, backward compatibility)
- `tests/test_guardrail_and_router.py` (PII auto-redaction, prompt injection defense, and 4-branch deterministic routing)
- `tests/test_hybrid_retriever.py` (RRF mathematics $k=60$, deduplication, score normalization, hybrid fusion)
- `tests/test_observability_and_sse.py` (SSE event streaming, Langfuse tracing hooks, HITL supervisor events)
- `tests/test_semantic_cache.py` (Redis cosine similarity $\ge 0.92$, fail-open fallback, TTL expiration)
- `tests/test_telemetry.py` (Live telemetry aggregation across RAGAS scores, ChromaDB, BM25, and SQLite)
- `tests/test_upload_and_presets.py` (Multi-format ingestion, unstructured & structured chunking, scenario isolation)

### 5. Run Automated Ragas Evaluation

Execute the offline evaluation pipeline against the golden QA dataset:

```bash
python evals/run_ragas.py
```

This executes the pre-flight gate, evaluates the 8 benchmark queries, saves `evals/results.json`, and outputs the formatted evaluation scorecard table.

### 6. Launch React Frontend Locally

In a separate terminal, launch the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

- **React Control Plane**: [http://localhost:3000](http://localhost:3000)

### 7. Launch Full Stack with Docker Compose

To build and run all services locally in production mode:

```bash
docker compose up --build -d
```

- **React Frontend**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Redis Server**: `localhost:6379`
