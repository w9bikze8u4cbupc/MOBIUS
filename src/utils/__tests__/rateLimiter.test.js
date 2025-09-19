import { TokenBucketRateLimiter } from '../rateLimiter.js';

test('token bucket limits bursts and refills over time', async () => {
  const limiter = new TokenBucketRateLimiter(3, 1000); // 3 burst, 1/sec
  // 3 immediate allowed
  const result1 = await limiter.consume();
  expect(result1.success).toBe(true);
  const result2 = await limiter.consume();
  expect(result2.success).toBe(true);
  const result3 = await limiter.consume();
  expect(result3.success).toBe(true);
  // 4th should fail now
  const result4 = await limiter.consume();
  expect(result4.success).toBe(false);
  // wait ~1.1s and try again
  await new Promise(r => setTimeout(r, 1100));
  const result5 = await limiter.consume();
  expect(result5.success).toBe(true);
  
  // Clean up
  limiter.cleanup();
});

test('respects token count when consuming multiple tokens', async () => {
  const bucket = new TokenBucketRateLimiter(5, 1000); // Use longer interval to prevent refill
  
  // Consume 3 tokens
  let result = await bucket.consume(3);
  expect(result.success).toBe(true);
  
  // Try to consume 3 more (only 2 available)
  result = await bucket.consume(3);
  expect(result.success).toBe(false);
  
  // Consume 2 tokens (should work)
  result = await bucket.consume(2);
  expect(result.success).toBe(true);
  
  // Clean up
  bucket.cleanup();
});