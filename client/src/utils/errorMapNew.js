// client/src/utils/errorMapNew.js

// Map backend codes or patterns to user-friendly messages
const codeToMessage = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  TIMEOUT: 'The request took too long. Please try again.',
  UNAUTHORIZED: 'You are not authorized. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  PAYLOAD_TOO_LARGE: 'The file is too large. Please upload a smaller PDF.',
  UPSTREAM_FAILURE: 'Upstream service failed. Retrying may help.',
  VALIDATION: 'Please check your input and try again.',
  DEFAULT: 'Something went wrong. Please try again.',
};

export function getErrorMessageFor(err, _context) {
  // Backend may return { code, message, details }, or arbitrary shapes
  const code =
    err?.code ||
    err?.backend?.code ||
    (typeof err?.status === 'number' && httpStatusToCode(err.status)) ||
    findHeuristicCode(err);

  const msg = codeToMessage[code] || err?.message || codeToMessage.DEFAULT;

  // Optionally include context for internal diagnostics (not for end-user display)
  return msg;
}

function httpStatusToCode(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status >= 500) return 'UPSTREAM_FAILURE';
  return 'DEFAULT';
}

function findHeuristicCode(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return 'NETWORK_ERROR';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'TIMEOUT';
  if (msg.includes('413') || msg.includes('payload too large'))
    return 'PAYLOAD_TOO_LARGE';
  return 'DEFAULT';
}
