import { createIngestQueue } from '../../src/utils/ingestQueue.js';

describe('ingestQueue', () => {
  it('should limit concurrency', async () => {
    const queue = createIngestQueue({ maxConcurrency: 1, maxQueue: 3 });
    
    let running = 0;
    let maxRunning = 0;
    
    const createTask = () => {
      return () => new Promise(resolve => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        setTimeout(() => {
          running--;
          resolve();
        }, 100);
      });
    };
    
    // Submit multiple tasks
    const tasks = [
      queue.submit(createTask()),
      queue.submit(createTask()),
      queue.submit(createTask())
    ];
    
    await Promise.all(tasks);
    
    // Should never have more than maxConcurrency running at once
    expect(maxRunning).toBe(1);
  });
  
  it('should reject when queue is full', async () => {
    const queue = createIngestQueue({ maxConcurrency: 1, maxQueue: 1 });
    
    // Submit a task that takes a while
    const slowTask = queue.submit(() => new Promise(resolve => setTimeout(resolve, 1000)));
    
    // Give the queue a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Try to submit another task, should be rejected
    await expect(queue.submit(() => Promise.resolve('test'))).rejects.toThrow('queue_saturated');
    
    // Wait for the slow task to complete
    await slowTask;
  });
  
  it('should track queue size and capacity', () => {
    const queue = createIngestQueue({ maxConcurrency: 1, maxQueue: 3 });
    
    expect(queue.size()).toBe(0);
    expect(queue.capacity()).toBe(3);
    expect(queue.isSaturated()).toBe(false);
  });
  
  it('should reject when queue is saturated', async () => {
    const queue = createIngestQueue({ maxConcurrency: 1, maxQueue: 1 });
    
    // Fill the queue
    queue.submit(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    // Give the queue a moment to process
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Try to submit another task when queue is full
    await expect(queue.submit(() => Promise.resolve('test'))).rejects.toThrow('queue_saturated');
  });
});