import { Prisma } from '@prisma/client';
import { AUTH_MESSAGES, AuthErrorCode } from '@faffago/shared';
import { apiError } from '../common/errors';

export const identifiantDejaUtilise = () =>
  apiError(409, AuthErrorCode.IDENTIFIANT_DEJA_UTILISE, AUTH_MESSAGES.identifiantDejaUtilise);
export const telephoneDejaUtilise = () =>
  apiError(409, AuthErrorCode.TELEPHONE_DEJA_UTILISE, AUTH_MESSAGES.telephoneDejaUtilise);

/**
 * A concurrent creation that slipped past the checks still gets a clear
 * answer: a unique violation on the phone, or on the login identifier.
 */
export async function withUniqueAccountErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = JSON.stringify(error.meta ?? {});
      throw target.includes('phone') ? telephoneDejaUtilise() : identifiantDejaUtilise();
    }
    throw error;
  }
}
