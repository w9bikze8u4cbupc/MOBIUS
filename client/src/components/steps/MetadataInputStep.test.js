import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetadataInputStep } from './MetadataInputStep';

const metadata = {
  publisher: '',
  playerCount: '',
  gameLength: '',
  minimumAge: '',
  theme: '',
  edition: '',
};

test('runs BGG lookup only when the operator requests it and shows the credential warning', () => {
  const onLookupBgg = jest.fn();
  render(
    <MetadataInputStep
      bggUrl=""
      setBggUrl={jest.fn()}
      metadata={metadata}
      handleMetadataChange={jest.fn()}
      gameName="Abyss"
      file={new File(['pdf'], 'Abyss.pdf', { type: 'application/pdf' })}
      onLookupBgg={onLookupBgg}
      bggLookupLoading={false}
      bggLookupWarning="BGG lookup is unavailable until BGG_API_TOKEN is configured."
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /Look up optional BGG metadata/i }));

  expect(onLookupBgg).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert')).toHaveTextContent('BGG lookup is unavailable until BGG_API_TOKEN is configured.');
});
