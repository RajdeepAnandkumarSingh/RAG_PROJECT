from typing import Literal, List
from pydantic import BaseModel, Field

class RouteDecision(BaseModel):
    classification: Literal[
        "safe_rag",
        "live_order_tool",
        "prompt_injection",
        "escalation_hitl"
    ] = Field(
        description=(
            "Classification of user query: "
            "'safe_rag' for general knowledge, support FAQs, and product inquiries; "
            "'live_order_tool' for order tracking, package delivery status, and shipment inquiries; "
            "'prompt_injection' for adversarial jailbreak attempts, system prompt extraction, or instruction overrides; "
            "'escalation_hitl' for lawsuits, legal action threats, severe anger/harassment, and billing disputes."
        )
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence score for the classification decision."
    )
    reasoning: str = Field(
        description="Brief explanation of why this route was selected."
    )
    detected_pii: List[str] = Field(
        default_factory=list,
        description="Types of PII detected and redacted, if any."
    )
