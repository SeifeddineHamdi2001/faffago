/**
 * The time, as a provider. Session expiry, the staff idle logout and the login
 * backoff all read it, so tests move it by hand instead of waiting.
 */
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
