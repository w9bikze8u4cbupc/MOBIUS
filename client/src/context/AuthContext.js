import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const DEFAULT_CONTEXT = {
  previewToken: null,
  setPreviewToken: () => {},
  clearPreviewToken: () => {},
  refreshPreviewToken: async () => null,
  status: 'idle',
  error: null,
};

const AuthContext = createContext(DEFAULT_CONTEXT);

const PREVIEW_TOKEN_ENDPOINT = '/api/preview/token';

async function requestPreviewToken() {
  const response = await fetch(PREVIEW_TOKEN_ENDPOINT, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to refresh preview token (status ${response.status})`);
  }
  const payload = await response.json();
  if (!payload || typeof payload.token !== 'string') {
    throw new Error('Preview token response did not include a token');
  }
  return payload;
}

export function AuthProvider({ children }) {
  const [previewToken, setPreviewToken] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const clearPreviewToken = useCallback(() => {
    setPreviewToken(null);
  }, []);

  const refreshPreviewToken = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const { token } = await requestPreviewToken();
      setPreviewToken(token);
      setStatus('success');
      return token;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown preview token error';
      setStatus('error');
      setError(message);
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({
      previewToken,
      setPreviewToken,
      clearPreviewToken,
      refreshPreviewToken,
      status,
      error,
    }),
    [previewToken, clearPreviewToken, refreshPreviewToken, status, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePreviewAuth() {
  return useContext(AuthContext);
}
