import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';

/**
 * What main.ts applies to the app, shared with the tests so they exercise
 * exactly the same pipeline.
 */
export function configureApp(app: INestApplication): void {
  // Money crosses the wire as a string, everywhere, without exception.
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  app.setGlobalPrefix('api');

  // An Import CSV carries up to 500 rows (D-37): more than the default 100 kB.
  (app as NestExpressApplication).useBodyParser('json', { limit: '5mb' });

  // The API sits behind the reverse proxy (tech-stack 6). Trusting only the
  // proxy's hops makes req.ip the real client address, which the login
  // throttling keys on, without letting a client forge X-Forwarded-For.
  (app as NestExpressApplication).set('trust proxy', trustProxyFrom(process.env.TRUST_PROXY));
}

/**
 * Which hops may set X-Forwarded-For, in Express's "trust proxy" words.
 * Loopback unless TRUST_PROXY says otherwise; in Docker the proxy and the web
 * app reach the API from private container addresses: "loopback, uniquelocal"
 * (D-100).
 */
export function trustProxyFrom(value: string | undefined): string {
  const setting = value?.trim();
  return setting ? setting : 'loopback';
}
