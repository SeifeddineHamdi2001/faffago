import type { CourierOperationInput, CourierOperationResult } from '@faffago/shared';
import {
  QueueStatus,
  cancelScan,
  enqueue,
  findPreviousScan,
  lastScan,
  memoryStore,
  pendingDeliveries,
  syncOnce,
} from '../src/queue/queue';

const NOW = new Date('2026-09-25T10:00:00.000Z');
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function livre(code: string, at: Date = NOW): CourierOperationInput {
  return {
    kind: 'SCAN',
    clientScanId: uuid(),
    action: 'LIVRE',
    rawCode: code,
    source: 'APP_COURSIER',
    deviceTime: at.toISOString(),
    collectedMillimes: '85000',
  };
}

function accepted(operations: CourierOperationInput[]): CourierOperationResult[] {
  return operations.map(() => ({
    kind: 'SCAN',
    id: 'x',
    ok: true,
    replayed: false,
    code: null,
    message: 'Livré',
    parcel: null,
  }));
}

describe('the queue on the phone (Coursier 4.9)', () => {
  it('sends in order and records each answer; a refusal keeps its reason', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    await enqueue(store, 'ali', livre('https://www.mirely.store/suivi/FG-BBBBBBBB'));
    const sent: CourierOperationInput[][] = [];
    const outcome = await syncOnce(store, 'ali', async (operations) => {
      sent.push(operations);
      return [
        accepted(operations)[0]!,
        { ...accepted(operations)[0]!, ok: false, code: 'MONTANT_DIFFERENT', message: 'Montant' },
      ];
    });
    expect(sent[0]!.map((o) => (o.kind === 'SCAN' ? o.rawCode : ''))).toEqual([
      'FG-AAAAAAAA',
      'https://www.mirely.store/suivi/FG-BBBBBBBB',
    ]);
    expect(outcome.sent).toBe(2);
    expect(outcome.refused.map((r) => r.code)).toEqual(['MONTANT_DIFFERENT']);
    expect(store.rows.map((r) => [r.parcelCode, r.status])).toEqual([
      ['FG-AAAAAAAA', QueueStatus.ACCEPTE],
      ['FG-BBBBBBBB', QueueStatus.REFUSE],
    ]);
    expect(await store.countPending('ali')).toBe(0);
  });

  it('keeps each courier’s scans apart across a forced logout (Q12)', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    await enqueue(store, 'sami', livre('FG-BBBBBBBB'));
    const upload = jest.fn(async (operations: CourierOperationInput[]) => accepted(operations));
    await syncOnce(store, 'sami', upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await store.countPending('ali')).toBe(1);
    // A failed upload changes nothing: the rows wait for the next try.
    await expect(
      syncOnce(store, 'ali', async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(await store.countPending('ali')).toBe(1);
  });

  it('says a parcel was already scanned for that action (Coursier 4.9)', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    expect(findPreviousScan(store.rows, 'FG-AAAAAAAA', 'LIVRE')).not.toBeNull();
    expect(findPreviousScan(store.rows, 'FG-AAAAAAAA', 'ECHEC')).toBeNull();
    await store.setStatus(store.rows[0]!.id, QueueStatus.REFUSE, 'X', 'x');
    expect(findPreviousScan(store.rows, 'FG-AAAAAAAA', 'LIVRE')).toBeNull();
  });

  it('counts Livré scans not yet sent in the cash carried', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    await enqueue(store, 'ali', livre('FG-BBBBBBBB'));
    await store.setStatus(store.rows[0]!.id, QueueStatus.ACCEPTE, null, 'Livré');
    expect(pendingDeliveries(store.rows)).toEqual([{ collectedMillimes: 85000n }]);
  });
});

describe('Annuler le dernier scan on the phone (A-11)', () => {
  it('takes a scan never sent off the queue', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    const last = lastScan(store.rows)!;
    expect(await cancelScan(store, last, new Date(NOW.getTime() + 30_000), 60)).toBe('REMOVED');
    expect(store.rows).toHaveLength(0);
  });

  it('queues a cancellation for a sent scan, on the phone’s clock', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    await store.setStatus(store.rows[0]!.id, QueueStatus.ACCEPTE, null, 'Livré');
    const last = lastScan(store.rows)!;
    expect(await cancelScan(store, last, new Date(NOW.getTime() + 30_000), 60)).toBe('QUEUED');
    expect(store.rows.map((r) => [r.kind, r.status])).toEqual([
      ['SCAN', QueueStatus.ANNULE],
      ['ANNULATION', QueueStatus.EN_ATTENTE],
    ]);
    expect(store.rows[1]!.operation).toEqual({
      kind: 'ANNULATION',
      clientScanId: last.id,
      deviceTime: '2026-09-25T10:00:30.000Z',
    });
    expect(lastScan(store.rows)).toBeNull();

    // Refused by the server: the scan stands again.
    await syncOnce(store, 'ali', async () => [
      {
        kind: 'ANNULATION',
        id: last.id,
        ok: false,
        replayed: false,
        code: 'ANNULATION_HORS_DELAI',
        message: 'Délai',
        parcel: null,
      },
    ]);
    expect(store.rows[0]!.status).toBe(QueueStatus.ACCEPTE);
  });

  it('refuses after the minute', async () => {
    const store = memoryStore();
    await enqueue(store, 'ali', livre('FG-AAAAAAAA'));
    expect(
      await cancelScan(store, lastScan(store.rows)!, new Date(NOW.getTime() + 61_000), 60),
    ).toBe('TOO_LATE');
    expect(store.rows).toHaveLength(1);
  });
});
