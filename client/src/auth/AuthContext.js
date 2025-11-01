import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { addBreadcrumb } from '../telemetry/breadcrumbs';

const STORAGE_KEY = 'mobius.preview.tokens';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

const AuthContext = createContext({
  activeToken: null,
  tokens: [],
  status: 'idle',
  error: null,
  refreshTokens: () => Promise.resolve([]),
});

function readStoredTokens() {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    addBreadcrumb({
      category: 'auth',
      level: 'warn',
      message: 'Failed to parse stored preview tokens',
      data: { error: error?.message },
    });
    return [];
  }
}

function persistTokens(tokens) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    addBreadcrumb({
      category: 'auth',
      level: 'warn',
      message: 'Failed to persist preview tokens',
      data: { error: error?.message },
    });
  }
}

function isExpired(token) {
  if (!token?.expiresAt) {
    return false;
  }
  const expiry = new Date(token.expiresAt).getTime();
  if (Number.isNaN(expiry)) {
    return false;
  }
  return Date.now() >= expiry;
}

function mergeTokens(previous, next) {
  const byId = new Map();
  [...previous, ...next].forEach((token) => {
    if (token && token.id) {
      const existing = byId.get(token.id);
      if (!existing || new Date(existing.issuedAt || 0) < new Date(token.issuedAt || 0)) {
        byId.set(token.id, token);
      }
    }
  });
  return Array.from(byId.values()).filter((token) => !isExpired(token));
}

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => readStoredTokens());
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const refreshMsRef = useRef(
    Number.parseInt(process.env.REACT_APP_PREVIEW_TOKEN_REFRESH_MS || '', 10) || DEFAULT_REFRESH_MS
  );
  const tokensRef = useRef(tokens);

  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const activeToken = useMemo(() => {
    const valid = tokens.filter((token) => !isExpired(token));
    if (valid.length === 0) {
      return null;
    }
    return valid.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0))[0];
  }, [tokens]);

  const fetchTokens = useCallback(
    async (reason = 'manual') => {
      setStatus('loading');
      setError(null);
      addBreadcrumb({ category: 'auth', message: 'Refreshing preview tokens', data: { reason } });
      try {
        const response = await axios.get('/api/auth/preview-tokens', {
          headers: {
            'x-preview-token': activeToken?.token || '',
          },
        });
        const payload = Array.isArray(response.data?.tokens)
          ? response.data.tokens
          : [];
        const merged = mergeTokens(tokensRef.current, payload);
        setTokens(merged);
        persistTokens(merged);
        addBreadcrumb({
          category: 'auth',
          message: 'Preview tokens refreshed',
          data: { count: merged.length },
        });
        setStatus('ready');
        return merged;
      } catch (err) {
        const message = err?.response?.data?.error || err?.message || 'Failed to refresh tokens';
        setStatus('error');
        setError(message);
        addBreadcrumb({
          category: 'auth',
          level: 'error',
          message,
        });
        throw err;
      }
    },
    [activeToken?.token]
  );

  useEffect(() => {
    let isMounted = true;
    fetchTokens('initial').catch(() => {
      if (!isMounted) return;
      setStatus((current) => (current === 'loading' ? 'stale' : current));
    });

    return () => {
      isMounted = false;
    };
    // Intentionally run only once at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTokens('interval').catch(() => {
        // Swallow errors; already logged via breadcrumb
      });
    }, refreshMsRef.current);
    return () => clearInterval(interval);
  }, [fetchTokens]);

  const value = useMemo(
    () => ({ activeToken, tokens, status, error, refreshTokens: fetchTokens }),
    [activeToken, tokens, status, error, fetchTokens]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
