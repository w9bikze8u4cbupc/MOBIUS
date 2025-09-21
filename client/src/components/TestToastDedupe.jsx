import React from 'react';
import { Button, Box, Typography } from '@mui/material';
import { useToast } from '../contexts/ToastContext';
import { mapErrorToToast } from '../utils/errorMap';

// Test component to verify toast deduplication
export function TestToastDedupe() {
  const { addToast } = useToast();

  const triggerDuplicateError = () => {
    // Create the same error multiple times quickly
    const error1 = {
      code: 'pdf_oversize',
      message: 'PDF is too large. Please upload a smaller file.',
    };
    const error2 = {
      code: 'pdf_oversize',
      message: 'PDF is too large. Please upload a smaller file.',
    };
    const error3 = {
      code: 'pdf_oversize',
      message: 'PDF is too large. Please upload a smaller file.',
    };

    // Map errors to toast configs
    const toast1 = mapErrorToToast(error1);
    const toast2 = mapErrorToToast(error2);
    const toast3 = mapErrorToToast(error3);

    // Add all toasts with a small delay between them
    addToast({ ...toast1, message: toast1.message + ' (1st)' });
    setTimeout(
      () => addToast({ ...toast2, message: toast2.message + ' (2nd)' }),
      100
    );
    setTimeout(
      () => addToast({ ...toast3, message: toast3.message + ' (3rd)' }),
      200
    );
  };

  const triggerDifferentErrors = () => {
    // Create different errors
    const error1 = {
      code: 'pdf_oversize',
      message: 'PDF is too large. Please upload a smaller file.',
    };
    const error2 = {
      code: 'pdf_bad_mime',
      message: 'Invalid file type. Please upload a PDF.',
    };
    const error3 = {
      code: 'pdf_parse_failed',
      message: 'Failed to parse the PDF. Please try another file.',
    };

    // Map errors to toast configs
    const toast1 = mapErrorToToast(error1);
    const toast2 = mapErrorToToast(error2);
    const toast3 = mapErrorToToast(error3);

    // Add all toasts
    addToast({ ...toast1, message: toast1.message + ' (oversize)' });
    setTimeout(
      () => addToast({ ...toast2, message: toast2.message + ' (bad mime)' }),
      100
    );
    setTimeout(
      () =>
        addToast({ ...toast3, message: toast3.message + ' (parse failed)' }),
      200
    );
  };

  return (
    <Box sx={{ p: 2, border: '1px solid #ccc', borderRadius: 1, mt: 2 }}>
      <Typography variant="h6">Toast Deduplication Test</Typography>
      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <Button variant="contained" onClick={triggerDuplicateError}>
          Trigger Duplicate Errors
        </Button>
        <Button variant="outlined" onClick={triggerDifferentErrors}>
          Trigger Different Errors
        </Button>
      </Box>
      <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
        Click the first button to test deduplication of identical errors. Click
        the second button to test that different errors are shown separately.
      </Typography>
    </Box>
  );
}
