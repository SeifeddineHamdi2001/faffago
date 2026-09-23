import { HttpException } from '@nestjs/common';

/**
 * Every refusal carries a stable `code` the apps can branch on and a French
 * `message` the user can read. Extra fields (retryAfterSeconds,
 * minimumVersion…) sit beside them.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException({ statusCode: status, code, message, ...extra }, status);
}
