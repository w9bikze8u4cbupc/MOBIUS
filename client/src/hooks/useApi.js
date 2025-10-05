import { useCallback, useState } from 'react';

export function useApi(apiFn, { immediate = false, defaultParams = null } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setLoading] = useState(false);

  const execute = useCallback(
    async (...params) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFn(...params);
        setData(result);
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiFn]
  );

  // Optional eager call
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => immediate && execute(defaultParams));

  return { data, error, isLoading, execute };
}

export function useOptimisticApi(apiFn, {
  onSuccess,
  onError,
  optimisticUpdate,
} = {}) {
  const [error, setError] = useState(null);
  const [isLoading, setLoading] = useState(false);

  const execute = useCallback(
    async (payload) => {
      setLoading(true);
      setError(null);
      let snapshot;
      try {
        if (optimisticUpdate) {
          snapshot = optimisticUpdate(payload);
        }
        const result = await apiFn(payload);
        onSuccess?.(result, payload);
        return result;
      } catch (err) {
        if (optimisticUpdate && snapshot) snapshot.rollback?.();
        setError(err);
        onError?.(err, payload);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiFn, onError, onSuccess, optimisticUpdate]
  );

  return { execute, isLoading, error };
}