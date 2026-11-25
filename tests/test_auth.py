import io
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import jwt
import pytest

from config import settings
from server import server
from utils.auth import (
    JWT_ALGORITHM,
    REFRESH_COOKIE_NAME,
    decode_access_token,
    get_jwt_secret,
    hash_password,
    init_auth_db,
    rate_limiter,
    seed_demo_users,
    verify_password,
)


@pytest.fixture(autouse=True)
def isolated_auth_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Provides an isolated temporary SQLite DB, JWT secret, and fresh rate limiter per test."""
    db_file = tmp_path / "test_nexus_auth.db"
    monkeypatch.setattr(settings, "SQLITE_DB_PATH", str(db_file))
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_file))
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-64-char-hex-0123456789abcdef0123456789abcdef")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setattr(settings, "REDIS_URL", "")
    rate_limiter.reset()
    init_auth_db()
    seed_demo_users()
    yield db_file
    rate_limiter.reset()


def _client(base_url: str = "https://testserver") -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=server), base_url=base_url)


# =====================================================================
# 1. Argon2id Hashing & Idempotent Schema / Demo Seeding
# =====================================================================


def test_argon2id_hashing_parameters():
    """Verifies memory-safe OWASP Argon2id parameters (m=19456, t=2, p=1)."""
    hashed = hash_password("StrongPass@2026")
    assert hashed.startswith("$argon2id$")
    assert "m=19456,t=2,p=1" in hashed
    assert verify_password("StrongPass@2026", hashed) is True
    assert verify_password("WrongPass@2026", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password("StrongPass@2026", "not-a-valid-hash") is False


def test_init_and_seed_demo_users_idempotent(isolated_auth_env: Path):
    """Verifies init_auth_db and seed_demo_users are idempotent and create both demo accounts."""
    init_auth_db()
    seed_demo_users()

    with sqlite3.connect(isolated_auth_env) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert {"users", "refresh_sessions", "user_threads"}.issubset(tables)

        users = conn.execute("SELECT email, role, full_name FROM users ORDER BY email").fetchall()
        assert len(users) == 2
        by_email = {email: (role, full_name) for email, role, full_name in users}
        assert by_email["user@nexusrag.ai"] == ("user", "Alex Rivera (Analyst)")
        assert by_email["supervisor@nexusrag.ai"] == ("supervisor", "Sarah Chen (Supervisor)")


# =====================================================================
# 2. Signup Validation, Duplicate Rejection & Anti-Escalation
# =====================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "full_name": "Alice Smith", "password": "Password1!"},
        {"email": "alice@example.com", "full_name": "A", "password": "Password1!"},
        {"email": "alice@example.com", "full_name": "A" * 61, "password": "Password1!"},
        {"email": "alice@example.com", "full_name": "Alice Smith", "password": "Short1!"},
        {"email": "alice@example.com", "full_name": "Alice Smith", "password": "lowercase1!"},
        {"email": "alice@example.com", "full_name": "Alice Smith", "password": "UPPERCASE1!"},
        {"email": "alice@example.com", "full_name": "Alice Smith", "password": "NoDigitsHere!"},
        {"email": "alice@example.com", "full_name": "Alice Smith", "password": "NoSpecial123"},
    ],
)
async def test_signup_validation_errors(payload: dict):
    """Rejects malformed emails, invalid name lengths, and weak passwords with HTTP 422."""
    async with _client() as client:
        resp = await client.post("/api/auth/signup", json=payload)
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signup_success_forces_user_role_and_rejects_duplicate():
    """
    Verifies valid signup creates a 'user' (ignoring any client-supplied 'role'),
    sets HttpOnly; Secure; SameSite=None refresh cookie, and rejects duplicate emails with 409.
    """
    async with _client() as client:
        resp = await client.post(
            "/api/auth/signup",
            json={
                "email": "Alice.Analyst@Example.com",
                "full_name": "  Alice Analyst  ",
                "password": "Password@2026!",
                "role": "supervisor",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 900
        assert data["user"]["email"] == "alice.analyst@example.com"
        assert data["user"]["full_name"] == "Alice Analyst"
        assert data["user"]["role"] == "user"
        assert data["refresh_token"]

        decoded = decode_access_token(data["access_token"])
        assert decoded["email"] == "alice.analyst@example.com"
        assert decoded["role"] == "user"

        set_cookie = resp.headers.get("set-cookie", "")
        assert f"{REFRESH_COOKIE_NAME}=" in set_cookie
        assert "HttpOnly" in set_cookie
        assert "Secure" in set_cookie
        assert "SameSite=none" in set_cookie.lower() or "samesite=none" in set_cookie.lower()

        # Duplicate email (different casing) -> 409 Conflict
        dup_resp = await client.post(
            "/api/auth/signup",
            json={
                "email": "alice.analyst@example.com",
                "full_name": "Alice Duplicate",
                "password": "Password@2026!",
            },
        )
        assert dup_resp.status_code == 409


# =====================================================================
# 3. Demo Login, Anti-Enumeration, Rate Limiting & Account Lockout
# =====================================================================


@pytest.mark.asyncio
async def test_demo_accounts_login_and_anti_enumeration():
    """Verifies seeded demo login and identical generic 401 errors for unknown email vs bad password."""
    async with _client() as client:
        r_user = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            headers={"X-Forwarded-For": "198.51.100.1"},
        )
        assert r_user.status_code == 200
        assert r_user.json()["user"]["role"] == "user"

        r_sup = await client.post(
            "/api/auth/login",
            json={"email": "supervisor@nexusrag.ai", "password": "Supervisor@2026!"},
            headers={"X-Forwarded-For": "198.51.100.2"},
        )
        assert r_sup.status_code == 200
        assert r_sup.json()["user"]["role"] == "supervisor"

        r_unknown = await client.post(
            "/api/auth/login",
            json={"email": "nobody@nexusrag.ai", "password": "WrongPassword1!"},
            headers={"X-Forwarded-For": "198.51.100.3"},
        )
        r_bad_pw = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "WrongPassword1!"},
            headers={"X-Forwarded-For": "198.51.100.4"},
        )
        assert r_unknown.status_code == 401
        assert r_bad_pw.status_code == 401
        assert r_unknown.json()["detail"] == "Invalid email or password"
        assert r_bad_pw.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_login_rate_limiting_429_per_ip():
    """Verifies sliding-window rate limiter enforces max 5 login attempts per 60s per IP."""
    async with _client() as client:
        ip_header = {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"}
        for _ in range(5):
            resp = await client.post(
                "/api/auth/login",
                json={"email": "nonexistent@nexusrag.ai", "password": "BadPassword1!"},
                headers=ip_header,
            )
            assert resp.status_code == 401

        blocked = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@nexusrag.ai", "password": "BadPassword1!"},
            headers=ip_header,
        )
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
        assert int(blocked.headers["Retry-After"]) >= 1
        assert "Too many attempts" in blocked.json()["detail"]

        # Different proxy IP is unaffected
        other_ip_resp = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            headers={"X-Forwarded-For": "203.0.113.11"},
        )
        assert other_ip_resp.status_code == 200


@pytest.mark.asyncio
async def test_signup_and_refresh_rate_limits():
    """Verifies max 3/hr signup and max 20/min refresh rate limits."""
    async with _client() as client:
        signup_ip = {"X-Forwarded-For": "192.0.2.50"}
        for idx in range(3):
            resp = await client.post(
                "/api/auth/signup",
                json={
                    "email": f"member{idx}@example.com",
                    "full_name": f"Member {idx}",
                    "password": "Password@2026!",
                },
                headers=signup_ip,
            )
            assert resp.status_code == 200

        blocked_signup = await client.post(
            "/api/auth/signup",
            json={
                "email": "member3@example.com",
                "full_name": "Member 3",
                "password": "Password@2026!",
            },
            headers=signup_ip,
        )
        assert blocked_signup.status_code == 429
        assert "Retry-After" in blocked_signup.headers

        # Refresh rate limit: 20 allowed, 21st returns 429
        refresh_ip = {"X-Forwarded-For": "192.0.2.51"}
        for _ in range(20):
            r = await client.post(
                "/api/auth/refresh",
                json={"refresh_token": "invalid-token"},
                headers=refresh_ip,
            )
            assert r.status_code == 401

        blocked_refresh = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid-token"},
            headers=refresh_ip,
        )
        assert blocked_refresh.status_code == 429


@pytest.mark.asyncio
async def test_account_lockout_after_5_failed_attempts(isolated_auth_env: Path):
    """
    Verifies 5 consecutive failed password attempts lock the user for 15 minutes
    and return HTTP 429 even if the correct password is supplied from a new IP.
    """
    async with _client() as client:
        for attempt in range(5):
            resp = await client.post(
                "/api/auth/login",
                json={"email": "user@nexusrag.ai", "password": "WrongPassword!"},
                headers={"X-Forwarded-For": f"10.10.0.{attempt + 1}"},
            )
            assert resp.status_code == 401

        with sqlite3.connect(isolated_auth_env) as conn:
            row = conn.execute(
                "SELECT failed_attempts, locked_until FROM users WHERE email = ?",
                ("user@nexusrag.ai",),
            ).fetchone()
            assert row[0] == 5
            assert row[1] is not None
            locked_dt = datetime.fromisoformat(row[1])
            assert locked_dt > datetime.now(timezone.utc) + timedelta(minutes=14)

        # Even valid password from fresh IP is blocked with 429 while locked
        locked_resp = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            headers={"X-Forwarded-For": "10.10.0.99"},
        )
        assert locked_resp.status_code == 429
        assert "Retry-After" in locked_resp.headers
        assert int(locked_resp.headers["Retry-After"]) > 800

        # Once lockout expires, valid login succeeds and resets failed_attempts
        expired_iso = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
        with sqlite3.connect(isolated_auth_env) as conn:
            conn.execute(
                "UPDATE users SET locked_until = ? WHERE email = ?",
                (expired_iso, "user@nexusrag.ai"),
            )
            conn.commit()

        unlocked_resp = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            headers={"X-Forwarded-For": "10.10.0.100"},
        )
        assert unlocked_resp.status_code == 200

        with sqlite3.connect(isolated_auth_env) as conn:
            row = conn.execute(
                "SELECT failed_attempts, locked_until FROM users WHERE email = ?",
                ("user@nexusrag.ai",),
            ).fetchone()
            assert row[0] == 0
            assert row[1] is None


@pytest.mark.asyncio
async def test_redis_rate_limiter_and_fail_open_fallback(monkeypatch: pytest.MonkeyPatch):
    """Verifies Redis ZSET rate limiter when reachable and clean fallback to deque on error."""
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    rate_limiter.reset()

    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.zremrangebyscore = AsyncMock(return_value=0)
    mock_redis.zcard = AsyncMock(return_value=5)
    mock_redis.zrange = AsyncMock(return_value=[("m1", 1000.0)])

    mock_cache = MagicMock()
    mock_cache.get_client = AsyncMock(return_value=mock_redis)

    with patch("utils.auth.get_semantic_cache", return_value=mock_cache):
        with patch("utils.auth.time.time", return_value=1010.0):
            async with _client() as client:
                resp = await client.post(
                    "/api/auth/login",
                    json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
                )
                assert resp.status_code == 429
                assert resp.headers["Retry-After"] == "50"

    # When Redis fails, falls back cleanly to in-memory deque without crashing
    rate_limiter.reset()
    mock_redis.ping = AsyncMock(side_effect=ConnectionError("Redis offline"))
    with patch("utils.auth.get_semantic_cache", return_value=mock_cache):
        async with _client() as client:
            resp = await client.post(
                "/api/auth/login",
                json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            )
            assert resp.status_code == 200


# =====================================================================
# 4. JWT, Refresh Rotation, Logout & /api/auth/me
# =====================================================================


@pytest.mark.asyncio
async def test_refresh_rotation_cookie_json_and_logout(isolated_auth_env: Path):
    """
    Verifies:
    - GET /api/auth/me works for Guest Mode and Authenticated users
    - Refresh rotation works via HttpOnly cookie and JSON body
    - Old refresh tokens are revoked in SQLite on rotation and cannot be replayed
    - Logout revokes session and clears cookie
    """
    async with _client(base_url="https://testserver") as client:
        # Guest Mode /api/auth/me
        me_guest = await client.get("/api/auth/me")
        assert me_guest.status_code == 200
        assert me_guest.json() == {"authenticated": False, "user": None}

        # Login as analyst
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
        )
        assert login_resp.status_code == 200
        tokens = login_resp.json()
        access_1 = tokens["access_token"]
        refresh_1 = tokens["refresh_token"]

        # Verify JWT claims
        claims = jwt.decode(access_1, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        assert claims["email"] == "user@nexusrag.ai"
        assert claims["role"] == "user"
        assert claims["name"] == "Alex Rivera (Analyst)"
        assert "sub" in claims and "exp" in claims

        # Authenticated /api/auth/me
        me_auth = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {access_1}"}
        )
        assert me_auth.status_code == 200
        assert me_auth.json()["authenticated"] is True
        assert me_auth.json()["user"]["role"] == "user"

        # Rotate via cookie (sent automatically over https://testserver)
        refresh_resp = await client.post("/api/auth/refresh")
        assert refresh_resp.status_code == 200
        rotated = refresh_resp.json()
        refresh_2 = rotated["refresh_token"]
        assert refresh_2 != refresh_1

        # Replaying old refresh_1 via JSON must fail with 401
        replay_resp = await client.post(
            "/api/auth/refresh", json={"refresh_token": refresh_1}
        )
        assert replay_resp.status_code == 401

        # Rotate refresh_2 via JSON body -> refresh_3
        refresh_json_resp = await client.post(
            "/api/auth/refresh", json={"refresh_token": refresh_2}
        )
        assert refresh_json_resp.status_code == 200
        refresh_3 = refresh_json_resp.json()["refresh_token"]
        assert refresh_3 != refresh_2

        # Logout revokes refresh_3 and clears cookie
        logout_resp = await client.post(
            "/api/auth/logout", json={"refresh_token": refresh_3}
        )
        assert logout_resp.status_code == 200
        assert logout_resp.json()["status"] == "success"

        # refresh_3 can no longer be used
        after_logout = await client.post(
            "/api/auth/refresh", json={"refresh_token": refresh_3}
        )
        assert after_logout.status_code == 401


# =====================================================================
# 5. RBAC Enforcement & Authenticated Stream Thread Recording
# =====================================================================


@pytest.mark.asyncio
async def test_rbac_upload_and_resume_enforcement():
    """
    Verifies /api/upload, /api/ingest/upload, and /api/chat/resume:
    - Return 401 when unauthenticated
    - Return 403 when authenticated as 'user'
    - Allow access (200) when authenticated as 'supervisor'
    """
    async with _client() as client:
        user_login = await client.post(
            "/api/auth/login",
            json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            headers={"X-Forwarded-For": "198.51.100.20"},
        )
        user_headers = {"Authorization": f"Bearer {user_login.json()['access_token']}"}

        sup_login = await client.post(
            "/api/auth/login",
            json={"email": "supervisor@nexusrag.ai", "password": "Supervisor@2026!"},
            headers={"X-Forwarded-For": "198.51.100.21"},
        )
        sup_headers = {"Authorization": f"Bearer {sup_login.json()['access_token']}"}

        def _file_payload():
            return {"file": ("policy.txt", io.BytesIO(b"Sample policy"), "text/plain")}

        # 1. Unauthenticated -> 401
        assert (await client.post("/api/upload", files=_file_payload())).status_code == 401
        assert (await client.post("/api/ingest/upload", files=_file_payload())).status_code == 401
        assert (
            await client.post(
                "/api/chat/resume", json={"thread_id": "t-1", "response": "Approved"}
            )
        ).status_code == 401

        # 2. Analyst ('user') -> 403 Forbidden
        r_user_upload = await client.post(
            "/api/upload", files=_file_payload(), headers=user_headers
        )
        assert r_user_upload.status_code == 403
        assert "Supervisor role required" in r_user_upload.json()["detail"]

        r_user_resume = await client.post(
            "/api/chat/resume",
            json={"thread_id": "t-1", "response": "Approved"},
            headers=user_headers,
        )
        assert r_user_resume.status_code == 403
        assert "Supervisor role required" in r_user_resume.json()["detail"]

        # 3. Supervisor -> 200 OK
        mock_upload_result = {
            "status": "success",
            "filename": "policy.txt",
            "file_type": ".txt",
            "chunks_indexed": 1,
            "tables_created": [],
            "suggested_prompts": ["What is the policy?", "Summarize the policy."],
            "message": "Indexed successfully",
        }
        try:
            with patch("server.process_uploaded_file", return_value=mock_upload_result):
                r_sup_upload = await client.post(
                    "/api/upload", files=_file_payload(), headers=sup_headers
                )
                assert r_sup_upload.status_code == 200
                assert r_sup_upload.json()["status"] == "success"
        finally:
            uploaded = Path("data/uploads/policy.txt")
            if uploaded.exists():
                uploaded.unlink()

        mock_snapshot = MagicMock()
        mock_snapshot.next = ("human_review_node",)
        mock_after = MagicMock()
        mock_after.next = ()
        with patch("server.graph_app.get_state", side_effect=[mock_snapshot, mock_after]), \
             patch("server.graph_app.update_state"), \
             patch("server.graph_app.ainvoke", AsyncMock(return_value={"response": "Approved", "intent": "human_review"})):
            r_sup_resume = await client.post(
                "/api/chat/resume",
                json={"thread_id": "t-1", "response": "Approved"},
                headers=sup_headers,
            )
            assert r_sup_resume.status_code == 200
            assert r_sup_resume.json()["status"] == "success"


@pytest.mark.asyncio
async def test_chat_stream_guest_and_authenticated_thread_tracking(isolated_auth_env: Path):
    """
    Verifies POST /api/chat/stream remains accessible to Guests and records
    session_id -> user_id in user_threads when authenticated.
    """
    mock_cache = AsyncMock()
    mock_cache.lookup = AsyncMock(
        return_value={
            "hit": True,
            "similarity": 0.99,
            "query": "Return policy?",
            "response": "30-day returns.",
            "intent": "safe_rag",
            "retrieved_chunks": [],
        }
    )

    with patch("server.get_semantic_cache", return_value=mock_cache):
        async with _client() as client:
            # Guest Mode works
            guest_resp = await client.post(
                "/api/chat/stream",
                json={"query": "Return policy?", "thread_id": "guest-thread-1"},
            )
            assert guest_resp.status_code == 200

            # Authenticated user records thread in user_threads
            login_resp = await client.post(
                "/api/auth/login",
                json={"email": "user@nexusrag.ai", "password": "DemoUser@2026!"},
            )
            token = login_resp.json()["access_token"]
            user_id = login_resp.json()["user"]["id"]

            auth_resp = await client.post(
                "/api/chat/stream",
                json={"query": "Return policy?", "thread_id": "auth-thread-1"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert auth_resp.status_code == 200

    with sqlite3.connect(isolated_auth_env) as conn:
        rows = conn.execute(
            "SELECT session_id, user_id, title FROM user_threads"
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "auth-thread-1"
        assert rows[0][1] == user_id
        assert rows[0][2] == "Return policy?"


@pytest.mark.asyncio
async def test_cors_allows_configured_origins_with_credentials():
    """Verifies explicit CORS origins allow credentials for cross-origin refresh cookies."""
    async with _client() as client:
        for origin in ("https://nexus-rag-control-plane.vercel.app", "http://localhost:5173"):
            preflight = await client.options(
                "/api/auth/login",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                },
            )
            assert preflight.status_code == 200
            assert preflight.headers.get("access-control-allow-origin") == origin
            assert preflight.headers.get("access-control-allow-credentials") == "true"
