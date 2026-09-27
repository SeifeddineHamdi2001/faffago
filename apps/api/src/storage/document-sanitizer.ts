import sharp from 'sharp';
import {
  DocumentMimeType,
  SELLER_DOCUMENT_POLICY,
  SELLER_MESSAGES,
  SellerErrorCode,
  detectDocumentMimeType,
} from '@faffago/shared';
import { apiError } from '../common/errors';

export interface CleanDocument {
  bytes: Buffer;
  mimeType: DocumentMimeType;
}

/**
 * What an uploaded document becomes before it is encrypted (D-32).
 *
 * The type comes from the bytes. Images are decoded and re-encoded: that
 * drops every piece of metadata a phone writes, GPS coordinates included, and
 * proves the file really is an image. The EXIF orientation is applied first,
 * so a CIN photographed sideways still reads the right way up. PDFs are kept
 * as sent.
 */
export async function sanitizeDocument(input: Buffer): Promise<CleanDocument> {
  if (input.length > SELLER_DOCUMENT_POLICY.maxBytes) {
    throw apiError(
      413,
      SellerErrorCode.DOCUMENT_TROP_VOLUMINEUX,
      SELLER_MESSAGES.documentTropVolumineux,
    );
  }
  const mimeType = detectDocumentMimeType(input);
  if (!mimeType) {
    throw apiError(
      400,
      SellerErrorCode.DOCUMENT_FORMAT_REFUSE,
      SELLER_MESSAGES.documentFormatRefuse,
    );
  }
  if (mimeType === DocumentMimeType.PDF) return { bytes: input, mimeType };

  try {
    const image = sharp(input, { failOn: 'error' }).rotate();
    const bytes =
      mimeType === DocumentMimeType.JPEG
        ? await image.jpeg({ quality: 90 }).toBuffer()
        : await image.png().toBuffer();
    return { bytes, mimeType };
  } catch {
    throw apiError(400, SellerErrorCode.DOCUMENT_ILLISIBLE, SELLER_MESSAGES.documentIllisible);
  }
}
