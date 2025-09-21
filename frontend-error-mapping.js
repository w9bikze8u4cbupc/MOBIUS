// Frontend error code mapping for PDF component extraction
const pdfErrorMapping = {
  // Upload validation errors
  pdf_oversize: {
    toast: 'PDF too large (max 50 MB).',
    action: 'Please upload a smaller PDF file.',
  },
  pdf_bad_mime: {
    toast: 'File must be a PDF.',
    action: "Please ensure you're uploading a valid PDF document.",
  },
  pdf_bad_signature: {
    toast: "File content isn't a valid PDF.",
    action: 'Please check the file and try again.',
  },
  pdf_parse_failed: {
    toast: "Couldn't read this PDF. Try a different rulebook file.",
    action: 'The PDF file could not be parsed. Try uploading a different PDF.',
  },

  // Text extraction errors
  pdf_no_text_content: {
    toast: 'This PDF appears to be scanned. Enable OCR or upload a text-based PDF.',
    action:
      'This PDF appears to be a scanned image without selectable text. Enable OCR or upload a text-based PDF.',
  },

  // Component parsing errors
  components_not_found: {
    toast: "No recognizable components found. Try adding a clearer 'Components' section.",
    action:
      'No game components were found in the PDF. Make sure the PDF contains a clear "Components" or "Contents" section.',
  },

  // General errors
  pdf_timeout: {
    toast: 'PDF processing timed out; try a smaller file.',
    action: 'PDF processing took too long. Try uploading a smaller PDF file.',
  },
};

// Function to get error message for a given code
export function getPDFErrorMessage(code) {
  return (
    pdfErrorMapping[code] || {
      toast: 'An unexpected error occurred.',
      action: 'Please try again or contact support.',
    }
  );
}

// Function to map error codes to user-friendly messages
export function mapPDFErrorToUserMessage(errorResponse) {
  if (!errorResponse || !errorResponse.code) {
    return {
      toast: 'An unexpected error occurred.',
      action: 'Please try again or contact support.',
    };
  }

  const errorInfo = pdfErrorMapping[errorResponse.code];
  if (!errorInfo) {
    return {
      toast: errorResponse.message || 'An unexpected error occurred.',
      action: errorResponse.suggestion || 'Please try again or contact support.',
    };
  }

  return {
    toast: errorInfo.toast,
    action: errorInfo.action,
  };
}
