import { Inject, Injectable } from '@nestjs/common';
import { PUBLIC_TRACKING_THROTTLE, trackingBackoffSeconds } from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';

interface Entry {
  failures: number;
  lastFailureAt: number;
}

/**
 * Rate limiting on public tracking (Landing 4.4), held in memory like the
 * login throttle (D-6): one VPS, one process, no permanent lockout. Keyed on
 * the visitor's IP; a wrong code slows the next attempt, a found parcel does
 * not.
 */
@Injectable()
export class PublicTrackingThrottleService {
  private readonly entries = new Map<string, Entry>();
  private operations = 0;

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** 0 when the next attempt may go ahead. */
  retryAfterSeconds(ip: string): number {
    const entry = this.entries.get(ip);
    if (!entry) return 0;
    const backoff = trackingBackoffSeconds(entry.failures);
    const until = entry.lastFailureAt + backoff * 1000;
    const remaining = until - this.clock.now().getTime();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  recordFailure(ip: string): void {
    const now = this.clock.now().getTime();
    const entry = this.entries.get(ip);
    this.entries.set(ip, { failures: (entry?.failures ?? 0) + 1, lastFailureAt: now });
    if (++this.operations % 1000 === 0) this.sweep();
  }

  recordSuccess(ip: string): void {
    this.entries.delete(ip);
  }

  /** Forgets an IP with no failure for a while, so memory cannot grow without bound. */
  sweep(): void {
    const cutoff = this.clock.now().getTime() - PUBLIC_TRACKING_THROTTLE.forgetAfterSeconds * 1000;
    for (const [key, entry] of this.entries) {
      if (entry.lastFailureAt < cutoff) this.entries.delete(key);
    }
  }

  /** Tests only. */
  clear(): void {
    this.entries.clear();
  }
}
