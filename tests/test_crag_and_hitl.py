import os
import asyncio
import tempfile
import sqlite3
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import httpx

from schemas.grading import GradeResult, QueryRewriteResult
from schemas.routing import RouteDecision
from utils.order_db import init_orders_table, get_order_by_id, SAMPLE_ORDERS
from main import (
    AgentState,
    grade_documents_node,
    rewrite_query_node,
    live_order_tool_node,
    human_review_node,
    route_after_grade,
    route_after_guardrail,
    workflow,
    app as graph_app
)
from server import server
from utils.auth import create_access_token

def run_async(coro):
    """Helper to run async coroutines in tests reliably without requiring pytest-asyncio plugins."""
    return asyncio.run(coro)


# =====================================================================
# 1. Document Grading Unit Tests (GradeDocumentsNode)
# =====================================================================

def test_grade_documents_node_relevant():
    """Verifies grade_documents_node produces is_relevant=True and score 0.99 when chunks answer the query."""
    async def _test():
        mock_grade = GradeResult(
            is_relevant=True,
            score=0.99,
            reasoning="Context contains the exact 30-day return policy required to answer the query."
        )

        mock_grader = AsyncMock()
        mock_grader.ainvoke = AsyncMock(return_value=mock_grade)
        mock_grader.return_value = mock_grade

        with patch("main.grader_llm", mock_grader):
            state: AgentState = {
                "user_query": "What is the return window?",
                "query": "What is the return window?",
                "masked_query": "What is the return window?",
                "intent": "safe_rag",
                "route_decision": None,
                "context": ["[Source: policy.md | Score: 0.95]\nReturns accepted within 30 days."],
                "retrieved_chunks": [{"content": "Returns accepted within 30 days.", "score": 0.95}],
                "response": "",
                "needs_escalation": False,
                "human_feedback": None,
                "order_data": None,
                "grade_result": None,
                "retry_count": 0,
                "rewritten_query": None
            }

            result = await grade_documents_node(state)
            assert "grade_result" in result
            assert result["grade_result"].is_relevant is True
            assert result["grade_result"].score == 0.99
            assert "return policy" in result["grade_result"].reasoning

    run_async(_test())


def test_grade_documents_node_irrelevant():
    """Verifies grade_documents_node produces is_relevant=False and score 0.1 when chunks fail to answer query."""
    async def _test():
        mock_grade = GradeResult(
            is_relevant=False,
            score=0.1,
            reasoning="The retrieved text discusses shipping logistics and does not address software license keys."
        )

        mock_grader = AsyncMock()
        mock_grader.ainvoke = AsyncMock(return_value=mock_grade)
        mock_grader.return_value = mock_grade

        with patch("main.grader_llm", mock_grader):
            state: AgentState = {
                "user_query": "How do I activate my license key?",
                "query": "How do I activate my license key?",
                "masked_query": "How do I activate my license key?",
                "intent": "safe_rag",
                "route_decision": None,
                "context": ["[Source: shipping.md | Score: 0.40]\nStandard delivery takes 3-5 days."],
                "retrieved_chunks": [{"content": "Standard delivery takes 3-5 days.", "score": 0.40}],
                "response": "",
                "needs_escalation": False,
                "human_feedback": None,
                "order_data": None,
                "grade_result": None,
                "retry_count": 0,
                "rewritten_query": None
            }

            result = await grade_documents_node(state)
            assert "grade_result" in result
            assert result["grade_result"].is_relevant is False
            assert result["grade_result"].score == 0.1

    run_async(_test())


# =====================================================================
# 2. Query Rewrite & Loop Termination Tests (retry_count)
# =====================================================================

def test_route_after_grade_logic():
    """
    Verifies CRAG routing logic:
    1. is_relevant=True -> "generate"
    2. is_relevant=False & retry_count=0 -> "rewrite_query"
    3. is_relevant=False & retry_count=1 -> "human_review_node"
    4. is_relevant=False & retry_count >= 2 -> "human_review_node"
    """
    base_state: AgentState = {
        "user_query": "test",
        "query": "test",
        "masked_query": "test",
        "intent": "safe_rag",
        "route_decision": None,
        "context": [],
        "retrieved_chunks": [],
        "response": "",
        "needs_escalation": False,
        "human_feedback": None,
        "order_data": None,
        "grade_result": None,
        "retry_count": 0,
        "rewritten_query": None
    }

    # Case 1: Chunks pass grading
    passed_state = dict(base_state)
    passed_state["grade_result"] = GradeResult(is_relevant=True, score=0.9, reasoning="Relevant")
    assert route_after_grade(passed_state) == "generate"

    # Case 2: Chunks fail, retry_count = 0 (first attempt) -> rewrite_query
    failed_first_attempt = dict(base_state)
    failed_first_attempt["grade_result"] = GradeResult(is_relevant=False, score=0.2, reasoning="Irrelevant")
    failed_first_attempt["retry_count"] = 0
    assert route_after_grade(failed_first_attempt) == "rewrite_query"

    # Case 3: Chunks fail, retry_count = 1 (second attempt) -> human_review_node (loop terminates!)
    failed_second_attempt = dict(base_state)
    failed_second_attempt["grade_result"] = GradeResult(is_relevant=False, score=0.1, reasoning="Still Irrelevant")
    failed_second_attempt["retry_count"] = 1
    assert route_after_grade(failed_second_attempt) == "human_review_node"

    # Case 4: Chunks fail, retry_count > 1 -> human_review_node
    failed_exceeded_attempt = dict(base_state)
    failed_exceeded_attempt["grade_result"] = GradeResult(is_relevant=False, score=0.0, reasoning="Failed")
    failed_exceeded_attempt["retry_count"] = 2
    assert route_after_grade(failed_exceeded_attempt) == "human_review_node"


def test_rewrite_query_node_increments_retry_count():
    """Verifies that rewrite_query_node increments retry_count and updates masked_query."""
    async def _test():
        mock_rewrite = QueryRewriteResult(
            rewritten_query="Nexus enterprise 30 day return and refund policy requirements",
            reasoning="Expanded ambiguous term 'return policy' to specific policy keywords."
        )

        mock_rewriter = AsyncMock()
        mock_rewriter.ainvoke = AsyncMock(return_value=mock_rewrite)
        mock_rewriter.return_value = mock_rewrite

        with patch("main.rewriter_llm", mock_rewriter):
            state: AgentState = {
                "user_query": "return policy",
                "query": "return policy",
                "masked_query": "return policy",
                "intent": "safe_rag",
                "route_decision": None,
                "context": [],
                "retrieved_chunks": [],
                "response": "",
                "needs_escalation": False,
                "human_feedback": None,
                "order_data": None,
                "grade_result": None,
                "retry_count": 0,
                "rewritten_query": None
            }

            result = await rewrite_query_node(state)
            assert result["retry_count"] == 1
            assert result["masked_query"] == mock_rewrite.rewritten_query
            assert result["rewritten_query"] == mock_rewrite.rewritten_query

    run_async(_test())


# =====================================================================
# 3. Async SQLite Order Lookup Unit Tests
# =====================================================================

def test_sqlite_order_db_initialization_and_lookup():
    """Verifies that init_orders_table creates table, seeds orders, and get_order_by_id retrieves records."""
    async def _test():
        with tempfile.TemporaryDirectory() as tmp_dir:
            test_db = os.path.join(tmp_dir, "test_orders.db")
            init_orders_table(test_db)

            # Query existing order #7721
            order = await get_order_by_id("7721", db_path=test_db)
            assert order is not None
            assert order["order_id"] == "7721"
            assert order["status"] == "In Transit"
            assert order["carrier"] == "Express Courier"
            assert "Nexus Pro Wireless Mechanical Keyboard" in order["items"]

            # Query existing order with leading '#' (#1001)
            order_with_hash = await get_order_by_id("#1001", db_path=test_db)
            assert order_with_hash is not None
            assert order_with_hash["order_id"] == "1001"
            assert order_with_hash["status"] == "Delivered"

            # Query non-existent order
            missing_order = await get_order_by_id("99999", db_path=test_db)
            assert missing_order is None

    run_async(_test())


def test_live_order_tool_node_found():
    """Verifies live_order_tool_node returns structured status and items for found order."""
    async def _test():
        with tempfile.TemporaryDirectory() as tmp_dir:
            test_db = os.path.join(tmp_dir, "test_nexus.db")
            init_orders_table(test_db)

            with patch("config.settings.SQLITE_DB_PATH", test_db):
                state: AgentState = {
                    "user_query": "Can you check tracking on order #7721 please?",
                    "query": "Can you check tracking on order #7721 please?",
                    "masked_query": "Can you check tracking on order #7721 please?",
                    "intent": "live_order_tool",
                    "route_decision": None,
                    "context": [],
                    "retrieved_chunks": [],
                    "response": "",
                    "needs_escalation": False,
                    "human_feedback": None,
                    "order_data": None,
                    "grade_result": None,
                    "retry_count": 0,
                    "rewritten_query": None
                }

                result = await live_order_tool_node(state)
                assert "Live Order Status for #7721: In Transit" in result["response"]
                assert "Express Courier" in result["response"]
                assert "TRK-7721-EX" in result["response"]
                assert result["order_data"] is not None
                assert result["order_data"]["order_id"] == "7721"

    run_async(_test())


def test_live_order_tool_node_not_found():
    """Verifies live_order_tool_node returns polite error when order ID is not in DB."""
    async def _test():
        with tempfile.TemporaryDirectory() as tmp_dir:
            test_db = os.path.join(tmp_dir, "test_nexus.db")
            init_orders_table(test_db)

            with patch("config.settings.SQLITE_DB_PATH", test_db):
                state: AgentState = {
                    "user_query": "Check status for order #99998",
                    "query": "Check status for order #99998",
                    "masked_query": "Check status for order #99998",
                    "intent": "live_order_tool",
                    "route_decision": None,
                    "context": [],
                    "retrieved_chunks": [],
                    "response": "",
                    "needs_escalation": False,
                    "human_feedback": None,
                    "order_data": None,
                    "grade_result": None,
                    "retry_count": 0,
                    "rewritten_query": None
                }

                result = await live_order_tool_node(state)
                assert "Order #99998 could not be found" in result["response"]
                assert result["order_data"] is None

    run_async(_test())


def test_live_order_tool_node_missing_order_number():
    """Verifies live_order_tool_node prompts user when query contains no order ID."""
    async def _test():
        state: AgentState = {
            "user_query": "Where is my package?",
            "query": "Where is my package?",
            "masked_query": "Where is my package?",
            "intent": "live_order_tool",
            "route_decision": None,
            "context": [],
            "retrieved_chunks": [],
            "response": "",
            "needs_escalation": False,
            "human_feedback": None,
            "order_data": None,
            "grade_result": None,
            "retry_count": 0,
            "rewritten_query": None
        }

        result = await live_order_tool_node(state)
        assert "please provide your order number" in result["response"]
        assert result["order_data"] is None

    run_async(_test())


# =====================================================================
# 4. LangGraph HITL Interrupt & Persistence Unit Tests
# =====================================================================

def test_hitl_interrupt_and_resume():
    """
    Verifies that:
    1. An escalated query pauses BEFORE human_review_node via interrupt_before.
    2. snapshot.next reports ('human_review_node',).
    3. Updating state with human feedback and re-invoking resumes and finishes the thread.
    """
    async def _test():
        thread_id = "test_hitl_thread_101"
        config = {"configurable": {"thread_id": thread_id}}

        # Mock router LLM to classify as escalation_hitl
        mock_decision = RouteDecision(
            classification="escalation_hitl",
            confidence=0.99,
            reasoning="Explicit threat of lawsuit and attorney involvement.",
            detected_pii=[]
        )

        mock_router = AsyncMock()
        mock_router.ainvoke = AsyncMock(return_value=mock_decision)
        mock_router.return_value = mock_decision

        with patch("main.router_llm", mock_router):
            # 1. First invocation: Should pause before human_review_node
            result = await graph_app.ainvoke(
                {"query": "I am suing you and my attorney will call tomorrow.", "user_query": "I am suing you"},
                config
            )

            # Check snapshot: must be interrupted
            snapshot = graph_app.get_state(config)
            assert snapshot.next == ("human_review_node",), f"Expected pause before human_review_node, got {snapshot.next}"

            # 2. Simulate human supervisor override
            supervisor_message = "The case has been transferred to General Counsel. We will contact you at 9 AM."
            graph_app.update_state(
                config,
                {
                    "human_feedback": supervisor_message,
                    "response": supervisor_message,
                    "needs_escalation": False
                },
                as_node="human_review_node"
            )

            # 3. Resume execution from checkpoint
            resumed_result = await graph_app.ainvoke(None, config)

            # Check new snapshot: should now be completed
            final_snapshot = graph_app.get_state(config)
            assert final_snapshot.next == (), f"Expected finished graph, but next is {final_snapshot.next}"
            assert "General Counsel" in resumed_result.get("response", "")

    run_async(_test())


# =====================================================================
# 5. FastAPI Endpoints (/ask and /api/chat/resume) Unit Tests
# =====================================================================

def test_fastapi_ask_and_resume_endpoints():
    """
    Verifies the complete FastAPI lifecycle:
    1. POST /ask with an escalatable query sets status to 'escalated'.
    2. POST /api/chat/resume provides supervisor override and resumes thread to status 'success'.
    3. Calling /api/chat/resume on an unpaused thread returns 400.
    """
    async def _test():
        thread_id = "fastapi_test_thread_55"

        mock_decision = RouteDecision(
            classification="escalation_hitl",
            confidence=0.99,
            reasoning="Threat of lawsuit.",
            detected_pii=[]
        )

        mock_router = AsyncMock()
        mock_router.ainvoke = AsyncMock(return_value=mock_decision)
        mock_router.return_value = mock_decision

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server), base_url="http://test") as client:
            with patch("main.router_llm", mock_router):
                # 1. Ask query that escalates
                ask_resp = await client.post("/ask", json={
                    "query": "I will file a lawsuit in small claims court today.",
                    "thread_id": thread_id
                })
                assert ask_resp.status_code == 200
                ask_data = ask_resp.json()
                assert ask_data["status"] == "escalated"

                supervisor_token = create_access_token(
                    {
                        "id": "demo-supervisor",
                        "email": "supervisor@nexusrag.ai",
                        "role": "supervisor",
                        "name": "Sarah Chen (Supervisor)",
                    }
                )
                supervisor_headers = {"Authorization": f"Bearer {supervisor_token}"}

                # 2. Resume thread with supervisor override
                resume_resp = await client.post(
                    "/api/chat/resume",
                    json={
                        "thread_id": thread_id,
                        "response": "Supervisor resolved the issue: Full refund issued."
                    },
                    headers=supervisor_headers,
                )
                assert resume_resp.status_code == 200
                resume_data = resume_resp.json()
                assert resume_data["status"] == "success"
                assert "Full refund issued" in resume_data["response"]

                # 3. Verify calling resume again on now completed thread returns 400
                repeat_resume = await client.post(
                    "/api/chat/resume",
                    json={
                        "thread_id": thread_id,
                        "response": "Another override attempt."
                    },
                    headers=supervisor_headers,
                )
                assert repeat_resume.status_code == 400
                assert "not currently paused" in repeat_resume.json()["detail"]

    run_async(_test())
