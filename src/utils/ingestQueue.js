// src/utils/ingestQueue.js
export function createIngestQueue({
  maxConcurrency = Number(process.env.INGEST_MAX_CONCURRENCY || 3),
  maxQueue = Number(process.env.INGEST_QUEUE_MAX || 20),
} = {}) {
  let running = 0;
  const q = [];
  function runNext() {
    if (running >= maxConcurrency) return;
    const task = q.shift();
    if (!task) return;
    running++;
    task()
      .catch(() => {})
      .finally(() => {
        running--;
        runNext();
      });
  }
  return {
    size: () => q.length,
    capacity: () => maxQueue,
    isSaturated: () => q.length >= maxQueue,
    submit: (fn) =>
      new Promise((resolve, reject) => {
        // Check if the queue is full (including running tasks)
        if (q.length + running >= maxQueue) {
          reject(new Error('queue_saturated'));
          return;
        }
        q.push(async () => {
          try {
            const res = await fn();
            resolve(res);
          } catch (e) {
            reject(e);
          }
        });
        runNext();
      }),
  };
}