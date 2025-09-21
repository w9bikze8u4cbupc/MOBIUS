import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

// Test component to verify QA gating behavior
export function TestQAGating() {
  // Check the current environment and QA flags
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isQAEnabled =
    process.env.REACT_APP_QA_LABELS === '1' ||
    process.env.REACT_APP_QA_LABELS === 'true';

  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid #ccc',
        borderRadius: 1,
        mt: 2,
        bgcolor: '#f5f5f5',
      }}
    >
      <Typography variant="h6">QA Gating Test</Typography>
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Chip
          label={`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`}
          color={isDevelopment ? 'success' : 'default'}
        />
        <Chip
          label={`REACT_APP_QA_LABELS: ${process.env.REACT_APP_QA_LABELS || 'not set'}`}
          color={isQAEnabled ? 'success' : 'default'}
        />
        <Chip
          label={`QA Enabled: ${isDevelopment || isQAEnabled ? 'Yes' : 'No'}`}
          color={isDevelopment || isQAEnabled ? 'success' : 'default'}
        />
      </Box>
      <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
        This component shows the current environment settings that affect QA
        gating. In development mode or when REACT_APP_QA_LABELS is set to '1' or
        'true', the DebugChips should be visible by default.
      </Typography>
    </Box>
  );
}
