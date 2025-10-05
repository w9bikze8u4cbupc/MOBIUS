import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectForm } from '../ProjectForm';

// Mock the notification system
jest.mock('../../utils/notifications', () => ({
  notify: {
    success: jest.fn(),
    error: jest.fn(),
  }
}));

test('requires game name', async () => {
  const user = userEvent.setup();
  const submit = jest.fn();

  render(<ProjectForm onSubmit={submit} isSubmitting={false} />);

  await user.click(screen.getByRole('button', { name: /create project/i }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText(/please correct/i)).toBeInTheDocument();
});

test('submits form with valid data', async () => {
  const user = userEvent.setup();
  const submit = jest.fn();

  render(<ProjectForm onSubmit={submit} isSubmitting={false} />);

  // Fill in the form
  await user.type(screen.getByLabelText(/game name/i), 'Test Game');
  await user.selectOptions(screen.getByLabelText(/language/i), 'English');
  await user.selectOptions(screen.getByLabelText(/voice/i), 'english_haseeb');
  await user.selectOptions(screen.getByLabelText(/detail % increase/i), '25');

  // Submit the form
  await user.click(screen.getByRole('button', { name: /create project/i }));
  
  expect(submit).toHaveBeenCalledWith({
    gameName: 'Test Game',
    language: 'English',
    voice: 'english_haseeb',
    detailPercent: 25,
    metadata: {
      publisher: '',
      playerCount: '',
      gameLength: '',
      minimumAge: '',
      theme: '',
      edition: '',
    }
  });
});