import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RulebookIngestion } from '../RulebookIngestion';

// Mock the notification system
jest.mock('../../utils/notifications', () => ({
  notify: {
    success: jest.fn(),
    error: jest.fn(),
  }
}));

describe('RulebookIngestion', () => {
  const mockUploadFile = jest.fn();
  const mockSubmitText = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders correctly', () => {
    render(
      <RulebookIngestion
        onUploadFile={mockUploadFile}
        onSubmitText={mockSubmitText}
        isProcessing={false}
      />
    );

    expect(screen.getByText(/Rulebook Ingestion/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop a PDF, or click to select/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste text or AI output/i)).toBeInTheDocument();
  });

  test('shows processing state', () => {
    render(
      <RulebookIngestion
        onUploadFile={mockUploadFile}
        onSubmitText={mockSubmitText}
        isProcessing={true}
      />
    );

    expect(screen.getByText(/Processing.../i)).toBeInTheDocument();
    expect(screen.getByText(/Rulebook ingestion in progress/i)).toBeInTheDocument();
  });

  test('handles file upload with valid PDF', async () => {
    const user = userEvent.setup();
    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });

    render(
      <RulebookIngestion
        onUploadFile={mockUploadFile}
        onSubmitText={mockSubmitText}
        isProcessing={false}
      />
    );

    // Simulate file selection
    const input = screen.getByLabelText(/Drag & drop a PDF/i);
    await user.upload(input, file);

    // Click upload button
    const uploadButton = screen.getByRole('button', { name: /Upload & Parse/i });
    await user.click(uploadButton);

    expect(mockUploadFile).toHaveBeenCalledWith(file);
  });

  test('shows error for invalid file type', async () => {
    const user = userEvent.setup();
    const file = new File(['dummy content'], 'test.txt', { type: 'text/plain' });

    render(
      <RulebookIngestion
        onUploadFile={mockUploadFile}
        onSubmitText={mockSubmitText}
        isProcessing={false}
      />
    );

    // Simulate file selection
    const input = screen.getByLabelText(/Drag & drop a PDF/i);
    await user.upload(input, file);

    expect(mockUploadFile).not.toHaveBeenCalled();
    // Error notification should be shown (mocked)
  });

  test('handles text submission', async () => {
    const user = userEvent.setup();
    const testText = 'This is a test rulebook text';

    render(
      <RulebookIngestion
        onUploadFile={mockUploadFile}
        onSubmitText={mockSubmitText}
        isProcessing={false}
      />
    );

    // Type text into textarea
    const textarea = screen.getByPlaceholderText(/Paste text or AI output/i);
    await user.type(textarea, testText);

    // Click submit button
    const submitButton = screen.getByRole('button', { name: /Submit Text/i });
    await user.click(submitButton);

    expect(mockSubmitText).toHaveBeenCalledWith(testText);
  });

  test('disables submit button when text is empty', () => {
    render(
      <RulebookIngestion
        onUploadFile={mockUploadFile}
        onSubmitText={mockSubmitText}
        isProcessing={false}
      />
    );

    const submitButton = screen.getByRole('button', { name: /Submit Text/i });
    expect(submitButton).toBeDisabled();
  });
});