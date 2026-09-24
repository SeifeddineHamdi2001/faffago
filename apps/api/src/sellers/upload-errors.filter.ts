import {
  Catch,
  HttpException,
  PayloadTooLargeException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { SELLER_MESSAGES, SellerErrorCode } from '@faffago/shared';

/**
 * Multer answers in English ("File too large", "Unexpected field"). Upload
 * routes turn those into the coded French refusals the back office shows;
 * every other error passes through unchanged.
 */
@Catch(HttpException)
export class UploadErrorsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = exception.getResponse();
    const message =
      typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : body;

    if (exception instanceof PayloadTooLargeException) {
      response.status(413).json({
        statusCode: 413,
        code: SellerErrorCode.DOCUMENT_TROP_VOLUMINEUX,
        message: SELLER_MESSAGES.documentTropVolumineux,
      });
      return;
    }
    if (message === 'Unexpected field' || message === 'Too many files') {
      response.status(400).json({
        statusCode: 400,
        code: SellerErrorCode.DOCUMENT_INATTENDU,
        message: SELLER_MESSAGES.documentInattendu([]),
      });
      return;
    }
    response.status(exception.getStatus()).json(body);
  }
}
