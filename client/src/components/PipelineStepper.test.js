import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PipelineStepper } from './PipelineStepper';

test('disables the active Script confirmation control when script provenance is untrusted', () => {
  const onConfirmStep = jest.fn();
  render(
    <PipelineStepper
      steps={[{ id: 'script', label: 'Script' }, { id: 'storyboard', label: 'Storyboard' }]}
      activeStepId="script"
      completedStepIds={[]}
      onStepClick={jest.fn()}
      onConfirmStep={onConfirmStep}
      canConfirmStep={(stepId) => stepId !== 'script'}
    />,
  );

  const confirm = screen.getByRole('button', { name: 'CONFIRM SCRIPT' });
  expect(confirm).toBeDisabled();
  fireEvent.click(confirm);
  expect(onConfirmStep).not.toHaveBeenCalled();
});

test('allows confirmation when the active step is explicitly confirmable', () => {
  const onConfirmStep = jest.fn();
  render(
    <PipelineStepper
      steps={[{ id: 'script', label: 'Script' }]}
      activeStepId="script"
      completedStepIds={[]}
      onStepClick={jest.fn()}
      onConfirmStep={onConfirmStep}
      canConfirmStep={() => true}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'CONFIRM SCRIPT' }));
  expect(onConfirmStep).toHaveBeenCalledWith('script');
});
