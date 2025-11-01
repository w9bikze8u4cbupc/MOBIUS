const MAX_BREADCRUMBS = 50;
const breadcrumbs = [];

function normalizeBreadcrumb(entry) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
  return {
    category: entry.category || 'general',
    message: entry.message || '',
    level: entry.level || 'info',
    data: entry.data || {},
    timestamp: timestamp.toISOString(),
  };
}

export function addBreadcrumb(entry) {
  const normalized = normalizeBreadcrumb(entry);
  breadcrumbs.push(normalized);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[telemetry] breadcrumb', normalized);
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof window.CustomEvent === 'function'
  ) {
    window.dispatchEvent(
      new window.CustomEvent('telemetry:breadcrumb', { detail: normalized })
    );
  }

  return normalized;
}

export function getBreadcrumbs() {
  return breadcrumbs.slice();
}

export function clearBreadcrumbs() {
  breadcrumbs.splice(0, breadcrumbs.length);
}
