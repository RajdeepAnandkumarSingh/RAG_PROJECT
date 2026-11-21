# Nexus RAG v2.0 Engineering Rules
- **Tech Stack**: Python 3.12+, FastAPI (async), LangGraph, Pydantic v2, ChromaDB, SQLite/PostgreSQL, Redis, React (Vite + TypeScript + Tailwind).
- **Strict Constraints**:
  - Use `async def` and non-blocking I/O for all FastAPI routes and LangGraph nodes.
  - Enforce structured JSON outputs via Pydantic `BaseModel` with `.with_structured_output()`.
  - Never hardcode API keys; always read from `.env` via `pydantic-settings`.
  - Keep existing React UI styling intact while adding live SSE status updates to the Retrieval Inspector.
  - Never execute terminal or pytest commands automatically; edit files and let the user run verification commands.
- **Verification**: Always write `pytest` unit tests for new LangGraph nodes and let the user run verification commands. Never execute terminal or pytest commands automatically; edit files and let the user run verification commands.
