// Maps backend structured codes to friendly messages + severity
export function mapErrorToToast(err) {
  // err can be: { code, message, requestId, ... } or an Error with response JSON
  const code =
    err?.code || err?.response?.data?.code || err?.response?.data?.error?.code;
  const requestId =
    err?.requestId ||
    err?.response?.headers?.['x-request-id'] ||
    err?.response?.data?.requestId;
  const base = msg => (requestId ? `${msg} (req ${requestId})` : msg);

  switch (code) {
    case 'url_disallowed':
      return {
        severity: 'warning',
        message: base('That URL is not allowed. Please use an approved host.'),
      };
    case 'fetch_timeout':
      return {
        severity: 'warning',
        message: base(
          'The fetch timed out. Try again or simplify the request.'
        ),
      };
    case 'pdf_oversize':
      return {
        severity: 'warning',
        message: base('PDF is too large. Please upload a smaller file.'),
      };
    case 'pdf_bad_mime':
      return {
        severity: 'error',
        message: base('Invalid file type. Please upload a PDF.'),
      };
    case 'pdf_bad_signature':
      return {
        severity: 'error',
        message: base('File is not a valid PDF (bad signature).'),
      };
    case 'pdf_no_text_content':
      return {
        severity: 'info',
        message: base(
          'No extractable text. Enable OCR or upload a text-based PDF.'
        ),
      };
    case 'pdf_parse_failed':
      return {
        severity: 'error',
        message: base(
          'Failed to parse the PDF. Please try another file or adjust the template.'
        ),
      };
    case 'components_not_found':
      return {
        severity: 'info',
        message: base(
          'No components detected. Consider using lenient mode or adjusting inputs.'
        ),
      };
    case 'network_error':
      return {
        severity: 'error',
        message: base(
          'Network error. Please check your connection and try again.'
        ),
      };
    case 'server_error':
      return {
        severity: 'error',
        message: base('Server error. Please try again later.'),
      };
    default: {
      // Fallback to any message coming from server
      const msg =
        err?.message ||
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        'An unexpected error occurred.';
      return { severity: 'error', message: base(msg) };
    }
  }
}

// client/src/utils/errorMap.js

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

export function getErrorMessageFor(err, context) {
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
