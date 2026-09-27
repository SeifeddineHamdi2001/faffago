import * as Sentry from '@sentry/nestjs';

/**
 * Error monitoring (tech-stack 6, phase 11). Loaded before anything else in
 * main.ts so Sentry can hook into the modules it traces. Without SENTRY_DSN it
 * does nothing: development and the tests never report.
 *
 * Only errors go out, never a request's data: bodies, cookies and the
 * Authorization header carry customers' names, phones, addresses and tokens.
 */
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
}
