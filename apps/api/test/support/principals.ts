import { randomUUID } from 'node:crypto';
import type { UserPrincipal } from '../../src/auth/principal';
import type { Fixture } from './test-app';

/**
 * The principal the AuthenticationGuard would build for a fixture, for tests
 * that call a service directly because its endpoint comes in a later phase.
 */
export function principalOf(user: Fixture): UserPrincipal {
  return {
    kind: 'user',
    userId: user.id,
    role: user.role,
    sessionId: randomUUID(),
    sellerId: user.sellerId ?? null,
    courierId: user.courierId ?? null,
  };
}
