import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(() =>
    Promise.resolve({
      data: {
        tokens: [
          {
            id: 'test-token',
            token: 'test-token.abc',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        ],
      },
    })
  ),
  post: jest.fn(() => Promise.resolve({ data: {} })),
}));

jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: null },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) }),
}));

jest.mock('pdfjs-dist/build/pdf.worker.entry', () => 'pdf-worker');
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

jest.mock('../auth/usePreviewGuard', () => ({
  usePreviewGuard: () => ({
    previewRoute: true,
    previewLocked: true,
    requestAccess: jest.fn(),
  }),
}));

describe('Accessibility audit', () => {
  it('passes axe checks', async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    const languageSelect = screen.getByLabelText(/Language/i);
    const voiceSelect = screen.getByLabelText(/Voice/i);
    const previewAlert = screen.getByRole('alert');
    const refreshButton = screen.getByRole('button', { name: /refresh access token/i });

    expect(languageSelect).toBeInTheDocument();
    expect(voiceSelect).toBeInTheDocument();
    expect(previewAlert).toHaveAttribute('aria-live', 'assertive');

    await userEvent.tab();
    expect(refreshButton).toHaveFocus();
    await userEvent.tab();
    expect(languageSelect).toHaveFocus();
    await userEvent.tab();
    expect(voiceSelect).toHaveFocus();
  });
});
