import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .trim()
  .replace(/\/+$/, '');

const ACCESS_TOKEN_KEY = 'nexus_rag_access_token';
const REFRESH_TOKEN_KEY = 'nexus_rag_refresh_token';

const AuthContext = createContext(null);

function readSessionStorage(key) {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeSessionStorage(key, value) {
  try {
    if (typeof window === 'undefined') return;
    if (value) {
      window.sessionStorage.setItem(key, value);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

function decodeJwtExp(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload?.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token, bufferSeconds = 15) {
  const exp = decodeJwtExp(token);
  if (!exp) return false;
  return Date.now() / 1000 >= exp - bufferSeconds;
}

function parseRetryAfter(response, data) {
  const headerVal = response?.headers?.get?.('Retry-After');
  if (headerVal) {
    const parsed = parseInt(headerVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const detailText = typeof data?.detail === 'string' ? data.detail : '';
  const match = detailText.match(/Try again in\s+(\d+)\s*s/i) || detailText.match(/(\d+)\s*s/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 60;
}

function extractErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail;
  }
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const messages = data.detail
      .map((item) => item?.msg || (typeof item === 'string' ? item : ''))
      .filter(Boolean);
    if (messages.length > 0) return messages.join(' ');
  }
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  return fallback;
}

function resolveApiUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function isAuthLifecycleEndpoint(resolvedUrl) {
  return (
    resolvedUrl.includes('/api/auth/refresh') ||
    resolvedUrl.includes('/api/auth/login') ||
    resolvedUrl.includes('/api/auth/signup') ||
    resolvedUrl.includes('/api/auth/logout')
  );
}

export function AuthProvider({ children }) {
  const initialAccess = readSessionStorage(ACCESS_TOKEN_KEY);
  const initialRefresh = readSessionStorage(REFRESH_TOKEN_KEY);

  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(initialAccess);
  const [refreshToken, setRefreshToken] = useState(initialRefresh);
  const [authLoading, setAuthLoading] = useState(true);

  const accessTokenRef = useRef(initialAccess);
  const refreshTokenRef = useRef(initialRefresh);
  const refreshPromiseRef = useRef(null);

  const applyAuthSession = useCallback((authData) => {
    const nextAccess = authData?.access_token || null;
    const nextRefresh = authData?.refresh_token || null;
    const nextUser = authData?.user || null;

    accessTokenRef.current = nextAccess;
    refreshTokenRef.current = nextRefresh;

    setAccessToken(nextAccess);
    setRefreshToken(nextRefresh);
    setUser(nextUser);

    writeSessionStorage(ACCESS_TOKEN_KEY, nextAccess);
    writeSessionStorage(REFRESH_TOKEN_KEY, nextRefresh);
  }, []);

  const clearAuthSession = useCallback(() => {
    accessTokenRef.current = null;
    refreshTokenRef.current = null;

    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);

    writeSessionStorage(ACCESS_TOKEN_KEY, null);
    writeSessionStorage(REFRESH_TOKEN_KEY, null);
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = (async () => {
      const storedRefresh = refreshTokenRef.current || readSessionStorage(REFRESH_TOKEN_KEY);
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storedRefresh ? { refresh_token: storedRefresh } : {}),
        });

        if (!res.ok) {
          if (res.status === 401) {
            clearAuthSession();
          }
          return null;
        }

        const data = await res.json();
        applyAuthSession(data);
        return data;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, [applyAuthSession, clearAuthSession]);

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      try {
        const refreshed = await refreshSession();
        const activeToken = refreshed?.access_token || accessTokenRef.current;

        const headers = new Headers();
        if (activeToken) {
          headers.set('Authorization', `Bearer ${activeToken}`);
        }

        const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        if (!active) return;

        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.authenticated && meData?.user) {
            setUser(meData.user);
          } else {
            clearAuthSession();
          }
        } else if (!refreshed) {
          clearAuthSession();
        }
      } catch {
        if (active && !accessTokenRef.current) {
          clearAuthSession();
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    bootstrapSession();

    return () => {
      active = false;
    };
  }, [refreshSession, clearAuthSession]);

  const authFetch = useCallback(
    async (url, options = {}) => {
      const targetUrl = resolveApiUrl(url);
      const isAuthEndpoint = isAuthLifecycleEndpoint(targetUrl);

      if (!isAuthEndpoint && accessTokenRef.current && isTokenExpiringSoon(accessTokenRef.current)) {
        await refreshSession();
      }

      const headers = new Headers(options.headers || {});
      if (accessTokenRef.current && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${accessTokenRef.current}`);
      }

      let response = await fetch(targetUrl, {
        ...options,
        credentials: 'include',
        headers,
      });

      if (response.status === 401 && !isAuthEndpoint) {
        const refreshed = await refreshSession();
        if (refreshed?.access_token) {
          const retryHeaders = new Headers(options.headers || {});
          retryHeaders.set('Authorization', `Bearer ${refreshed.access_token}`);
          response = await fetch(targetUrl, {
            ...options,
            credentials: 'include',
            headers: retryHeaders,
          });
        } else {
          clearAuthSession();
        }
      }

      return response;
    },
    [refreshSession, clearAuthSession]
  );

  const submitAuthRequest = useCallback(
    async (endpointOrUrl, payload, fallbackError) => {
      const targetUrl = resolveApiUrl(endpointOrUrl);
      const res = await fetch(targetUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const message = extractErrorMessage(data, fallbackError);
        const err = new Error(message);
        err.status = res.status;
        err.detail = message;
        if (res.status === 429) {
          err.retryAfter = parseRetryAfter(res, data);
        }
        throw err;
      }

      applyAuthSession(data);
      return data;
    },
    [applyAuthSession]
  );

  const login = useCallback(
    async (email, password) => {
      return submitAuthRequest(
        `${API_BASE_URL}/api/auth/login`,
        { email: email.trim(), password },
        'Invalid email or password.'
      );
    },
    [submitAuthRequest]
  );

  const signup = useCallback(
    async (fullName, email, password) => {
      return submitAuthRequest(
        `${API_BASE_URL}/api/auth/signup`,
        { full_name: fullName.trim(), email: email.trim(), password },
        'Unable to create account. Please verify your details.'
      );
    },
    [submitAuthRequest]
  );

  const loginAsDemo = useCallback(
    async (role) => {
      if (role === 'supervisor') {
        return login('supervisor@nexusrag.ai', 'Supervisor@2026!');
      }
      return login('user@nexusrag.ai', 'DemoUser@2026!');
    },
    [login]
  );

  const logout = useCallback(async () => {
    const currentRefresh = refreshTokenRef.current || readSessionStorage(REFRESH_TOKEN_KEY);
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRefresh ? { refresh_token: currentRefresh } : {}),
      });
    } catch {
      // Clear client session even if server logout request fails
    } finally {
      clearAuthSession();
    }
  }, [clearAuthSession]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      authLoading,
      isAuthenticated: Boolean(user),
      isSupervisor: user?.role === 'supervisor',
      authFetch,
      login,
      signup,
      loginAsDemo,
      logout,
      refreshSession,
    }),
    [
      user,
      accessToken,
      refreshToken,
      authLoading,
      authFetch,
      login,
      signup,
      loginAsDemo,
      logout,
      refreshSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
