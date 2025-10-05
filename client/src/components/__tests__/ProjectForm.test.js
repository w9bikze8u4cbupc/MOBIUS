// client/src/components/__tests__/ProjectForm.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectForm from '../ProjectForm';

// Mock the API client
jest.mock('../../api/client', () => ({
  projectApi: {
    createOrUpdate: jest.fn()
  }
}));

// Mock the useApi hook
jest.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    execute: jest.fn().mockResolvedValue({ project: { id: 1, name: 'Test Game' } }),
    loading: false,
    error: null
  })
}));

// Mock notifications
jest.mock('../../utils/notifications', () => ({
  showSuccess: jest.fn(),
  showError: jest.fn()
}));

describe('ProjectForm', () => {
  const mockOnProjectCreated = jest.fn();
  
  beforeEach(() => {
    mockOnProjectCreated.mockClear();
  });
  
  test('renders form elements', () => {
    render(<ProjectForm onProjectCreated={mockOnProjectCreated} />);
    
    expect(screen.getByLabelText(/Game Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Language/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Voice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Detail Boost/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/BGG URL/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
  });
  
  test('updates game name input', () => {
    render(<ProjectForm onProjectCreated={mockOnProjectCreated} />);
    
    const input = screen.getByLabelText(/Game Name/i);
    fireEvent.change(input, { target: { value: 'Test Game' } });
    
    expect(input.value).toBe('Test Game');
  });
  
  test('updates language selection', () => {
    render(<ProjectForm onProjectCreated={mockOnProjectCreated} />);
    
    const select = screen.getByLabelText(/Language/i);
    fireEvent.change(select, { target: { value: 'french' } });
    
    expect(select.value).toBe('french');
  });
  
  test('submits form with valid data', async () => {
    render(<ProjectForm onProjectCreated={mockOnProjectCreated} />);
    
    const nameInput = screen.getByLabelText(/Game Name/i);
    fireEvent.change(nameInput, { target: { value: 'Test Game' } });
    
    const submitButton = screen.getByRole('button', { name: /Create Project/i });
    fireEvent.click(submitButton);
    
    // Wait for async operations
    await screen.findByText(/Create Project/i);
  });
});