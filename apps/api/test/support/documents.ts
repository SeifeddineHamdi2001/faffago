import sharp from 'sharp';

/**
 * Document files for the tests: real images, one carrying GPS coordinates in
 * its EXIF the way a phone writes them, and a minimal PDF.
 */

/** A 40 × 20 JPEG, with GPS coordinates and, optionally, an EXIF orientation. */
export function jpegWithGps(options: { orientation?: number } = {}): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#ff6b35' } })
    .withMetadata(options.orientation ? { orientation: options.orientation } : {})
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'CIN-Cam' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '36/1 48/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

export function png(): Promise<Buffer> {
  return sharp({ create: { width: 10, height: 10, channels: 4, background: '#0f1b3d' } })
    .png()
    .toBuffer();
}

export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/** A file whose name says JPEG and whose bytes say HTML. */
export const HTML_CALLED_JPEG = Buffer.from('<html><script>alert(1)</script></html>');

/** JPEG magic bytes followed by nothing an image decoder accepts. */
export const BROKEN_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 1),
]);

export function blob(bytes: Buffer, type = 'application/octet-stream'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}
