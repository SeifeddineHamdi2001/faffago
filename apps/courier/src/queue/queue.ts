import {
  COURIER_SYNC_MAX_OPERATIONS,
  CourierOperationKind,
  ScanAction,
  isWithinCancelWindow,
  normalizeParcelCode,
  operationIdOf,
  parcelCodeFromScan,
  type CourierOperationInput,
  type CourierOperationResult,
  type CourierScanAction,
  type CourierScanOperationInput,
} from '@faffago/shared';

/**
 * The phone's queue (Coursier 4.9, tech-stack 4): every scan and action is
 * written here first, then sent in order when there is signal. A row keeps
 * the courier who made it, so a forced logout never loses or reassigns a
 * scan: it is sent after that courier logs back in, with its own device time
 * and UUID (Q12).
 */

export const QueueStatus = {
  /** Not sent yet. */
  EN_ATTENTE: 'EN_ATTENTE',
  ACCEPTE: 'ACCEPTE',
  REFUSE: 'REFUSE',
  /** A scan taken back with Annuler le dernier scan. */
  ANNULE: 'ANNULE',
} as const;
export type QueueStatus = (typeof QueueStatus)[keyof typeof QueueStatus];

export interface QueueRow {
  /** The scan's UUID, or the operation's. */
  id: string;
  /** Insertion order: the order operations are sent in. */
  seq: number;
  userId: string;
  kind: CourierOperationKind;
  action: CourierScanAction | null;
  parcelCode: string | null;
  operation: CourierOperationInput;
  deviceTime: string;
  status: QueueStatus;
  code: string | null;
  message: string | null;
}

export type NewQueueRow = Omit<QueueRow, 'seq' | 'status' | 'code' | 'message'>;

export interface QueueStore {
  insert(row: NewQueueRow): Promise<void>;
  /** This courier's rows still to send, oldest first. */
  pending(userId: string, limit: number): Promise<QueueRow[]>;
  /** This courier's rows made since `sinceIso` (device time), oldest first. */
  since(userId: string, sinceIso: string): Promise<QueueRow[]>;
  get(id: string): Promise<QueueRow | null>;
  setStatus(
    id: string,
    status: QueueStatus,
    code: string | null,
    message: string | null,
  ): Promise<void>;
  remove(id: string): Promise<void>;
  countPending(userId: string): Promise<number>;
  /** Forget answered rows older than this; never a pending one. */
  prune(beforeIso: string): Promise<void>;
}

/** The parcel code of a scanned label or typed code, if it is one. */
export function codeOf(raw: string): string | null {
  return parcelCodeFromScan(raw) ?? null;
}

function rowOf(userId: string, operation: CourierOperationInput): NewQueueRow {
  const isScan = operation.kind === CourierOperationKind.SCAN;
  const code =
    operation.kind === CourierOperationKind.SCAN
      ? codeOf(operation.rawCode)
      : operation.kind === CourierOperationKind.NOTE_ADRESSE ||
          operation.kind === CourierOperationKind.MESSAGE_CHAT
        ? normalizeParcelCode(operation.parcelCode)
        : null;
  return {
    id: operationIdOf(operation),
    userId,
    kind: operation.kind,
    action: isScan ? operation.action : null,
    parcelCode: code,
    operation,
    deviceTime: operation.deviceTime,
  };
}

export function enqueue(
  store: QueueStore,
  userId: string,
  operation: CourierOperationInput,
): Promise<void> {
  return store.insert(rowOf(userId, operation));
}

/**
 * "Déjà scanné — Livré à 14:32" (Coursier 4.9): the same parcel scanned for
 * the same action today, sent or not, and not cancelled.
 */
export function findPreviousScan(
  rows: readonly QueueRow[],
  parcelCode: string,
  action: CourierScanAction,
): QueueRow | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (
      row.kind === CourierOperationKind.SCAN &&
      row.parcelCode === parcelCode &&
      row.action === action &&
      (row.status === QueueStatus.EN_ATTENTE || row.status === QueueStatus.ACCEPTE)
    ) {
      return row;
    }
  }
  return null;
}

/** His last scan still standing: the only one Annuler offers (A-11). */
export function lastScan(rows: readonly QueueRow[]): QueueRow | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.kind !== CourierOperationKind.SCAN) continue;
    if (row.status === QueueStatus.EN_ATTENTE || row.status === QueueStatus.ACCEPTE) return row;
    if (row.status === QueueStatus.ANNULE) return null;
  }
  return null;
}

export type CancelOutcome = 'REMOVED' | 'QUEUED' | 'TOO_LATE';

/**
 * Annuler le dernier scan (A-11), on the phone's clock. A scan never sent is
 * simply taken off the queue; a sent one gets a cancellation queued after it,
 * which the API checks against the same two device times.
 */
export async function cancelScan(
  store: QueueStore,
  row: QueueRow,
  now: Date,
  windowSeconds: number,
): Promise<CancelOutcome> {
  if (!isWithinCancelWindow(new Date(row.deviceTime), now, windowSeconds)) return 'TOO_LATE';
  if (row.status === QueueStatus.EN_ATTENTE) {
    await store.remove(row.id);
    return 'REMOVED';
  }
  await store.insert(
    rowOf(row.userId, {
      kind: CourierOperationKind.ANNULATION,
      clientScanId: row.id,
      deviceTime: now.toISOString(),
    }),
  );
  await store.setStatus(row.id, QueueStatus.ANNULE, null, null);
  return 'QUEUED';
}

/** Livré scans not sent yet: Ma caisse counts them (Coursier 4.9). */
export function pendingDeliveries(rows: readonly QueueRow[]): { collectedMillimes: bigint }[] {
  return rows
    .filter(
      (row) =>
        row.status === QueueStatus.EN_ATTENTE &&
        row.kind === CourierOperationKind.SCAN &&
        row.action === ScanAction.LIVRE,
    )
    .map((row) => ({
      collectedMillimes: BigInt(
        (row.operation as CourierScanOperationInput).collectedMillimes ?? '0',
      ),
    }));
}

export interface SyncOutcome {
  sent: number;
  refused: { row: QueueRow; code: string | null; message: string }[];
}

/**
 * Sends this courier's pending rows in order, up to the upload's limit, and
 * records each answer. A refused scan stays in the list with its reason, so
 * the courier sees why (Coursier 4.9). A refused cancellation puts its scan
 * back as it was.
 */
export async function syncOnce(
  store: QueueStore,
  userId: string,
  upload: (operations: CourierOperationInput[]) => Promise<CourierOperationResult[]>,
): Promise<SyncOutcome> {
  const rows = await store.pending(userId, COURIER_SYNC_MAX_OPERATIONS);
  if (rows.length === 0) return { sent: 0, refused: [] };
  const results = await upload(rows.map((row) => row.operation));
  const outcome: SyncOutcome = { sent: 0, refused: [] };
  for (const [index, row] of rows.entries()) {
    const result = results[index];
    if (!result) break;
    outcome.sent += 1;
    await store.setStatus(
      row.id,
      result.ok ? QueueStatus.ACCEPTE : QueueStatus.REFUSE,
      result.code,
      result.message,
    );
    if (!result.ok) {
      outcome.refused.push({ row, code: result.code, message: result.message });
      if (row.kind === CourierOperationKind.ANNULATION) {
        const target =
          row.operation.kind === CourierOperationKind.ANNULATION
            ? row.operation.clientScanId
            : null;
        if (target) await store.setStatus(target, QueueStatus.ACCEPTE, null, null);
      }
    }
  }
  return outcome;
}

/** An in-memory store: the tests', and a fallback shape reference. */
export function memoryStore(): QueueStore & { rows: QueueRow[] } {
  const rows: QueueRow[] = [];
  let seq = 0;
  return {
    rows,
    async insert(row) {
      rows.push({ ...row, seq: ++seq, status: QueueStatus.EN_ATTENTE, code: null, message: null });
    },
    async pending(userId, limit) {
      return rows
        .filter((r) => r.userId === userId && r.status === QueueStatus.EN_ATTENTE)
        .slice(0, limit);
    },
    async since(userId, sinceIso) {
      return rows.filter((r) => r.userId === userId && r.deviceTime >= sinceIso);
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async setStatus(id, status, code, message) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, { status, code, message });
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
    async countPending(userId) {
      return rows.filter((r) => r.userId === userId && r.status === QueueStatus.EN_ATTENTE).length;
    },
    async prune(beforeIso) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i]!;
        if (row.status !== QueueStatus.EN_ATTENTE && row.deviceTime < beforeIso) rows.splice(i, 1);
      }
    },
  };
}
