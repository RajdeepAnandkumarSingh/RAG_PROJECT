from typing import Optional
from pydantic import BaseModel, Field

class GradeResult(BaseModel):
    """Structured evaluation output for document grading in Corrective RAG (CRAG)."""
    is_relevant: bool = Field(
        description="True if the retrieved context contains relevant information that answers the user's masked query; False otherwise."
    )
    score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence or relevance score between 0.0 and 1.0."
    )
    reasoning: str = Field(
        description="Concise rationale explaining why the retrieved chunks are relevant or irrelevant to the query."
    )

class QueryRewriteResult(BaseModel):
    """Structured reformulation output for query rewriting in Corrective RAG (CRAG)."""
    rewritten_query: str = Field(
        description="Reformulated search query optimized for semantic and keyword document retrieval."
    )
    reasoning: str = Field(
        description="Explanation of why this reformulated query will retrieve more relevant documents."
    )
