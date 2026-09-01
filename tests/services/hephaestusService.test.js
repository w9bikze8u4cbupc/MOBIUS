import { withHephaestusProjectLock } from '../../src/services/hephaestusService.js';

test('serializes complete per-project HEPHAESTUS operations and releases the lock after failure', async () => {
  const events = [];
  let releaseFirst;
  const first = withHephaestusProjectLock('project-a', async () => {
    events.push('first-start');
    await new Promise((resolve) => { releaseFirst = resolve; });
    events.push('first-end');
    throw new Error('first failure');
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = withHephaestusProjectLock('project-a', async () => {
    events.push('second-start');
    return 'second-result';
  });

  expect(events).toEqual(['first-start']);
  releaseFirst();
  await expect(first).rejects.toThrow('first failure');
  await expect(second).resolves.toBe('second-result');
  expect(events).toEqual(['first-start', 'first-end', 'second-start']);

  await expect(withHephaestusProjectLock('project-a', async () => 'fresh-result')).resolves.toBe('fresh-result');
});
