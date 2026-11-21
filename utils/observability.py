import os
import asyncio
from typing import Optional, Dict, Any, List
from config import settings

try:
    from langfuse.langchain import CallbackHandler
except ImportError:
    try:
        from langfuse.callback import CallbackHandler
    except ImportError:
        CallbackHandler = None


def get_langfuse_callback(
    session_id: str = "default",
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[List[str]] = None
) -> Optional[Any]:
    """
    Initializes a Langfuse CallbackHandler for LangChain and LangGraph executions.
    Reads credentials from Settings (.env).
    Returns None gracefully if credentials or the langfuse package are missing.
    """
    if CallbackHandler is None:
        return None

    public_key = settings.LANGFUSE_PUBLIC_KEY or os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = settings.LANGFUSE_SECRET_KEY or os.getenv("LANGFUSE_SECRET_KEY", "")
    host = settings.LANGFUSE_BASE_URL or os.getenv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com")

    if not public_key or not secret_key:
        return None

    try:
        meta = metadata.copy() if metadata else {}
        meta.setdefault("thread_id", session_id)
        
        handler = CallbackHandler(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
            session_id=session_id,
            metadata=meta,
            tags=tags or ["nexus-rag-v2"]
        )
        return handler
    except Exception:
        return None


def flush_langfuse(handler: Optional[Any] = None) -> None:
    """
    Synchronously flushes queued Langfuse traces cleanly without raising exceptions.
    """
    if handler is None:
        return
    try:
        if hasattr(handler, "flush") and callable(handler.flush):
            handler.flush()
        elif hasattr(handler, "langfuse") and hasattr(handler.langfuse, "flush") and callable(handler.langfuse.flush):
            handler.langfuse.flush()
    except Exception:
        pass


async def aflush_langfuse(handler: Optional[Any] = None) -> None:
    """
    Asynchronously flushes queued Langfuse traces using a worker thread
    to guarantee that responses and SSE streams are never blocked.
    """
    if handler is None:
        return
    try:
        await asyncio.to_thread(flush_langfuse, handler)
    except Exception:
        pass
