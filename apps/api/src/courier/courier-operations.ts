import { Prisma } from '@prisma/client';
import {
  COURIER_OPERATION_ERROR_MESSAGES_FR,
  CourierOperationError,
  type CourierOperationKind,
  type CourierOperationResult,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import type { PrismaService } from '../common/prisma/prisma.service';

export interface OperationAnswer {
  ok: boolean;
  code: string | null;
  message: string;
}

function resultOf(
  kind: CourierOperationKind,
  id: string,
  answer: OperationAnswer,
  replayed: boolean,
): CourierOperationResult {
  return { kind, id, ok: answer.ok, replayed, code: answer.code, message: answer.message, parcel: null };
}

/**
 * Applies an operation that is not a scan once, under the id the phone drew:
 * the answer is stored with it, and the same id again returns that answer
 * without applying anything (Coursier 4.9, like a scan's UUID).
 */
export async function applyOnce(
  prisma: PrismaService,
  actor: UserPrincipal,
  operation: { kind: CourierOperationKind; operationId: string; deviceTime: string },
  now: Date,
  apply: (tx: Prisma.TransactionClient) => Promise<OperationAnswer>,
): Promise<CourierOperationResult> {
  const replay = async (): Promise<CourierOperationResult> => {
    const prior = await prisma.courierOperation.findUniqueOrThrow({
      where: { id: operation.operationId },
    });
    if (prior.actorUserId !== actor.userId || prior.kind !== operation.kind) {
      return resultOf(
        operation.kind,
        operation.operationId,
        {
          ok: false,
          code: CourierOperationError.OPERATION_ID_REUTILISE,
          message: COURIER_OPERATION_ERROR_MESSAGES_FR.OPERATION_ID_REUTILISE,
        },
        false,
      );
    }
    return resultOf(operation.kind, operation.operationId, prior, true);
  };

  if (await prisma.courierOperation.findUnique({ where: { id: operation.operationId } })) {
    return replay();
  }
  try {
    const answer = await prisma.$transaction(async (tx) => {
      const result = await apply(tx);
      await tx.courierOperation.create({
        data: {
          id: operation.operationId,
          actorUserId: actor.userId,
          kind: operation.kind,
          deviceTime: new Date(operation.deviceTime),
          receivedAt: now,
          ok: result.ok,
          code: result.code,
          message: result.message,
        },
      });
      return result;
    });
    return resultOf(operation.kind, operation.operationId, answer, false);
  } catch (error) {
    // Sent twice at the same instant: the second one answers the first's result.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return replay();
    }
    throw error;
  }
}
