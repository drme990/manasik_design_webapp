/**
 * Simple in-memory concurrency limiter (semaphore).
 *
 * Used by the design generation route to cap how many canvas renders
 * run in parallel. Canvas rendering via @napi-rs/canvas is CPU-bound —
 * running too many at once on a single-core VPS can starve the event
 * loop and cause all requests to slow down or timeout.
 *
 * The limiter queues excess requests as Promises that resolve when a
 * slot becomes available. Since the design app runs on a VPS with PM2
 * (not serverless), there's no request timeout — queued requests just
 * wait their turn.
 *
 * The concurrency limit is configurable via the
 * `DESIGN_RENDER_CONCURRENCY` env var (default: 10).
 */

type PendingRequest = {
  resolve: () => void;
  reject: (error: Error) => void;
};

export class ConcurrencyLimiter {
  private active = 0;
  private readonly max: number;
  private readonly queue: PendingRequest[] = [];

  constructor(max: number) {
    if (max < 1) max = 1;
    this.max = max;
  }

  /**
   * Acquire a slot. Returns a Promise that resolves when a slot is
   * available. The caller MUST call `release()` when done.
   */
  acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  /**
   * Release a slot, allowing the next queued request to proceed.
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      // Slot is immediately handed to the next waiter — active count
      // stays the same.
      next.resolve();
    } else {
      this.active--;
    }
  }

  /**
   * Run an async function with concurrency limiting.
   *
   * Acquires a slot before running, releases it after (even on error).
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Current number of active (running) tasks. */
  get activeCount(): number {
    return this.active;
  }

  /** Current number of queued tasks waiting for a slot. */
  get queuedCount(): number {
    return this.queue.length;
  }
}

/**
 * Global render concurrency limiter instance.
 *
 * Shared across all requests to the generate-design route. The
 * concurrency limit is read from `DESIGN_RENDER_CONCURRENCY` env var
 * at module load time (default: 3).
 */
export const renderLimiter = new ConcurrencyLimiter(
  parseInt(process.env.DESIGN_RENDER_CONCURRENCY || '10', 10),
);
