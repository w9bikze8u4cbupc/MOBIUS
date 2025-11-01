import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { addBreadcrumb } from '../telemetry/breadcrumbs';

const PREVIEW_ROUTE_PATTERN = /preview/i;

function isPreviewRoute(pathname) {
  if (!pathname) return false;
  return PREVIEW_ROUTE_PATTERN.test(pathname);
}

export function usePreviewGuard() {
  const { activeToken, status, refreshTokens } = useAuth();
  const [previewLocked, setPreviewLocked] = useState(false);

  const currentPath = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.location.pathname || '';
  }, []);

  const previewRoute = useMemo(() => isPreviewRoute(currentPath), [currentPath]);

  useEffect(() => {
    if (!previewRoute) {
      setPreviewLocked(false);
      return;
    }

    if (!activeToken) {
      setPreviewLocked(true);
      addBreadcrumb({
        category: 'auth',
        level: 'warn',
        message: 'Preview route blocked - missing token',
        data: { status },
      });
      return;
    }

    setPreviewLocked(false);
    addBreadcrumb({
      category: 'auth',
      message: 'Preview route access confirmed',
      data: { tokenId: activeToken.id },
    });
  }, [activeToken, previewRoute, status]);

  const requestAccess = async () => {
    try {
      await refreshTokens('guard-request');
    } catch (error) {
      setPreviewLocked(true);
    }
  };

  return {
    previewRoute,
    previewLocked,
    requestAccess,
  };
}
