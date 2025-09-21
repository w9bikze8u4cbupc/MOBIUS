import LoggingService from './logging/LoggingService.js';

// Add function to reply with rate limited headers
export function replyRateLimited(res, retryAfterSec, state) {
  res.set('Retry-After', String(retryAfterSec));
  if (state) {
    res.set('X-RateLimit-Limit', String(state.limit));
    res.set('X-RateLimit-Remaining', String(state.remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(state.resetEpochSec)));
  }
  return res.status(429).json({ error: 'Rate limited, please retry later' });
}

class TokenBucketRateLimiter {
  constructor(maxTokens, refillIntervalMs) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();

    // Refill tokens periodically
    this.intervalId = setInterval(() => {
      this.refill();
    }, refillIntervalMs);
  }

  // Cleanup method for testing
  cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs) * this.maxTokens;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
      LoggingService.debug(
        'RateLimiter',
        `Refilled tokens. Current: ${this.tokens}/${this.maxTokens}`,
      );
    }
  }

  async consume(tokens = 1) {
    this.refill(); // Ensure tokens are up to date

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        success: true,
        limit: this.maxTokens,
        remaining: this.tokens,
        resetEpochSec: (this.lastRefill + this.refillIntervalMs) / 1000,
      };
    }

    // Calculate wait time
    const waitTime = this.refillIntervalMs * (tokens / this.maxTokens);
    LoggingService.warn(
      'RateLimiter',
      `Rate limit exceeded. Waiting ${waitTime}ms before next request`,
    );

    // Wait for tokens to refill
    return new Promise((resolve) => {
      setTimeout(() => {
        this.refill();
        if (this.tokens >= tokens) {
          this.tokens -= tokens;
          resolve({
            success: true,
            limit: this.maxTokens,
            remaining: this.tokens,
            resetEpochSec: (this.lastRefill + this.refillIntervalMs) / 1000,
          });
        } else {
          resolve({
            success: false,
            limit: this.maxTokens,
            remaining: this.tokens,
            resetEpochSec: (this.lastRefill + this.refillIntervalMs) / 1000,
          });
        }
      }, waitTime);
    });
  }

  getTokens() {
    this.refill();
    return this.tokens;
  }
}

// Create a global rate limiter for BGG requests
// Default: 10 requests per minute
const BGG_RATE_LIMIT_REQUESTS = parseInt(process.env.BGG_RATE_LIMIT_REQUESTS) || 10;
const BGG_RATE_LIMIT_WINDOW_MS = parseInt(process.env.BGG_RATE_LIMIT_WINDOW_MS) || 60000;

const bggRateLimiter = new TokenBucketRateLimiter(
  BGG_RATE_LIMIT_REQUESTS,
  BGG_RATE_LIMIT_WINDOW_MS,
);

export { bggRateLimiter, TokenBucketRateLimiter };
