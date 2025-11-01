import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('Dual language rendering', () => {
  it('switches from English to French voices', async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    const languageSelect = screen.getByLabelText(/Language/i);
    fireEvent.change(languageSelect, { target: { value: 'french' } });

    expect(screen.getByRole('option', { name: 'French - Patrick' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /English - Haseeb/i })).not.toBeInTheDocument();
  });
});
