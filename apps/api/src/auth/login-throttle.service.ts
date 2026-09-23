import { Inject, Injectable } from '@nestjs/common';
import { LOGIN_THROTTLE, loginBackoffSeconds } from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';

export interface ThrottleKeys {
  /** e.g. `email:a@b.tn`, `username:saif`, `phone:LIVREUR:20123456`. */
  identifier: string;
  ip: string;
}

interface Entry {
  failures: number;
  lastFailureAt: number;
}

/**
 * Login throttling (D-6, Q10), held in memory: one VPS, one process. A restart
 * clears it, which is harmless because there is no lockout to bypass.
 *
 * A failed attempt pushes back the next one for the identifier and for the
 * IP; a blocked attempt is refused before the password is checked, and does
 * not add to the count. Nothing ever blocks longer than the cap.
 */
@Injectable()
export class LoginThrottleService {
  private readonly entries = new Map<string, Entry>();
  private operations = 0;

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** 0 when the attempt may go ahead. */
  retryAfterSeconds(keys: ThrottleKeys): number {
    return Math.max(
      this.waitFor(`id:${keys.identifier}`, LOGIN_THROTTLE.freeFailuresPerIdentifier),
      this.waitFor(`ip:${keys.ip}`, LOGIN_THROTTLE.freeFailuresPerIp),
    );
  }

  recordFailure(keys: ThrottleKeys): void {
    const now = this.clock.now().getTime();
    for (const key of [`id:${keys.identifier}`, `ip:${keys.ip}`]) {
      const entry = this.entries.get(key);
      this.entries.set(key, { failures: (entry?.failures ?? 0) + 1, lastFailureAt: now });
    }
    if (++this.operations % 1000 === 0) this.sweep();
  }

  /** The identifier is cleared; the IP is not, or one good account would reset it. */
  recordSuccess(keys: ThrottleKeys): void {
    this.entries.delete(`id:${keys.identifier}`);
  }

  /** Forgets keys with no failure for a day, so memory cannot grow without bound. */
  sweep(): void {
    const cutoff = this.clock.now().getTime() - LOGIN_THROTTLE.forgetAfterSeconds * 1000;
    for (const [key, entry] of this.entries) {
      if (entry.lastFailureAt < cutoff) this.entries.delete(key);
    }
  }

  size(): number {
    return this.entries.size;
  }

  /** Tests only. */
  clear(): void {
    this.entries.clear();
  }

  private waitFor(key: string, freeFailures: number): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const backoff = loginBackoffSeconds(entry.failures, freeFailures);
    const until = entry.lastFailureAt + backoff * 1000;
    const remaining = until - this.clock.now().getTime();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
}
