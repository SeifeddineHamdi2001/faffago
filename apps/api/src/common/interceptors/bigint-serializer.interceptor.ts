import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Money leaves the API as a decimal string, never as a JSON number.
 *
 * A COD of 85,000 DT is the bigint 85000n. `JSON.stringify` throws on a bigint,
 * and coercing it to a Number would silently lose precision on large totals
 * (a monthly report can exceed 2^53 millimes). Clients read the string back
 * with `millimesFromJson` from @faffago/shared.
 *
 * Dates are left alone: Nest already serialises them to ISO strings.
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => serialize(value)));
  }
}

function serialize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  // A cycle would otherwise recurse forever; leave it to Nest's own serialiser
  // to fail loudly rather than hanging the request.
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => serialize(item, seen));

  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = serialize(item, seen);
  }
  return out;
}
