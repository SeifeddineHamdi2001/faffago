import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { generatePassword } from '@faffago/shared';
import * as argon2 from 'argon2';

/**
 * argon2id only (A-20). The password is generated here, returned once to the
 * admin who created or regenerated it, and never stored or logged.
 */
@Injectable()
export class PasswordsService implements OnModuleInit {
  /** Verified against when the account does not exist, so both take as long. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(generatePassword(randomBytes));
  }

  generate(): string {
    return generatePassword(randomBytes);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed hash is a refusal, never a crash that reveals the account.
      return false;
    }
  }

  /** Spends the same time as a real check, for an identifier that matched nothing. */
  async verifyNothing(password: string): Promise<false> {
    await this.verify(this.dummyHash, password);
    return false;
  }
}
