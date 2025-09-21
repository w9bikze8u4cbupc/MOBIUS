// Error code to user-friendly message mapping
export const errorCodeToMessage = {
  url_disallowed:
    'The provided URL is not allowed. Please use a valid BoardGameGeek URL.',
  fetch_timeout: 'The request timed out. Please try again later.',
  pdf_oversize:
    'The PDF file is too large. Please upload a file smaller than 50MB.',
  pdf_bad_mime:
    'The uploaded file is not a valid PDF. Please check the file format.',
  pdf_bad_signature:
    'The PDF file appears to be corrupted. Please try a different file.',
  pdf_no_text_content:
    'The PDF appears to be scanned images without selectable text. Enable OCR or upload a text-based PDF.',
  pdf_parse_failed:
    'Failed to parse the PDF file. Please try a different file or check its integrity.',
  components_not_found:
    'No components were found in the PDF. Make sure it contains a clear "Components" or "Contents" section.',
  default: 'An unexpected error occurred. Please try again.',
};

// Debug information mapping
export const getDebugInfo = response => {
  const debugInfo = {};

  // Extract debug information from response headers and data
  if (response?.headers) {
    if (response.headers['x-request-id']) {
      debugInfo.requestId = response.headers['x-request-id'];
    }
  }

  // Extract debug information from response data
  if (response?.data) {
    if (response.data.textLength !== undefined) {
      debugInfo.textLength = response.data.textLength;
    }
    if (response.data.ocrUsed !== undefined) {
      debugInfo.ocrUsed = response.data.ocrUsed;
    }
    if (response.data.parserMode !== undefined) {
      debugInfo.parserMode = response.data.parserMode;
    }
    if (response.data.requestId) {
      debugInfo.requestId = response.data.requestId;
    }
  }

  return debugInfo;
};

// Format debug information for display
export const formatDebugInfo = debugInfo => {
  if (!debugInfo || Object.keys(debugInfo).length === 0) return '';

  const infoParts = [];

  if (debugInfo.requestId) {
    infoParts.push(`Request ID: ${debugInfo.requestId}`);
  }

  if (debugInfo.textLength !== undefined) {
    infoParts.push(`Text Length: ${debugInfo.textLength}`);
  }

  if (debugInfo.ocrUsed !== undefined) {
    infoParts.push(`OCR Used: ${debugInfo.ocrUsed ? 'Yes' : 'No'}`);
  }

  if (debugInfo.parserMode) {
    infoParts.push(`Parser Mode: ${debugInfo.parserMode}`);
  }

  return infoParts.length > 0 ? `Debug: ${infoParts.join(', ')}` : '';
};

export default {
  errorCodeToMessage,
  getDebugInfo,
  formatDebugInfo,
};
