import json
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Any, AsyncGenerator
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from main import app as graph_app
from config import settings
from utils.observability import get_langfuse_callback, aflush_langfuse, flush_langfuse
from utils.semantic_cache import get_semantic_cache
from ingest import process_uploaded_file

server = FastAPI(
    title="Nexus RAG v2.0 API",
    description="Customer Support RAG with Langfuse Observability, SSE Streaming, Hybrid Search, FlashRank Reranker, CRAG, and HITL"
)

# Enable CORS for React frontend
server.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    thread_id: str = "default"

class ChatResponse(BaseModel):
    response: str
    intent: str
    context: List[str]
    retrieved_chunks: Optional[List[Dict[str, Any]]] = None
    status: str  # "success" or "escalated"

class ResumeRequest(BaseModel):
    thread_id: str = Field(..., description="The thread identifier of the paused conversation.")
    response: Optional[str] = Field(None, description="Direct supervisor response override.")
    feedback: Optional[str] = Field(None, description="Supervisor feedback or instructions.")

class UploadResponse(BaseModel):
    status: str
    filename: str
    file_type: str
    chunks_indexed: int
    tables_created: Optional[List[str]] = None
    suggested_prompts: List[str]
    message: str

ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".csv", ".md", ".txt"}

def format_sse(event_name: str, payload: Dict[str, Any]) -> str:
    """Formats event data into standard Server-Sent Events (SSE) string."""
    data = {"event": event_name, "stage": event_name, **payload}
    return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"

@server.post("/ask", response_model=ChatResponse)
async def ask_query(request: QueryRequest, background_tasks: BackgroundTasks):
    # 1. Semantic Cache check (Bypasses retrieval and LLM on hit)
    cache = get_semantic_cache()
    cached_result = await cache.lookup(request.query)
    if cached_result and cached_result.get("hit"):
        return ChatResponse(
            response=cached_result.get("response", ""),
            intent=cached_result.get("intent", "safe_rag"),
            context=cached_result.get("context", []),
            retrieved_chunks=cached_result.get("retrieved_chunks", []),
            status="success"
        )

    handler = get_langfuse_callback(
        session_id=request.thread_id,
        metadata={"thread_id": request.thread_id, "endpoint": "/ask"}
    )
    callbacks = [handler] if handler else []
    config = {
        "configurable": {"thread_id": request.thread_id},
        "callbacks": callbacks,
        "metadata": {"thread_id": request.thread_id, "session_id": request.thread_id}
    }
    
    try:
        # Non-blocking async invocation of the LangGraph state machine
        result = await graph_app.ainvoke(
            {"query": request.query, "user_query": request.query},
            config
        )
        
        # Check if graph paused at human_review_node interrupt
        snapshot = graph_app.get_state(config)
        status = "escalated" if (snapshot and snapshot.next) else "success"
        
        # Asynchronously cache successful safe_rag responses in the background
        if result.get("intent") == "safe_rag" and status == "success":
            background_tasks.add_task(
                cache.set,
                query=request.query,
                response=result.get("response", ""),
                intent="safe_rag",
                context=result.get("context", []),
                retrieved_chunks=result.get("retrieved_chunks", [])
            )

        if handler:
            background_tasks.add_task(flush_langfuse, handler)
            
        return ChatResponse(
            response=result.get("response", "Escalated to human supervisor."),
            intent=result.get("intent", "Unknown"),
            context=result.get("context", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            status=status
        )
    except Exception as e:
        if handler:
            background_tasks.add_task(flush_langfuse, handler)
        raise HTTPException(status_code=500, detail=str(e))

@server.post("/api/chat/stream")
@server.post("/chat/stream")
async def chat_stream(request: QueryRequest):
    """
    Asynchronous Server-Sent Events (SSE) streaming endpoint emitting structured events
    for each pipeline stage: guardrail_route, retrieval_results, crag_grade,
    hitl_paused, final_response, and done.
    """
    handler = get_langfuse_callback(
        session_id=request.thread_id,
        metadata={"thread_id": request.thread_id, "endpoint": "/api/chat/stream"}
    )
    callbacks = [handler] if handler else []
    config = {
        "configurable": {"thread_id": request.thread_id},
        "callbacks": callbacks,
        "metadata": {"thread_id": request.thread_id, "session_id": request.thread_id}
    }

    async def event_generator() -> AsyncGenerator[str, None]:
        retry_count = 0
        final_response_emitted = False
        collected_chunks = []
        collected_context = []

        try:
            # 1. Semantic Cache Check (Bypasses retrieval and LLM synthesis on hit)
            cache = get_semantic_cache()
            cached_result = await cache.lookup(request.query)
            if cached_result and cached_result.get("hit"):
                similarity = round(float(cached_result.get("similarity", 1.0)), 4)
                cached_chunks = cached_result.get("retrieved_chunks", [])
                top_chunks = cached_chunks[:4] if cached_chunks else []

                # Emit cache_hit SSE event to Retrieval Inspector UI
                yield format_sse("cache_hit", {
                    "hit": True,
                    "query": request.query,
                    "matched_query": cached_result.get("query", ""),
                    "similarity": similarity,
                    "response": cached_result.get("response", ""),
                    "chunks": top_chunks
                })

                # Emit safe_rag routing event reflecting cache bypass
                yield format_sse("guardrail_route", {
                    "classification": "safe_rag",
                    "confidence": 1.0,
                    "reasoning": f"Semantic cache hit ({similarity * 100:.1f}% match). Retrieval and LLM generation bypassed.",
                    "pii_redacted": False,
                    "detected_pii": [],
                    "masked_query": request.query
                })

                # Emit cached chunks if available
                if top_chunks:
                    yield format_sse("retrieval_results", {
                        "count": len(top_chunks),
                        "chunks": top_chunks,
                        "top_scores": [c.get("score", 1.0) for c in top_chunks],
                        "sources": [c.get("source", "Cached Knowledge Base") for c in top_chunks]
                    })

                # Emit final response from cache
                yield format_sse("final_response", {
                    "response": cached_result.get("response", ""),
                    "intent": "safe_rag",
                    "status": "success"
                })

                # Emit completion
                yield format_sse("done", {
                    "thread_id": request.thread_id,
                    "status": "success"
                })
                return

            # Stream execution stage-by-stage using LangGraph updates
            async for update in graph_app.astream(
                {"query": request.query, "user_query": request.query},
                config,
                stream_mode="updates"
            ):
                if not isinstance(update, dict):
                    continue

                for node_name, node_out in update.items():
                    if not isinstance(node_out, dict):
                        continue

                    # 1. Guardrail & Routing Stage
                    if node_name == "guardrail_and_router":
                        decision = node_out.get("route_decision")
                        detected_pii = getattr(decision, "detected_pii", []) if decision else []
                        masked_query = node_out.get("masked_query", "")
                        user_query = node_out.get("user_query", "")
                        pii_redacted = bool(detected_pii) or (masked_query != user_query)
                        
                        pii_serialized = [
                            p.model_dump() if hasattr(p, "model_dump") else (p.dict() if hasattr(p, "dict") else str(p))
                            for p in detected_pii
                        ]

                        yield format_sse("guardrail_route", {
                            "classification": node_out.get("intent", "safe_rag"),
                            "confidence": getattr(decision, "confidence", 1.0) if decision else 1.0,
                            "reasoning": getattr(decision, "reasoning", "") if decision else "",
                            "pii_redacted": pii_redacted,
                            "detected_pii": pii_serialized,
                            "masked_query": masked_query
                        })

                    # 2. Hybrid Retrieval Stage (Top-4 Chunks & FlashRank Rerank Scores)
                    elif node_name == "retrieve":
                        chunks = node_out.get("retrieved_chunks", [])
                        collected_chunks = chunks
                        collected_context = node_out.get("context", [])
                        top_4 = chunks[:4]
                        serialized_chunks = []
                        for c in top_4:
                            serialized_chunks.append({
                                "content": c.get("content", ""),
                                "score": round(float(c.get("score", 0.0)), 4),
                                "source": c.get("metadata", {}).get("source", "Knowledge Base"),
                                "metadata": c.get("metadata", {})
                            })

                        yield format_sse("retrieval_results", {
                            "count": len(serialized_chunks),
                            "chunks": serialized_chunks,
                            "top_scores": [c["score"] for c in serialized_chunks],
                            "sources": [c["source"] for c in serialized_chunks]
                        })

                    # 3. CRAG Document Relevance Grading Stage
                    elif node_name == "grade_documents":
                        grade = node_out.get("grade_result")
                        is_relevant = getattr(grade, "is_relevant", True) if grade else True
                        score = getattr(grade, "score", 1.0) if grade else 1.0
                        reasoning = getattr(grade, "reasoning", "") if grade else ""

                        yield format_sse("crag_grade", {
                            "is_relevant": is_relevant,
                            "score": round(float(score), 4),
                            "retry_count": retry_count,
                            "reasoning": reasoning
                        })

                    # Query Reformulation (Track CRAG retry loop)
                    elif node_name == "rewrite_query":
                        retry_count = node_out.get("retry_count", retry_count + 1)

                    # 4. Final Response Generation
                    elif node_name == "generate":
                        response_text = node_out.get("response", "")
                        needs_esc = node_out.get("needs_escalation", False)
                        if not needs_esc:
                            final_response_emitted = True
                            # Asynchronously store generated response into semantic cache
                            asyncio.create_task(cache.set(
                                query=request.query,
                                response=response_text,
                                intent="safe_rag",
                                context=collected_context or node_out.get("context", []),
                                retrieved_chunks=collected_chunks or node_out.get("retrieved_chunks", [])
                            ))
                            yield format_sse("final_response", {
                                "response": response_text,
                                "intent": "safe_rag",
                                "status": "success"
                            })

                    elif node_name == "safe_refusal":
                        response_text = node_out.get("response", "Request refused by security guardrails.")
                        final_response_emitted = True
                        yield format_sse("final_response", {
                            "response": response_text,
                            "intent": "prompt_injection",
                            "status": "success"
                        })

                    elif node_name == "live_order_tool":
                        response_text = node_out.get("response", "")
                        order_data = node_out.get("order_data")
                        final_response_emitted = True
                        yield format_sse("final_response", {
                            "response": response_text,
                            "intent": "live_order_tool",
                            "order_data": order_data,
                            "status": "success"
                        })

                    elif node_name == "human_review_node":
                        response_text = node_out.get("response", "")
                        final_response_emitted = True
                        yield format_sse("final_response", {
                            "response": response_text,
                            "intent": "human_review",
                            "status": "success"
                        })

            # Check if execution paused before human_review_node (HITL Interrupt)
            snapshot = graph_app.get_state(config)
            if snapshot and snapshot.next:
                state_vals = snapshot.values or {}
                escalation_resp = state_vals.get("response") or "This query has been escalated to a human supervisor."
                intent_val = state_vals.get("intent", "escalation_hitl")

                reason = "Interrupted for Human Review"
                if state_vals.get("route_decision"):
                    reason = getattr(state_vals["route_decision"], "reasoning", reason)
                elif state_vals.get("retry_count", 0) >= 1 and state_vals.get("grade_result") and not state_vals.get("grade_result").is_relevant:
                    reason = "CRAG retrieval failed after reformulation; supervisor review needed."

                yield format_sse("hitl_paused", {
                    "thread_id": request.thread_id,
                    "paused": True,
                    "reason": reason,
                    "response": escalation_resp,
                    "intent": intent_val,
                    "status": "escalated"
                })

                if not final_response_emitted:
                    final_response_emitted = True
                    yield format_sse("final_response", {
                        "response": escalation_resp,
                        "intent": intent_val,
                        "status": "escalated"
                    })

            # Stage: done
            yield format_sse("done", {
                "thread_id": request.thread_id,
                "status": "escalated" if (snapshot and snapshot.next) else "success"
            })

        except Exception as e:
            yield format_sse("error", {"detail": str(e)})
            yield format_sse("done", {"thread_id": request.thread_id, "status": "error"})
        finally:
            if handler:
                await aflush_langfuse(handler)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@server.post("/api/chat/resume", response_model=ChatResponse)
@server.post("/chat/resume", response_model=ChatResponse)
async def resume_chat(request: ResumeRequest, background_tasks: BackgroundTasks):
    """
    Resumes a thread paused at human_review_node with supervisor response override.
    """
    handler = get_langfuse_callback(
        session_id=request.thread_id,
        metadata={"thread_id": request.thread_id, "endpoint": "/api/chat/resume", "action": "resume"}
    )
    callbacks = [handler] if handler else []
    config = {
        "configurable": {"thread_id": request.thread_id},
        "callbacks": callbacks,
        "metadata": {"thread_id": request.thread_id, "session_id": request.thread_id}
    }
    
    try:
        snapshot = graph_app.get_state(config)
        if not snapshot or not snapshot.next:
            raise HTTPException(
                status_code=400,
                detail=f"Thread '{request.thread_id}' is not currently paused for human review."
            )
        
        override = request.response or request.feedback or "Approved by human supervisor."
        
        # Non-blocking state update to inject supervisor response
        graph_app.update_state(
            config,
            {
                "human_feedback": override,
                "response": override,
                "needs_escalation": False
            },
            as_node="human_review_node"
        )
        
        # Resume execution from checkpoint
        result = await graph_app.ainvoke(None, config)
        
        new_snapshot = graph_app.get_state(config)
        status = "escalated" if (new_snapshot and new_snapshot.next) else "success"
        
        if handler:
            background_tasks.add_task(flush_langfuse, handler)

        return ChatResponse(
            response=result.get("response", override),
            intent=result.get("intent", "human_review"),
            context=result.get("context", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            status=status
        )
    except HTTPException:
        if handler:
            background_tasks.add_task(flush_langfuse, handler)
        raise
    except Exception as e:
        if handler:
            background_tasks.add_task(flush_langfuse, handler)
        raise HTTPException(status_code=500, detail=str(e))

@server.post("/api/ingest/upload", response_model=UploadResponse)
@server.post("/ingest/upload", response_model=UploadResponse)
async def upload_knowledge_file(file: UploadFile = File(...)):
    """
    Live Multi-Format Organization Upload Endpoint:
    - Accepts .pdf, .xlsx, .xls, .csv, .md, .txt
    - Saves uploaded file to data/uploads/
    - For text/pdf: chunks, upserts into existing ChromaDB collection safely,
      rebuilds data/bm25_index.pkl, and hot-reloads HybridRetriever.
    - For csv/excel: loads into data/nexus_structured.db via pandas and indexes schema summary.
    - Generates 2-3 sample queries and returns them in suggested_prompts.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{file_ext}'. Allowed formats: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}"
        )

    # 1. Save uploaded file to data/uploads/
    upload_dir = Path("data/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination_path = upload_dir / file.filename

    try:
        content = await file.read()
        destination_path.write_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    # 2. Process file asynchronously in background thread
    try:
        result = await asyncio.to_thread(process_uploaded_file, destination_path, file.filename)
        return UploadResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error indexing file '{file.filename}': {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(server, host="0.0.0.0", port=8000)
