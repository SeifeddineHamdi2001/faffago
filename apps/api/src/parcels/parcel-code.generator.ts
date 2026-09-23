import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { generateParcelCode } from '@faffago/shared';

/**
 * Draws parcel codes from the operating system's CSPRNG (A-19). A class of
 * its own so a test can force a collision.
 */
@Injectable()
export class ParcelCodeGenerator {
  next(): string {
    return generateParcelCode(randomBytes);
  }
}
