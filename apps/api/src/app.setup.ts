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

  // The API sits behind the reverse proxy on the same machine (tech-stack 6).
  // Trusting only loopback makes req.ip the real client address, which the
  // login throttling keys on, without letting a client forge X-Forwarded-For.
  (app as NestExpressApplication).set('trust proxy', 'loopback');
}
