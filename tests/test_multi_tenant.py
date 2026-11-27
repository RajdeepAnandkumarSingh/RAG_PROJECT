import fnmatch
import io
import sqlite3
import uuid
from pathlib import Path
from typing import Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import jwt
import pytest
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings

from config import settings
from ingest import ingest_documents_dual_index, process_uploaded_file
from main import AgentState, live_order_tool_node
from schemas.routing import RouteDecision
from server import server
from utils.auth import (
    JWT_ALGORITHM,
    create_access_token,
    decode_access_token,
    get_jwt_secret,
    init_auth_db,
    rate_limiter,
    seed_demo_users,
)
from utils.hybrid_retriever import HybridRetriever, get_bm25_path
from utils.order_db import get_order_by_id, init_orders_table
from utils.semantic_cache import SemanticCache


class _DeterministicEmbeddings(Embeddings):
    """Lightweight offline deterministic embeddings for ChromaDB multi-tenant tests."""

    def _encode(self, text: str) -> List[float]:
        low = text.lower()
        # Distinct orthogonal features for amazon / flipkart / nexus / return policies
        vec = [0.0] * 8
        vec[0] = 1.0 if "return" in low or "policy" in low or "replacement" in low else 0.1
        vec[1] = 1.0 if "amazon" in low or "30-day" in low or "electronics" in low else 0.0
        vec[2] = 1.0 if "flipkart" in low or "7-day" in low or "ekart" in low else 0.0
        vec[3] = 1.0 if "nexus" in low else 0.0
        vec[4] = 0.5
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._encode(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._encode(text)


class _InMemoryAsyncRedis:
    """In-memory async Redis stub supporting keys, mget, set, delete, and ping."""

    def __init__(self):
        self.store: Dict[str, str] = {}

    async def ping(self):
        return True

    async def keys(self, pattern: str) -> List[str]:
        return [k for k in list(self.store.keys()) if fnmatch.fnmatch(k, pattern)]

    async def mget(self, keys: List[str]) -> List[str]:
        return [self.store.get(k) for k in keys]

    async def set(self, key: str, value: str, ex: int = 0):
        self.store[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for k in keys:
            if k in self.store:
                del self.store[k]
                deleted += 1
        return deleted


@pytest.fixture(autouse=True)
def isolated_multi_tenant_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Provides isolated SQLite DB, JWT secret, disabled Redis URL, and fresh rate limiter."""
    db_file = tmp_path / "multi_tenant_test.db"
    monkeypatch.setattr(settings, "SQLITE_DB_PATH", str(db_file))
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_file))
    monkeypatch.setenv(
        "JWT_SECRET_KEY",
        "test-secret-key-64-char-hex-0123456789abcdef0123456789abcdef",
    )
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(settings, "REDIS_URL", "")
    rate_limiter.reset()
    init_auth_db()
    seed_demo_users(include_tenants=True)
    init_orders_table(str(db_file))
    yield tmp_path
    rate_limiter.reset()


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server),
        base_url="https://testserver",
    )


# =====================================================================
# 1. SQLite Schema, Migration & Pre-Seeded Workspaces
# =====================================================================


def test_preseeded_orgs_users_and_orders(isolated_multi_tenant_env: Path):
    """Verifies Nexus, Amazon, and Flipkart workspaces, users, and Order #7721 are seeded cleanly."""
    db_file = isolated_multi_tenant_env / "multi_tenant_test.db"
    with sqlite3.connect(db_file) as conn:
        orgs = {
            row[0]: (row[1], row[2])
            for row in conn.execute("SELECT org_id, name, slug FROM organizations").fetchall()
        }
        assert orgs["org_nexus"] == ("Nexus Enterprise", "nexus")
        assert orgs["org_amazon"] == ("Amazon Support", "amazon")
        assert orgs["org_flipkart"] == ("Flipkart Support", "flipkart")

        users = {
            (row[0], row[1]): row[2]
            for row in conn.execute("SELECT org_id, email, role FROM users").fetchall()
        }
        assert users[("org_nexus", "user@nexusrag.ai")] == "user"
        assert users[("org_nexus", "supervisor@nexusrag.ai")] == "supervisor"
        assert users[("org_amazon", "customer@amazon.demo")] == "user"
        assert users[("org_amazon", "supervisor@amazon.demo")] == "supervisor"
        assert users[("org_flipkart", "customer@flipkart.demo")] == "user"
        assert users[("org_flipkart", "supervisor@flipkart.demo")] == "supervisor"

        orders_7721 = {
            row[0]: row[1]
            for row in conn.execute(
                "SELECT org_id, status FROM orders WHERE order_id = '7721'"
            ).fetchall()
        }
        assert orders_7721["org_nexus"] == "In Transit"
        assert orders_7721["org_amazon"] == "Delivered via Amazon Prime Logistics"
        assert orders_7721["org_flipkart"] == "Out for Delivery via Ekart Logistics"


def test_legacy_sqlite_migration_preserves_data(tmp_path: Path):
    """Verifies legacy single-tenant SQLite tables migrate cleanly to composite multi-tenant keys."""
    legacy_db = tmp_path / "legacy.db"
    with sqlite3.connect(legacy_db) as conn:
        conn.execute(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO users (id, email, full_name, password_hash, role, created_at)
            VALUES ('u1', 'legacy@nexusrag.ai', 'Legacy User', 'hash', 'user', '2026-01-01T00:00:00Z')
            """
        )
        conn.execute(
            """
            CREATE TABLE user_threads (
                session_id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE orders (
                order_id TEXT PRIMARY KEY,
                customer_name TEXT,
                status TEXT NOT NULL,
                carrier TEXT,
                tracking_number TEXT,
                estimated_delivery TEXT,
                items TEXT
            )
            """
        )
        conn.execute(
            "INSERT INTO orders (order_id, customer_name, status) VALUES ('8888', 'Old Cust', 'Delivered')"
        )
        conn.commit()

    init_auth_db(str(legacy_db))
    init_orders_table(str(legacy_db))

    with sqlite3.connect(legacy_db) as conn:
        u_row = conn.execute("SELECT org_id, email FROM users WHERE id = 'u1'").fetchone()
        assert u_row == ("org_nexus", "legacy@nexusrag.ai")

        # Same email can now be inserted under a different org_id
        conn.execute(
            """
            INSERT INTO users (id, org_id, email, full_name, password_hash, role, created_at)
            VALUES ('u2', 'org_amazon', 'legacy@nexusrag.ai', 'Amazon Legacy', 'hash', 'user', '2026-01-01T00:00:00Z')
            """
        )
        o_row = conn.execute("SELECT org_id, status FROM orders WHERE order_id = '8888'").fetchone()
        assert o_row == ("org_nexus", "Delivered")

        t_cols = [r[1] for r in conn.execute("PRAGMA table_info(user_threads)").fetchall()]
        assert "org_id" in t_cols


# =====================================================================
# 2. Same-Email Cross-Org Signup, JWT Claims, /api/orgs & /api/orgs/register
# =====================================================================


@pytest.mark.asyncio
async def test_same_email_separate_orgs_and_jwt_claims():
    """Same customer email can register separately under Amazon and Flipkart with scoped JWTs."""
    async with _client() as client:
        r_amz = await client.post(
            "/api/auth/signup",
            json={
                "email": "shared.shopper@example.com",
                "full_name": "Shared Amazon",
                "password": "Password@2026!",
                "org_slug": "amazon",
            },
            headers={"X-Forwarded-For": "198.51.100.41"},
        )
        assert r_amz.status_code == 200
        amz_data = r_amz.json()
        assert amz_data["user"]["org_id"] == "org_amazon"
        assert amz_data["user"]["org_slug"] == "amazon"

        amz_claims = jwt.decode(amz_data["access_token"], get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        assert amz_claims["org_id"] == "org_amazon"
        assert amz_claims["org_slug"] == "amazon"

        r_fkt = await client.post(
            "/api/auth/signup",
            json={
                "email": "shared.shopper@example.com",
                "full_name": "Shared Flipkart",
                "password": "Password@2026!",
                "org_slug": "flipkart",
            },
            headers={"X-Forwarded-For": "198.51.100.42"},
        )
        assert r_fkt.status_code == 200
        fkt_data = r_fkt.json()
        assert fkt_data["user"]["org_id"] == "org_flipkart"
        assert fkt_data["user"]["org_slug"] == "flipkart"
        assert fkt_data["user"]["id"] != amz_data["user"]["id"]

        # Duplicate within Amazon still returns 409
        r_dup = await client.post(
            "/api/auth/signup",
            json={
                "email": "shared.shopper@example.com",
                "full_name": "Shared Amazon Dup",
                "password": "Password@2026!",
                "org_slug": "amazon",
            },
            headers={"X-Forwarded-For": "198.51.100.43"},
        )
        assert r_dup.status_code == 409

        # Refresh preserves org_id & org_slug in rotated JWT
        r_ref = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": fkt_data["refresh_token"]},
            headers={"X-Forwarded-For": "198.51.100.44"},
        )
        assert r_ref.status_code == 200
        ref_decoded = decode_access_token(r_ref.json()["access_token"])
        assert ref_decoded["org_id"] == "org_flipkart"
        assert ref_decoded["org_slug"] == "flipkart"


@pytest.mark.asyncio
async def test_orgs_list_and_self_registration_with_rate_limit():
    """Verifies GET /api/orgs and rate-limited POST /api/orgs/register."""
    async with _client() as client:
        orgs_resp = await client.get("/api/orgs")
        assert orgs_resp.status_code == 200
        slugs = {o["slug"] for o in orgs_resp.json()}
        assert {"nexus", "amazon", "flipkart"}.issubset(slugs)

        reg_ip = {"X-Forwarded-For": "203.0.113.77"}
        reg_resp = await client.post(
            "/api/orgs/register",
            json={
                "org_name": "Acme Corp",
                "org_slug": "acme",
                "supervisor_name": "Acme Admin",
                "supervisor_email": "admin@acme.demo",
                "password": "Password@2026!",
            },
            headers=reg_ip,
        )
        assert reg_resp.status_code == 200
        reg_data = reg_resp.json()
        assert reg_data["organization"]["org_id"] == "org_acme"
        assert reg_data["organization"]["slug"] == "acme"
        assert reg_data["user"]["role"] == "supervisor"
        assert reg_data["user"]["org_id"] == "org_acme"

        claims = decode_access_token(reg_data["access_token"])
        assert claims["org_id"] == "org_acme"
        assert claims["org_slug"] == "acme"

        # Duplicate slug rejected with 409
        dup_resp = await client.post(
            "/api/orgs/register",
            json={
                "org_name": "Acme Two",
                "org_slug": "acme",
                "supervisor_name": "Acme Admin 2",
                "supervisor_email": "admin2@acme.demo",
                "password": "Password@2026!",
            },
            headers=reg_ip,
        )
        assert dup_resp.status_code == 409

        # Rate limit (3/hr): 3rd succeeds, 4th returns 429
        reg_3 = await client.post(
            "/api/orgs/register",
            json={
                "org_name": "Beta Corp",
                "org_slug": "beta",
                "supervisor_name": "Beta Admin",
                "supervisor_email": "admin@beta.demo",
                "password": "Password@2026!",
            },
            headers=reg_ip,
        )
        assert reg_3.status_code == 200

        reg_4 = await client.post(
            "/api/orgs/register",
            json={
                "org_name": "Gamma Corp",
                "org_slug": "gamma",
                "supervisor_name": "Gamma Admin",
                "supervisor_email": "admin@gamma.demo",
                "password": "Password@2026!",
            },
            headers=reg_ip,
        )
        assert reg_4.status_code == 429


# =====================================================================
# 3. Order #7721 Isolation & Spreadsheet Upload Table Prefixing
# =====================================================================


@pytest.mark.asyncio
async def test_live_order_7721_isolated_across_all_three_orgs(isolated_multi_tenant_env: Path):
    """Amazon, Flipkart, and Nexus all have Order #7721 with completely isolated lookup results."""
    db_path = str(isolated_multi_tenant_env / "multi_tenant_test.db")

    nexus_order = await get_order_by_id("7721", db_path=db_path, org_id="org_nexus")
    amazon_order = await get_order_by_id("7721", db_path=db_path, org_id="org_amazon")
    flipkart_order = await get_order_by_id("7721", db_path=db_path, org_id="org_flipkart")

    assert nexus_order["status"] == "In Transit"
    assert amazon_order["status"] == "Delivered via Amazon Prime Logistics"
    assert flipkart_order["status"] == "Out for Delivery via Ekart Logistics"

    def _order_state(org_id: str) -> AgentState:
        return {
            "org_id": org_id,
            "user_query": "Track order #7721",
            "query": "Track order #7721",
            "masked_query": "Track order #7721",
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
            "rewritten_query": None,
        }

    amz_res = await live_order_tool_node(_order_state("org_amazon"))
    fkt_res = await live_order_tool_node(_order_state("org_flipkart"))
    assert "Amazon Prime Logistics" in amz_res["response"]
    assert "Ekart" not in amz_res["response"]
    assert "Ekart Logistics" in fkt_res["response"]
    assert "Amazon" not in fkt_res["response"]


def test_csv_upload_prefixes_sqlite_table_with_org_id(isolated_multi_tenant_env: Path):
    """Uploaded CSV files are stored in SQLite as upload_{org_id}_{table_name}."""
    csv_path = isolated_multi_tenant_env / "returns_catalog.csv"
    csv_path.write_text("sku,window_days\nEL-1,30\n", encoding="utf-8")

    chroma_dir = str(isolated_multi_tenant_env / "chroma_upload_test")
    bm25_file = str(isolated_multi_tenant_env / "bm25" / "org_amazon.pkl")

    with patch("ingest.FastEmbedEmbeddings", return_value=_DeterministicEmbeddings()), \
         patch("ingest.settings.GROQ_API_KEY", ""), \
         patch("main.reload_retriever_indices"):
        result = process_uploaded_file(
            csv_path,
            "returns_catalog.csv",
            org_id="org_amazon",
            chroma_path=chroma_dir,
            collection_name=f"test_upload_{uuid.uuid4().hex[:8]}",
            bm25_path=bm25_file,
        )

    assert "upload_org_amazon_returns_catalog" in result["tables_created"]
    db_path = isolated_multi_tenant_env / "multi_tenant_test.db"
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT sku, window_days FROM upload_org_amazon_returns_catalog"
        ).fetchall()
        assert rows == [("EL-1", 30)]


# =====================================================================
# 4. ChromaDB Metadata Filter & Per-Org BM25 Zero Cross-Tenant Leakage
# =====================================================================


@pytest.mark.asyncio
async def test_chroma_and_bm25_zero_cross_tenant_leakage(tmp_path: Path):
    """
    Indexes Amazon (30-day electronics return window) and Flipkart (7-day replacement guarantee)
    into the SAME ChromaDB collection and per-org BM25 pickles, verifying zero cross-tenant retrieval.
    """
    chroma_dir = str(tmp_path / "chroma_mt")
    col_name = f"mt_col_{uuid.uuid4().hex[:8]}"
    bm25_amz = str(tmp_path / "bm25" / "org_amazon.pkl")
    bm25_fkt = str(tmp_path / "bm25" / "org_flipkart.pkl")

    amz_dir = tmp_path / "docs_amazon"
    fkt_dir = tmp_path / "docs_flipkart"
    amz_dir.mkdir()
    fkt_dir.mkdir()

    # Identical filenames across tenants must NOT collide
    (amz_dir / "return_policy.md").write_text(
        "Amazon Support policy: 30-day electronics return window via Amazon Prime Logistics.",
        encoding="utf-8",
    )
    (fkt_dir / "return_policy.md").write_text(
        "Flipkart Support policy: 7-day replacement guarantee via Ekart Logistics.",
        encoding="utf-8",
    )

    emb = _DeterministicEmbeddings()
    with patch("ingest.FastEmbedEmbeddings", return_value=emb), \
         patch("utils.hybrid_retriever.FastEmbedEmbeddings", return_value=emb), \
         patch("main.reload_retriever_indices"):
        amz_count = ingest_documents_dual_index(
            docs_dirs=[str(amz_dir)],
            chroma_path=chroma_dir,
            collection_name=col_name,
            bm25_path=bm25_amz,
            org_id="org_amazon",
        )
        fkt_count = ingest_documents_dual_index(
            docs_dirs=[str(fkt_dir)],
            chroma_path=chroma_dir,
            collection_name=col_name,
            bm25_path=bm25_fkt,
            org_id="org_flipkart",
        )

    assert amz_count >= 1
    assert fkt_count >= 1
    assert Path(bm25_amz).exists()
    assert Path(bm25_fkt).exists()
    assert get_bm25_path("org_amazon").replace("\\", "/").endswith("data/bm25/org_amazon.pkl")
    assert get_bm25_path("org_flipkart").replace("\\", "/").endswith("data/bm25/org_flipkart.pkl")

    shared_chroma = Chroma(
        collection_name=col_name,
        persist_directory=chroma_dir,
        embedding_function=emb,
    )

    amz_retriever = HybridRetriever(
        chroma_db=shared_chroma,
        bm25_path=bm25_amz,
        org_id="org_amazon",
    )
    fkt_retriever = HybridRetriever(
        chroma_db=shared_chroma,
        bm25_path=bm25_fkt,
        org_id="org_flipkart",
    )

    with patch.object(amz_retriever, "_get_ranker", return_value=None), \
         patch.object(fkt_retriever, "_get_ranker", return_value=None):
        amz_results = await amz_retriever.aretrieve("What is the electronics return policy?", org_id="org_amazon")
        fkt_results = await fkt_retriever.aretrieve("What is the electronics return policy?", org_id="org_flipkart")

    assert len(amz_results) == 1
    assert "30-day electronics return window" in amz_results[0]["content"]
    assert "Flipkart" not in amz_results[0]["content"]
    assert amz_results[0]["metadata"]["org_id"] == "org_amazon"

    assert len(fkt_results) == 1
    assert "7-day replacement guarantee" in fkt_results[0]["content"]
    assert "Amazon" not in fkt_results[0]["content"]
    assert fkt_results[0]["metadata"]["org_id"] == "org_flipkart"


# =====================================================================
# 5. Redis Semantic Cache Tenant Namespacing & Upload Invalidation
# =====================================================================


@pytest.mark.asyncio
async def test_semantic_cache_tenant_namespacing_and_invalidation():
    """
    Verifies semcache:{org_id}:{hash} isolation across orgs and that upload
    invalidation clears ONLY the uploading org's cache keys.
    """
    fake_redis = _InMemoryAsyncRedis()
    cache = SemanticCache(threshold=0.92, ttl=3600)

    with patch.object(cache, "get_client", AsyncMock(return_value=fake_redis)), \
         patch.object(cache, "get_embedding", AsyncMock(return_value=[1.0, 0.0, 0.0])):
        # Amazon caches answer for "What is the return policy?"
        await cache.set(
            query="What is the return policy?",
            response="Amazon offers a 30-day electronics return window.",
            intent="safe_rag",
            org_id="org_amazon",
        )
        # Flipkart caches answer for "What is the return policy?"
        await cache.set(
            query="What is the return policy?",
            response="Flipkart offers a 7-day replacement guarantee.",
            intent="safe_rag",
            org_id="org_flipkart",
        )

        keys = list(fake_redis.store.keys())
        assert any(k.startswith("semcache:org_amazon:") for k in keys)
        assert any(k.startswith("semcache:org_flipkart:") for k in keys)

        # Cross-tenant lookup: Nexus has no cached entry -> MISS
        assert await cache.lookup("What is the return policy?", org_id="org_nexus") is None

        # Each org gets strictly its own cached response
        amz_hit = await cache.lookup("What is the return policy?", org_id="org_amazon")
        fkt_hit = await cache.lookup("What is the return policy?", org_id="org_flipkart")
        assert amz_hit is not None and "30-day" in amz_hit["response"]
        assert fkt_hit is not None and "7-day" in fkt_hit["response"]

        # Invalidate Amazon only -> Flipkart remains intact
        deleted = await cache.invalidate_org("org_amazon")
        assert deleted == 1
        assert await cache.lookup("What is the return policy?", org_id="org_amazon") is None
        assert await cache.lookup("What is the return policy?", org_id="org_flipkart") is not None


@pytest.mark.asyncio
async def test_upload_endpoint_invalidates_only_org_semantic_cache():
    """Verifies POST /api/ingest/upload invalidates semcache:{org_id}:* for the supervisor's org."""
    fake_redis = _InMemoryAsyncRedis()
    cache = SemanticCache(threshold=0.92, ttl=3600)
    fake_redis.store["semcache:org_amazon:1111"] = '{"query":"q","response":"amz"}'
    fake_redis.store["semcache:org_flipkart:2222"] = '{"query":"q","response":"fkt"}'

    amz_sup_token = create_access_token(
        {
            "id": "amz-sup-1",
            "email": "supervisor@amazon.demo",
            "role": "supervisor",
            "name": "Amazon Supervisor",
            "org_id": "org_amazon",
            "org_slug": "amazon",
        }
    )

    mock_upload_result = {
        "status": "success",
        "filename": "amz_update.txt",
        "file_type": ".txt",
        "chunks_indexed": 1,
        "tables_created": [],
        "suggested_prompts": ["Prompt 1", "Prompt 2"],
        "message": "Indexed",
    }

    uploaded_path = Path("data/uploads/org_amazon/amz_update.txt")
    try:
        with patch("server.get_semantic_cache", return_value=cache), \
             patch.object(cache, "get_client", AsyncMock(return_value=fake_redis)), \
             patch("server.process_uploaded_file", return_value=mock_upload_result):
            async with _client() as client:
                resp = await client.post(
                    "/api/ingest/upload",
                    files={"file": ("amz_update.txt", io.BytesIO(b"Amazon update"), "text/plain")},
                    headers={"Authorization": f"Bearer {amz_sup_token}"},
                )
                assert resp.status_code == 200
    finally:
        if uploaded_path.exists():
            uploaded_path.unlink()

    assert "semcache:org_amazon:1111" not in fake_redis.store
    assert "semcache:org_flipkart:2222" in fake_redis.store


# =====================================================================
# 6. Tenant Context Precedence & HITL Supervisor Isolation
# =====================================================================


@pytest.mark.asyncio
async def test_guest_x_org_slug_and_jwt_precedence():
    """
    Guest Mode resolves org_id from X-Org-Slug; authenticated JWT overrides spoofed X-Org-Slug.
    """
    fake_redis = _InMemoryAsyncRedis()
    cache = SemanticCache(threshold=0.92, ttl=3600)

    amz_user_token = create_access_token(
        {
            "id": "amz-user-1",
            "email": "customer@amazon.demo",
            "role": "user",
            "name": "Amazon Customer",
            "org_id": "org_amazon",
            "org_slug": "amazon",
        }
    )

    with patch("server.get_semantic_cache", return_value=cache), \
         patch.object(cache, "get_client", AsyncMock(return_value=fake_redis)), \
         patch.object(cache, "get_embedding", AsyncMock(return_value=[1.0, 0.0, 0.0])):
        await cache.set(
            query="Return policy?",
            response="Amazon 30-day electronics return window.",
            intent="safe_rag",
            org_id="org_amazon",
        )
        await cache.set(
            query="Return policy?",
            response="Flipkart 7-day replacement guarantee.",
            intent="safe_rag",
            org_id="org_flipkart",
        )

        async with _client() as client:
            # Guest with X-Org-Slug: flipkart -> gets Flipkart response
            r_guest_fkt = await client.post(
                "/ask",
                json={"query": "Return policy?", "thread_id": "guest-fkt-1"},
                headers={"X-Org-Slug": "flipkart"},
            )
            assert r_guest_fkt.status_code == 200
            assert "Flipkart 7-day" in r_guest_fkt.json()["response"]

            # Authenticated Amazon user sending spoofed X-Org-Slug: flipkart -> STILL gets Amazon
            r_auth_amz = await client.post(
                "/ask",
                json={"query": "Return policy?", "thread_id": "auth-amz-1"},
                headers={
                    "Authorization": f"Bearer {amz_user_token}",
                    "X-Org-Slug": "flipkart",
                },
            )
            assert r_auth_amz.status_code == 200
            assert "Amazon 30-day" in r_auth_amz.json()["response"]

            # Unknown X-Org-Slug -> 404
            r_unknown = await client.post(
                "/ask",
                json={"query": "Return policy?", "thread_id": "guest-bad-1"},
                headers={"X-Org-Slug": "nonexistent-org"},
            )
            assert r_unknown.status_code == 404


@pytest.mark.asyncio
async def test_hitl_supervisor_cross_tenant_resume_blocked():
    """
    Escalated Amazon thread cannot be resumed by a Flipkart or Nexus supervisor (HTTP 403),
    and succeeds only with an Amazon supervisor (HTTP 200).
    """
    thread_id = f"amz-hitl-{uuid.uuid4().hex[:8]}"
    mock_decision = RouteDecision(
        classification="escalation_hitl",
        confidence=0.99,
        reasoning="Customer threatening legal action.",
        detected_pii=[],
    )
    mock_router = AsyncMock()
    mock_router.ainvoke = AsyncMock(return_value=mock_decision)
    mock_router.return_value = mock_decision

    amz_sup_token = create_access_token(
        {
            "id": "amz-sup-id",
            "email": "supervisor@amazon.demo",
            "role": "supervisor",
            "name": "Amazon Supervisor",
            "org_id": "org_amazon",
            "org_slug": "amazon",
        }
    )
    fkt_sup_token = create_access_token(
        {
            "id": "fkt-sup-id",
            "email": "supervisor@flipkart.demo",
            "role": "supervisor",
            "name": "Flipkart Supervisor",
            "org_id": "org_flipkart",
            "org_slug": "flipkart",
        }
    )
    nexus_sup_token = create_access_token(
        {
            "id": "nxs-sup-id",
            "email": "supervisor@nexusrag.ai",
            "role": "supervisor",
            "name": "Nexus Supervisor",
            "org_id": "org_nexus",
            "org_slug": "nexus",
        }
    )

    with patch("main.router_llm", mock_router):
        async with _client() as client:
            # 1. Escalate under Amazon guest context
            ask_resp = await client.post(
                "/ask",
                json={"query": "I am suing over this fraudulent charge!", "thread_id": thread_id},
                headers={"X-Org-Slug": "amazon"},
            )
            assert ask_resp.status_code == 200
            assert ask_resp.json()["status"] == "escalated"

            # 2. Flipkart supervisor -> HTTP 403
            r_fkt = await client.post(
                "/api/chat/resume",
                json={"thread_id": thread_id, "response": "Flipkart override attempt"},
                headers={"Authorization": f"Bearer {fkt_sup_token}"},
            )
            assert r_fkt.status_code == 403

            # 3. Nexus supervisor -> HTTP 403
            r_nxs = await client.post(
                "/api/chat/resume",
                json={"thread_id": thread_id, "response": "Nexus override attempt"},
                headers={"Authorization": f"Bearer {nexus_sup_token}"},
            )
            assert r_nxs.status_code == 403

            # 4. Amazon supervisor -> HTTP 200
            r_amz = await client.post(
                "/api/chat/resume",
                json={"thread_id": thread_id, "response": "Amazon Supervisor: Refund issued."},
                headers={"Authorization": f"Bearer {amz_sup_token}"},
            )
            assert r_amz.status_code == 200
            assert r_amz.json()["status"] == "success"
            assert "Amazon Supervisor: Refund issued." in r_amz.json()["response"]
