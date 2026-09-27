import sharp from 'sharp';
import { sanitizeDocument } from '../../src/storage/document-sanitizer';
import { BROKEN_JPEG, HTML_CALLED_JPEG, PDF, jpegWithGps, png } from '../support/documents';

/** What an uploaded document becomes before it is encrypted (D-32). */

describe('sanitizeDocument', () => {
  it('re-encodes a phone photo: its EXIF, GPS included, is gone', async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const clean = await sanitizeDocument(input);
    expect(clean.mimeType).toBe('image/jpeg');
    const metadata = await sharp(clean.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(clean.bytes.includes(Buffer.from('CIN-Cam'))).toBe(false);
  });

  it('applies the EXIF orientation first, so a sideways CIN reads upright', async () => {
    const clean = await sanitizeDocument(await jpegWithGps({ orientation: 6 }));
    const metadata = await sharp(clean.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([20, 40]);
    expect(metadata.orientation).toBeUndefined();
  });

  it('keeps a PNG a PNG', async () => {
    expect((await sanitizeDocument(await png())).mimeType).toBe('image/png');
  });

  it('keeps a PDF exactly as sent', async () => {
    const clean = await sanitizeDocument(PDF);
    expect(clean).toEqual({ bytes: PDF, mimeType: 'application/pdf' });
  });

  it('refuses a file whose bytes are not JPEG, PNG or PDF', async () => {
    await expect(sanitizeDocument(HTML_CALLED_JPEG)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_FORMAT_REFUSE' },
    });
  });

  it('refuses an image no decoder can read', async () => {
    await expect(sanitizeDocument(BROKEN_JPEG)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_ILLISIBLE' },
    });
  });

  it('refuses more than 10 MB', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    await expect(sanitizeDocument(big)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_TROP_VOLUMINEUX' },
    });
  });
});
