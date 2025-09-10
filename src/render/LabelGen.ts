// Label generator for unique FFmpeg filter labels

export class LabelGen {
  private counters: Map<string, number> = new Map();
  
  /**
   * Generate a unique label with a prefix
   */
  next(prefix: string = "tmp"): string {
    const count = this.counters.get(prefix) || 0;
    this.counters.set(prefix, count + 1);
    return `${prefix}${count}`;
  }
  
  /**
   * Get the current count for a prefix without incrementing
   */
  peek(prefix: string = "tmp"): number {
    return this.counters.get(prefix) || 0;
  }
  
  /**
   * Reset all counters
   */
  reset(): void {
    this.counters.clear();
  }
  
  /**
   * Reset a specific counter
   */
  resetPrefix(prefix: string): void {
    this.counters.delete(prefix);
  }
}

// Global instance for convenience
export const labelGen = new LabelGen();