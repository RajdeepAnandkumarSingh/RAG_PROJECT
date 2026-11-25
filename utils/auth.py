import hashlib
import logging
import math
import os
import secrets
import sqlite3
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, Optional, Tuple

import jwt
from fastapi import HTTPException, Request, Response, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from config import settings
from utils.semantic_cache import get_semantic_cache

logger = logging.getLogger("nexus.auth")

# Memory-safe Argon2id configuration (19 MiB OWASP standard, safe for 512 MB containers)
password_hasher = PasswordHash(
    (Argon2Hasher(time_cost=2, memory_cost=19456, parallelism=1),)
)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
REFRESH_COOKIE_NAME = "nexus_refresh_token"
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    "login": (5, 60),
    "signup": (3, 3600),
    "refresh": (20, 60),
}

DEMO_USERS = (
    {
        "email": "user@nexusrag.ai",
        "password": "DemoUser@2026!",
        "role": "user",
        "full_name": "Alex Rivera (Analyst)",
    },
    {
        "email": "supervisor@nexusrag.ai",
        "password": "Supervisor@2026!",
        "role": "supervisor",
        "full_name": "Sarah Chen (Supervisor)",
    },
)

bearer_scheme = HTTPBearer(auto_error=False)


class UserAlreadyExistsError(Exception):
    """Raised when attempting to register an already existing email."""


class InvalidCredentialsError(Exception):
    """Raised on unknown email or mismatched password."""


class AccountLockedError(Exception):
    """Raised when a user account is temporarily locked after repeated failures."""

    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Account locked for {retry_after}s.")


class InvalidRefreshTokenError(Exception):
    """Raised when a refresh token is missing, unknown, revoked, or expired."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _get_db_path(db_path: Optional[str] = None) -> str:
    return (
        db_path
        or os.getenv("SQLITE_DB_PATH")
        or getattr(settings, "SQLITE_DB_PATH", "data/nexus_structured.db")
        or "data/nexus_structured.db"
    )


def get_jwt_secret() -> str:
    return (
        os.getenv("JWT_SECRET_KEY")
        or getattr(settings, "JWT_SECRET_KEY", "")
        or "nexus-rag-production-jwt-secret-key-2026-change-me"
    )


def hash_password(password: str) -> str:
    """Hashes a plaintext password using memory-safe Argon2id."""
    return password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against an Argon2id hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return password_hasher.verify(plain_password, hashed_password)
    except Exception:
        return False


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    resolved_path = _get_db_path(db_path)
    parent = os.path.dirname(resolved_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(resolved_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db(db_path: Optional[str] = None) -> None:
    """Idempotently creates auth and session tables inside SQLite."""
    conn = _connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
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
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS refresh_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS user_threads (
                session_id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_sessions(token_hash);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_threads_user_id ON user_threads(user_id);"
        )
        conn.commit()
    finally:
        conn.close()


def seed_demo_users(db_path: Optional[str] = None) -> None:
    """Idempotently inserts pre-seeded Analyst and Supervisor demo accounts."""
    init_auth_db(db_path)
    conn = _connect(db_path)
    try:
        cursor = conn.cursor()
        now_iso = _utc_now().isoformat()
        for account in DEMO_USERS:
            email = account["email"].strip().lower()
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if cursor.fetchone() is not None:
                continue
            cursor.execute(
                """
                INSERT INTO users (
                    id, email, full_name, password_hash, role,
                    failed_attempts, locked_until, created_at
                )
                VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
                """,
                (
                    uuid.uuid4().hex,
                    email,
                    account["full_name"],
                    hash_password(account["password"]),
                    account["role"],
                    now_iso,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def _format_user_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "name": row["full_name"],
        "role": row["role"],
    }


def create_user(
    email: str,
    full_name: str,
    password: str,
    role: str = "user",
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Creates a new user in SQLite, raising UserAlreadyExistsError on duplicate email."""
    init_auth_db(db_path)
    normalized_email = email.strip().lower()
    clean_name = full_name.strip()
    user_id = uuid.uuid4().hex
    now_iso = _utc_now().isoformat()
    password_hash = hash_password(password)

    conn = _connect(db_path)
    try:
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO users (
                    id, email, full_name, password_hash, role,
                    failed_attempts, locked_until, created_at
                )
                VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
                """,
                (user_id, normalized_email, clean_name, password_hash, role, now_iso),
            )
            conn.commit()
        except sqlite3.IntegrityError as exc:
            raise UserAlreadyExistsError("An account with this email already exists.") from exc
    finally:
        conn.close()

    return {
        "id": user_id,
        "email": normalized_email,
        "full_name": clean_name,
        "name": clean_name,
        "role": role,
    }


def authenticate_user(
    email: str,
    password: str,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Validates user credentials, enforces 5-failure / 15-minute lockout,
    and returns sanitized user dict or raises InvalidCredentialsError / AccountLockedError.
    """
    init_auth_db(db_path)
    normalized_email = email.strip().lower()
    now = _utc_now()

    conn = _connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (normalized_email,))
        row = cursor.fetchone()
        if row is None:
            raise InvalidCredentialsError("Invalid email or password")

        locked_until_raw = row["locked_until"]
        if locked_until_raw:
            try:
                locked_until_dt = datetime.fromisoformat(locked_until_raw)
                if locked_until_dt.tzinfo is None:
                    locked_until_dt = locked_until_dt.replace(tzinfo=timezone.utc)
                if locked_until_dt > now:
                    remaining = max(1, math.ceil((locked_until_dt - now).total_seconds()))
                    raise AccountLockedError(remaining)
            except AccountLockedError:
                raise
            except ValueError:
                pass

        if not verify_password(password, row["password_hash"]):
            failed_attempts = int(row["failed_attempts"] or 0) + 1
            locked_until_str = None
            if failed_attempts >= MAX_FAILED_ATTEMPTS:
                locked_until_str = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()

            cursor.execute(
                "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?",
                (failed_attempts, locked_until_str, row["id"]),
            )
            conn.commit()
            raise InvalidCredentialsError("Invalid email or password")

        if int(row["failed_attempts"] or 0) != 0 or row["locked_until"] is not None:
            cursor.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?",
                (row["id"],),
            )
            conn.commit()

        return _format_user_row(row)
    finally:
        conn.close()


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_session(user_id: str, db_path: Optional[str] = None) -> str:
    """Generates a 7-day refresh token and persists its SHA-256 hash in SQLite."""
    init_auth_db(db_path)
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_refresh_token(raw_token)
    now = _utc_now()
    expires_at = (now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()

    conn = _connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at, revoked, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (uuid.uuid4().hex, user_id, token_hash, expires_at, now.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()

    return raw_token


def rotate_refresh_session(
    refresh_token: str, db_path: Optional[str] = None
) -> Tuple[Dict[str, Any], str]:
    """
    Validates an existing refresh token, revokes it, and issues a rotated token pair.
    """
    if not refresh_token:
        raise InvalidRefreshTokenError("Refresh token missing.")

    init_auth_db(db_path)
    token_hash = _hash_refresh_token(refresh_token)
    now = _utc_now()

    conn = _connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM refresh_sessions WHERE token_hash = ?",
            (token_hash,),
        )
        session_row = cursor.fetchone()
        if session_row is None or int(session_row["revoked"] or 0) != 0:
            raise InvalidRefreshTokenError("Invalid or revoked refresh token.")

        expires_at = datetime.fromisoformat(session_row["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            cursor.execute(
                "UPDATE refresh_sessions SET revoked = 1 WHERE id = ?",
                (session_row["id"],),
            )
            conn.commit()
            raise InvalidRefreshTokenError("Refresh token expired.")

        cursor.execute("SELECT * FROM users WHERE id = ?", (session_row["user_id"],))
        user_row = cursor.fetchone()
        if user_row is None:
            raise InvalidRefreshTokenError("User no longer exists.")

        cursor.execute(
            "UPDATE refresh_sessions SET revoked = 1 WHERE id = ?",
            (session_row["id"],),
        )
        new_raw_token = secrets.token_urlsafe(48)
        new_hash = _hash_refresh_token(new_raw_token)
        new_expires_at = (now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
        cursor.execute(
            """
            INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at, revoked, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            """,
            (uuid.uuid4().hex, user_row["id"], new_hash, new_expires_at, now.isoformat()),
        )
        conn.commit()
        return _format_user_row(user_row), new_raw_token
    finally:
        conn.close()


def revoke_refresh_session(refresh_token: str, db_path: Optional[str] = None) -> None:
    """Marks a refresh session as revoked in SQLite."""
    if not refresh_token:
        return
    init_auth_db(db_path)
    token_hash = _hash_refresh_token(refresh_token)
    conn = _connect(db_path)
    try:
        conn.execute(
            "UPDATE refresh_sessions SET revoked = 1 WHERE token_hash = ?",
            (token_hash,),
        )
        conn.commit()
    finally:
        conn.close()


def record_user_thread(
    session_id: str,
    user_id: Optional[str],
    title: Optional[str] = None,
    db_path: Optional[str] = None,
) -> None:
    """Associates a chat thread session_id with an authenticated user_id."""
    if not session_id or not user_id:
        return
    init_auth_db(db_path)
    now_iso = _utc_now().isoformat()
    clean_title = title.strip()[:120] if title else None
    conn = _connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO user_threads (session_id, user_id, title, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                user_id = COALESCE(user_threads.user_id, excluded.user_id),
                title = COALESCE(user_threads.title, excluded.title),
                updated_at = excluded.updated_at
            """,
            (session_id, user_id, clean_title, now_iso),
        )
        conn.commit()
    finally:
        conn.close()


def create_access_token(
    user: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a 15-minute HS256 JWT access token."""
    now = _utc_now()
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "name": user.get("name") or user.get("full_name", ""),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decodes and validates an HS256 JWT access token."""
    payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    user_id = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role")
    name = payload.get("name", "")
    if not user_id or not email or not role:
        raise jwt.InvalidTokenError("Token missing required claims.")
    return {
        "id": user_id,
        "email": email,
        "role": role,
        "name": name,
        "full_name": name,
    }


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Sets HttpOnly; Secure; SameSite=None refresh token cookie."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    """Clears the refresh token cookie."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )


def get_client_ip(request: Request) -> str:
    """Extracts proxy-aware client IP from X-Forwarded-For or request.client.host."""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class SlidingWindowRateLimiter:
    """
    Proxy-aware sliding-window rate limiter using Redis ZSET when reachable,
    with a thread-safe in-memory collections.deque fallback.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: Dict[str, Deque[float]] = defaultdict(deque)
        self._redis_unavailable_until: float = 0.0

    def reset(self) -> None:
        """Clears in-memory sliding windows (useful for test isolation)."""
        with self._lock:
            self._windows.clear()
            self._redis_unavailable_until = 0.0

    async def _try_redis_limit(
        self, key: str, max_requests: int, window_seconds: int
    ) -> Optional[bool]:
        """
        Attempts sliding-window check in Redis.
        Returns True if allowed, raises HTTPException(429) if exceeded,
        or returns None if Redis is unconfigured/unreachable.
        """
        redis_url = os.getenv("REDIS_URL") or getattr(settings, "REDIS_URL", "")
        if not redis_url:
            return None

        now = time.time()
        if now < self._redis_unavailable_until:
            return None

        try:
            client = await get_semantic_cache().get_client()
            await client.ping()

            redis_key = f"nexus:ratelimit:{key}"
            window_start = now - window_seconds
            await client.zremrangebyscore(redis_key, "-inf", window_start)
            current_count = await client.zcard(redis_key)

            if current_count >= max_requests:
                oldest = await client.zrange(redis_key, 0, 0, withscores=True)
                oldest_ts = float(oldest[0][1]) if oldest else now
                retry_after = max(1, math.ceil(oldest_ts + window_seconds - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Try again in {retry_after}s.",
                    headers={"Retry-After": str(retry_after)},
                )

            member = f"{now}:{secrets.token_hex(4)}"
            await client.zadd(redis_key, {member: now})
            await client.expire(redis_key, window_seconds)
            return True
        except HTTPException:
            raise
        except Exception as exc:
            logger.debug(f"Redis rate limiter unavailable ({exc}); using in-memory deque fallback.")
            self._redis_unavailable_until = time.time() + 30.0
            return None

    def _check_memory_limit(
        self, key: str, max_requests: int, window_seconds: int
    ) -> None:
        with self._lock:
            now = time.time()
            cutoff = now - window_seconds
            dq = self._windows[key]
            while dq and dq[0] <= cutoff:
                dq.popleft()

            if len(dq) >= max_requests:
                retry_after = max(1, math.ceil(dq[0] + window_seconds - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Try again in {retry_after}s.",
                    headers={"Retry-After": str(retry_after)},
                )

            dq.append(now)

    async def check(self, request: Request, scope: str) -> None:
        """Enforces sliding-window limit for a named endpoint scope."""
        max_requests, window_seconds = RATE_LIMITS[scope]
        client_ip = get_client_ip(request)
        key = f"{scope}:{client_ip}"

        redis_result = await self._try_redis_limit(key, max_requests, window_seconds)
        if redis_result is True:
            return

        self._check_memory_limit(key, max_requests, window_seconds)


rate_limiter = SlidingWindowRateLimiter()


async def rate_limit_login(request: Request) -> None:
    await rate_limiter.check(request, "login")


async def rate_limit_signup(request: Request) -> None:
    await rate_limiter.check(request, "signup")


async def rate_limit_refresh(request: Request) -> None:
    await rate_limiter.check(request, "refresh")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> Optional[Dict[str, Any]]:
    """
    Extracts and validates Authorization: Bearer <token> if present.
    Returns the user dict or None (never raises 401 so Guest Mode works).
    """
    if credentials is None or not credentials.credentials:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except Exception:
        return None


async def require_supervisor(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> Dict[str, Any]:
    """
    Requires an authenticated user with role == 'supervisor'.
    Raises HTTP 401 if unauthenticated or HTTP 403 if role is not supervisor.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user = decode_access_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if user.get("role") != "supervisor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor role required for this action.",
        )
    return user
