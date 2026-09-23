import { type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { apiError } from './errors';

/**
 * Validates a body with the same zod schema the browser uses (tech-stack 2),
 * and hands the handler the parsed, normalised value.
 */
export class ZodValidationPipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly schema: ZodType<Output, ZodTypeDef, unknown>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw apiError(400, 'VALIDATION', 'Données invalides', {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
