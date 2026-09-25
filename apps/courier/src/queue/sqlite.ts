import * as SQLite from 'expo-sqlite';
import type { CourierOperationInput } from '@faffago/shared';
import { QueueStatus, type QueueRow, type QueueStore } from './queue';

/**
 * The queue on the phone's disk (tech-stack 4). Logging out never touches
 * this table (Q12); only answered rows older than two days are pruned.
 */

interface RawRow {
  id: string;
  seq: number;
  user_id: string;
  kind: string;
  action: string | null;
  parcel_code: string | null;
  payload: string;
  device_time: string;
  status: string;
  code: string | null;
  message: string | null;
}

function fromRaw(raw: RawRow): QueueRow {
  return {
    id: raw.id,
    seq: raw.seq,
    userId: raw.user_id,
    kind: raw.kind as QueueRow['kind'],
    action: raw.action as QueueRow['action'],
    parcelCode: raw.parcel_code,
    operation: JSON.parse(raw.payload) as CourierOperationInput,
    deviceTime: raw.device_time,
    status: raw.status as QueueStatus,
    code: raw.code,
    message: raw.message,
  };
}

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function database(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync('faffago.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS scan_queue (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        action TEXT,
        parcel_code TEXT,
        payload TEXT NOT NULL,
        device_time TEXT NOT NULL,
        status TEXT NOT NULL,
        code TEXT,
        message TEXT
      );
      CREATE INDEX IF NOT EXISTS scan_queue_user_status ON scan_queue (user_id, status, seq);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    return db;
  })();
  return opening;
}

export function sqliteStore(): QueueStore {
  return {
    async insert(row) {
      const db = await database();
      await db.runAsync(
        `INSERT INTO scan_queue (id, user_id, kind, action, parcel_code, payload, device_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.userId,
        row.kind,
        row.action,
        row.parcelCode,
        JSON.stringify(row.operation),
        row.deviceTime,
        QueueStatus.EN_ATTENTE,
      );
    },
    async pending(userId, limit) {
      const db = await database();
      const rows = await db.getAllAsync<RawRow>(
        'SELECT * FROM scan_queue WHERE user_id = ? AND status = ? ORDER BY seq LIMIT ?',
        userId,
        QueueStatus.EN_ATTENTE,
        limit,
      );
      return rows.map(fromRaw);
    },
    async since(userId, sinceIso) {
      const db = await database();
      const rows = await db.getAllAsync<RawRow>(
        'SELECT * FROM scan_queue WHERE user_id = ? AND device_time >= ? ORDER BY seq',
        userId,
        sinceIso,
      );
      return rows.map(fromRaw);
    },
    async get(id) {
      const db = await database();
      const row = await db.getFirstAsync<RawRow>('SELECT * FROM scan_queue WHERE id = ?', id);
      return row ? fromRaw(row) : null;
    },
    async setStatus(id, status, code, message) {
      const db = await database();
      await db.runAsync(
        'UPDATE scan_queue SET status = ?, code = ?, message = ? WHERE id = ?',
        status,
        code,
        message,
        id,
      );
    },
    async remove(id) {
      const db = await database();
      await db.runAsync(
        'DELETE FROM scan_queue WHERE id = ? AND status = ?',
        id,
        QueueStatus.EN_ATTENTE,
      );
    },
    async countPending(userId) {
      const db = await database();
      const row = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM scan_queue WHERE user_id = ? AND status = ?',
        userId,
        QueueStatus.EN_ATTENTE,
      );
      return row?.n ?? 0;
    },
    async prune(beforeIso) {
      const db = await database();
      await db.runAsync(
        'DELETE FROM scan_queue WHERE status <> ? AND device_time < ?',
        QueueStatus.EN_ATTENTE,
        beforeIso,
      );
    },
  };
}

/** The last answer of a screen, shown offline (Coursier 1: works without signal). */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM cache WHERE key = ?',
    key,
  );
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const db = await database();
  await db.runAsync(
    'INSERT INTO cache (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}
