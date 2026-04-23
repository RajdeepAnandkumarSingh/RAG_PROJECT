from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from main import app as graph_app

server = FastAPI()

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
    status: str # "success" or "escalated"

@server.post("/ask", response_model=ChatResponse)
async def ask_query(request: QueryRequest):
    config = {"configurable": {"thread_id": request.thread_id}}
    
    # Run the graph
    try:
        # We use await if we make it async, but for now graph is sync
        result = graph_app.invoke({"query": request.query}, config)
        
        # Check for HITL
        snapshot = graph_app.get_state(config)
        status = "escalated" if snapshot.next else "success"
        
        return ChatResponse(
            response=result.get("response", "Escalated to human."),
            intent=result.get("intent", "Unknown"),
            context=result.get("context", []),
            status=status
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(server, host="0.0.0.0", port=8000)
