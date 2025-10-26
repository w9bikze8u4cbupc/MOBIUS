// src/worker/health.js
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Check the health of the Preview Worker system
 * @returns {Promise<Object>} Health status
 */
export async function checkWorkerHealth() {
  try {
    // Check Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const connection = new IORedis(redisUrl);
    
    // Test Redis connectivity
    await connection.ping();
    
    // Check queue status
    const QUEUE_NAME = process.env.PREVIEW_QUEUE_NAME || 'preview-jobs';
    const queue = new Queue(QUEUE_NAME, { connection });
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);
    
    await connection.quit();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      redis: {
        status: 'connected',
        url: redisUrl
      },
      queue: {
        name: QUEUE_NAME,
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}