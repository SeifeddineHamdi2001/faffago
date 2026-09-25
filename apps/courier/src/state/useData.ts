import { useCallback, useEffect, useState } from 'react';
import { CourierOperationKind, ScanAction, businessDayKeyOf } from '@faffago/shared';
import { QueueStatus, type QueueRow } from '../queue/queue';
import { useApp } from './app';

/**
 * A screen's data from the API, or the last copy kept on the phone when there
 * is no signal. Loaded again whenever the queue changes, since a sent scan
 * moves the parcels it touched.
 */
export function useData<T>(path: string) {
  const { load, pendingCount, session } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await load<T>(path);
      setData(result.data);
      setFromCache(result.fromCache);
      if (!result.fromCache) setLoadedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [load, path]);

  useEffect(() => {
    if (session) void reload();
  }, [reload, pendingCount, session]);

  return { data, fromCache, loadedAt, error, reload };
}

/**
 * The parcels this courier has scanned today and not cancelled, sent or not:
 * they leave Ma tournée at once, even offline.
 */
export function scannedToday(
  recent: readonly QueueRow[],
  now: Date = new Date(),
): Map<string, QueueRow> {
  // The phone's business day, in Tunis time (A-12).
  const today = businessDayKeyOf(now);
  const byCode = new Map<string, QueueRow>();
  for (const row of recent) {
    if (
      row.kind === CourierOperationKind.SCAN &&
      row.parcelCode &&
      (row.action === ScanAction.LIVRE || row.action === ScanAction.ECHEC) &&
      (row.status === QueueStatus.EN_ATTENTE || row.status === QueueStatus.ACCEPTE) &&
      businessDayKeyOf(new Date(row.deviceTime)) === today
    ) {
      byCode.set(row.parcelCode, row);
    }
  }
  return byCode;
}
