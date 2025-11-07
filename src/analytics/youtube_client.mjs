const DEFAULT_QUOTA_BUDGET = 10_000;

export class QuotaExceededError extends Error {
  constructor(message, { budget, remaining } = {}) {
    super(message);
    this.name = 'QuotaExceededError';
    this.budget = budget;
    this.remaining = remaining;
  }
}

class QuotaTracker {
  constructor(budget = DEFAULT_QUOTA_BUDGET) {
    const safeBudget = Number.isFinite(budget) && budget >= 0 ? budget : DEFAULT_QUOTA_BUDGET;
    this.initialBudget = safeBudget;
    this.remaining = safeBudget;
    this.consumed = 0;
    this.lastUpdated = new Date();
  }

  canConsume(cost = 1) {
    const safeCost = Number.isFinite(cost) ? Math.max(cost, 0) : 0;
    return safeCost <= this.remaining;
  }

  consume(cost = 1) {
    const safeCost = Number.isFinite(cost) ? Math.max(cost, 0) : 0;
    if (!this.canConsume(safeCost)) {
      throw new QuotaExceededError('Quota budget exceeded', {
        budget: this.initialBudget,
        remaining: this.remaining
      });
    }

    this.remaining -= safeCost;
    this.consumed += safeCost;
    this.lastUpdated = new Date();
    return this.remaining;
  }

  reset(nextBudget = this.initialBudget) {
    const safeBudget = Number.isFinite(nextBudget) && nextBudget >= 0 ? nextBudget : this.initialBudget;
    this.initialBudget = safeBudget;
    this.remaining = safeBudget;
    this.consumed = 0;
    this.lastUpdated = new Date();
    return this.snapshot();
  }

  snapshot() {
    return {
      budget: this.initialBudget,
      consumed: this.consumed,
      remaining: this.remaining,
      lastUpdated: this.lastUpdated.toISOString()
    };
  }

  markCheckpoint() {
    this.lastUpdated = new Date();
    return this.lastUpdated;
  }
}

export function createQuotaTracker(budget) {
  return new QuotaTracker(budget);
}

export async function createClient({ quotaBudget = DEFAULT_QUOTA_BUDGET, options: _options = {} } = {}) {
  const tracker = createQuotaTracker(quotaBudget);
  const _quotaInfo = tracker.snapshot();

  if (process.env.DEBUG === '1' && _quotaInfo) {
    console.error('[analytics/youtube_client] quota snapshot:', _quotaInfo);
  }

  return {
    quota: tracker,
    remainingQuota() {
      return tracker.remaining;
    },
    getQuotaSnapshot() {
      return tracker.snapshot();
    },
    async guard(cost, task) {
      if (typeof task !== 'function') {
        throw new TypeError('Expected task to be a function returning a promise');
      }

      tracker.consume(cost);
      try {
        return await task();
      } catch (error) {
        tracker.markCheckpoint();
        throw error;
      }
    }
  };
}
