from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from main import app as graph_app
from config import settings

server = FastAPI(
    title="Nexus RAG v2.0 API",
    description="Customer Support RAG with Pre-Retrieval Guardrails, Hybrid Search (ChromaDB + BM25), Local Reranking, CRAG, and HITL"
)

# Enable CORS for React frontend
server.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@server.post("/ask", response_model=ChatResponse)
async def ask_query(request: QueryRequest):
    config = {"configurable": {"thread_id": request.thread_id}}
    
    try:
        # Non-blocking async invocation of the LangGraph state machine
        result = await graph_app.ainvoke(
            {"query": request.query, "user_query": request.query},
            config
        )
        
        # Check if graph paused at human_review_node interrupt
        snapshot = graph_app.get_state(config)
        status = "escalated" if (snapshot and snapshot.next) else "success"
        
        return ChatResponse(
            response=result.get("response", "Escalated to human supervisor."),
            intent=result.get("intent", "Unknown"),
            context=result.get("context", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            status=status
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@server.post("/api/chat/resume", response_model=ChatResponse)
@server.post("/chat/resume", response_model=ChatResponse)
async def resume_chat(request: ResumeRequest):
    """
    Resumes a thread paused at human_review_node with supervisor response override.
    """
    config = {"configurable": {"thread_id": request.thread_id}}
    
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
        
        return ChatResponse(
            response=result.get("response", override),
            intent=result.get("intent", "human_review"),
            context=result.get("context", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            status=status
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(server, host="0.0.0.0", port=8000)
