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
const ACTIVE_ORG_KEY = 'nexus_rag_active_org';

export const DEFAULT_ORG = {
  org_id: 'org_nexus',
  name: 'Nexus Enterprise',
  slug: 'nexus',
};

const FALLBACK_ORGS = [
  DEFAULT_ORG,
  { org_id: 'org_amazon', name: 'Amazon Support', slug: 'amazon' },
  { org_id: 'org_flipkart', name: 'Flipkart Support', slug: 'flipkart' },
];

export const ORG_DEMO_ACCOUNTS = {
  nexus: {
    user: { email: 'user@nexusrag.ai', password: 'DemoUser@2026!' },
    supervisor: { email: 'supervisor@nexusrag.ai', password: 'Supervisor@2026!' },
  },
  amazon: {
    user: { email: 'customer@amazon.demo', password: 'DemoUser@2026!' },
    supervisor: { email: 'supervisor@amazon.demo', password: 'Supervisor@2026!' },
  },
  flipkart: {
    user: { email: 'customer@flipkart.demo', password: 'DemoUser@2026!' },
    supervisor: { email: 'supervisor@flipkart.demo', password: 'Supervisor@2026!' },
  },
};

function readStoredOrg() {
  const raw = readSessionStorage(ACTIVE_ORG_KEY);
  if (!raw) return DEFAULT_ORG;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.org_id && parsed?.slug) {
      return {
        org_id: parsed.org_id,
        name: parsed.name || parsed.slug,
        slug: parsed.slug,
      };
    }
  } catch {
    // Ignore malformed stored org
  }
  return DEFAULT_ORG;
}

function writeStoredOrg(org) {
  if (!org?.org_id || !org?.slug) {
    writeSessionStorage(ACTIVE_ORG_KEY, null);
    return;
  }
  writeSessionStorage(ACTIVE_ORG_KEY, JSON.stringify(org));
}

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
    resolvedUrl.includes('/api/auth/logout') ||
    resolvedUrl.includes('/api/orgs/register')
  );
}

export function AuthProvider({ children }) {
  const initialAccess = readSessionStorage(ACCESS_TOKEN_KEY);
  const initialRefresh = readSessionStorage(REFRESH_TOKEN_KEY);
  const initialOrg = readStoredOrg();

  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(initialAccess);
  const [refreshToken, setRefreshToken] = useState(initialRefresh);
  const [authLoading, setAuthLoading] = useState(true);
  const [organizations, setOrganizations] = useState(FALLBACK_ORGS);
  const [activeOrg, setActiveOrg] = useState(initialOrg);

  const accessTokenRef = useRef(initialAccess);
  const refreshTokenRef = useRef(initialRefresh);
  const activeOrgRef = useRef(initialOrg);
  const organizationsRef = useRef(FALLBACK_ORGS);
  const refreshPromiseRef = useRef(null);

  const applyActiveOrg = useCallback((org) => {
    const nextOrg =
      org && org.org_id && org.slug
        ? {
            org_id: org.org_id,
            name: org.name || org.slug,
            slug: org.slug,
          }
        : DEFAULT_ORG;
    activeOrgRef.current = nextOrg;
    setActiveOrg(nextOrg);
    writeStoredOrg(nextOrg);
    return nextOrg;
  }, []);

  const refreshOrganizations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/orgs`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        organizationsRef.current = list;
        setOrganizations(list);
        const currentSlug = activeOrgRef.current?.slug;
        const matched = list.find((o) => o.slug === currentSlug || o.org_id === activeOrgRef.current?.org_id);
        if (matched) {
          applyActiveOrg(matched);
        }
        return list;
      }
    } catch {
      // Keep fallback organizations when backend is offline
    }
    return null;
  }, [applyActiveOrg]);

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

    if (authData?.organization?.org_id && authData?.organization?.slug) {
      const newOrg = applyActiveOrg(authData.organization);
      const prev = organizationsRef.current || [];
      const exists = prev.some((o) => o.org_id === newOrg.org_id || o.slug === newOrg.slug);
      const nextList = exists ? prev.map((o) => (o.org_id === newOrg.org_id ? newOrg : o)) : [...prev, newOrg];
      organizationsRef.current = nextList;
      setOrganizations(nextList);
    } else if (nextUser?.org_id && nextUser?.org_slug) {
      const matched = (organizationsRef.current || []).find(
        (o) => o.org_id === nextUser.org_id || o.slug === nextUser.org_slug
      );
      applyActiveOrg(
        matched || {
          org_id: nextUser.org_id,
          name: nextUser.org_slug,
          slug: nextUser.org_slug,
        }
      );
    }
  }, [applyActiveOrg]);

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
        const [orgsList, refreshed] = await Promise.all([
          refreshOrganizations(),
          refreshSession(),
        ]);
        const activeToken = refreshed?.access_token || accessTokenRef.current;

        const headers = new Headers();
        if (activeToken) {
          headers.set('Authorization', `Bearer ${activeToken}`);
        }
        if (activeOrgRef.current?.slug) {
          headers.set('X-Org-Slug', activeOrgRef.current.slug);
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
            if (meData.user.org_id && meData.user.org_slug) {
              const matched = Array.isArray(orgsList)
                ? orgsList.find((o) => o.org_id === meData.user.org_id || o.slug === meData.user.org_slug)
                : null;
              applyActiveOrg(
                matched || {
                  org_id: meData.user.org_id,
                  name: meData.user.org_slug,
                  slug: meData.user.org_slug,
                }
              );
            }
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
  }, [refreshOrganizations, refreshSession, clearAuthSession, applyActiveOrg]);

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
      if (!headers.has('X-Org-Slug') && activeOrgRef.current?.slug) {
        headers.set('X-Org-Slug', activeOrgRef.current.slug);
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
          if (!retryHeaders.has('X-Org-Slug') && activeOrgRef.current?.slug) {
            retryHeaders.set('X-Org-Slug', activeOrgRef.current.slug);
          }
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
      const reqHeaders = { 'Content-Type': 'application/json' };
      const slugForHeader = payload?.org_slug || activeOrgRef.current?.slug;
      if (slugForHeader) {
        reqHeaders['X-Org-Slug'] = slugForHeader;
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        credentials: 'include',
        headers: reqHeaders,
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
    async (email, password, orgSlugOverride = null) => {
      const targetSlug = orgSlugOverride || activeOrgRef.current?.slug || DEFAULT_ORG.slug;
      return submitAuthRequest(
        `${API_BASE_URL}/api/auth/login`,
        { email: email.trim(), password, org_slug: targetSlug },
        'Invalid email or password.'
      );
    },
    [submitAuthRequest]
  );

  const signup = useCallback(
    async (fullName, email, password, orgSlugOverride = null) => {
      const targetSlug = orgSlugOverride || activeOrgRef.current?.slug || DEFAULT_ORG.slug;
      return submitAuthRequest(
        `${API_BASE_URL}/api/auth/signup`,
        { full_name: fullName.trim(), email: email.trim(), password, org_slug: targetSlug },
        'Unable to create account. Please verify your details.'
      );
    },
    [submitAuthRequest]
  );

  const registerOrganization = useCallback(
    async ({ orgName, orgSlug, supervisorName, supervisorEmail, password }) => {
      const data = await submitAuthRequest(
        `${API_BASE_URL}/api/orgs/register`,
        {
          org_name: orgName.trim(),
          org_slug: orgSlug.trim().toLowerCase(),
          supervisor_name: supervisorName.trim(),
          supervisor_email: supervisorEmail.trim(),
          password,
        },
        'Unable to register organization. Please verify your details.'
      );
      await refreshOrganizations();
      return data;
    },
    [submitAuthRequest, refreshOrganizations]
  );

  const loginAsDemo = useCallback(
    async (role) => {
      const slug = activeOrgRef.current?.slug || DEFAULT_ORG.slug;
      const orgCreds = ORG_DEMO_ACCOUNTS[slug] || ORG_DEMO_ACCOUNTS.nexus;
      const creds = role === 'supervisor' ? orgCreds.supervisor : orgCreds.user;
      return login(creds.email, creds.password, slug);
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

  const switchOrg = useCallback(
    async (orgOrSlug) => {
      const targetOrg =
        typeof orgOrSlug === 'string'
          ? organizations.find((o) => o.slug === orgOrSlug || o.org_id === orgOrSlug) || DEFAULT_ORG
          : orgOrSlug || DEFAULT_ORG;

      if (targetOrg.org_id === activeOrgRef.current?.org_id) {
        return targetOrg;
      }

      if (accessTokenRef.current || refreshTokenRef.current) {
        await logout();
      } else {
        clearAuthSession();
      }

      return applyActiveOrg(targetOrg);
    },
    [organizations, logout, clearAuthSession, applyActiveOrg]
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      authLoading,
      isAuthenticated: Boolean(user),
      isSupervisor: user?.role === 'supervisor',
      organizations,
      activeOrg,
      switchOrg,
      refreshOrganizations,
      registerOrganization,
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
      organizations,
      activeOrg,
      switchOrg,
      refreshOrganizations,
      registerOrganization,
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
