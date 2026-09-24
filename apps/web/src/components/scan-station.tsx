'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  DEPOT_SCAN_MODES,
  DEPOT_SCAN_MODE_LABELS_FR,
  DEPOT_SCAN_MODE_SHORTCUTS,
  SCAN_REFUSAL_MESSAGES_FR,
  ScanAction,
  ScanRefusal,
  ScanSource,
  classifyKeyboardEntry,
  depotModeNeedsCourier,
  isRepeatRead,
  type DepotScanMode,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { CourierRow, DepotScanResult } from '@/lib/types';
import { CameraScanner } from './camera-scanner';

/** One line of the station: the API's result, or a refusal the page made itself. */
interface Shown {
  key: string;
  /** The server's scan id, for "Annuler le dernier scan"; null when refused on the page. */
  scanId: string | null;
  accepted: boolean;
  /** Cancelled with "Annuler le dernier scan" (D-54), or the result of that cancellation. */
  cancelled: boolean;
  message: string;
  code: string | null;
  shopName: string | null;
  courier: string | null;
  plannedFor: string | null;
  manualEntry: boolean;
}

const HISTORY_SIZE = 20;
/** A green result clears itself so the next scan follows; a red one stays until the next. */
const ACCEPTED_DISPLAY_MS = 1500;

function fullName(person: { firstName: string; lastName: string } | null): string | null {
  return person ? `${person.firstName} ${person.lastName}` : null;
}

function byName(a: CourierRow, b: CourierRow): number {
  return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'fr');
}

/**
 * The depot's scan station (Admin 4.2, D-50, D-53): three modes chosen with
 * large buttons or F1–F3, then scan after scan without tapping — the phone's
 * camera, a USB barcode gun, or the code typed by hand when a label is
 * damaged (flagged, A-22). Every scan gets its own UUID; the API decides,
 * and the result fills the screen: green, or red with the reason.
 */
export function ScanStation({
  couriers,
  now = () => performance.now(),
}: {
  couriers: CourierRow[];
  /** The clock the keys are timed with, to tell the gun from a person. */
  now?: () => number;
}) {
  const inputId = useId();
  const courierSelectId = useId();
  const [mode, setMode] = useState<DepotScanMode>(ScanAction.ENTREE_DEPOT);
  const [courierId, setCourierId] = useState('');
  const [code, setCode] = useState('');
  const [current, setCurrent] = useState<Shown | null>(null);
  const [history, setHistory] = useState<Shown[]>([]);
  const [camera, setCamera] = useState(false);
  const keyTimes = useRef<number[]>([]);
  const lastRead = useRef<{ code: string; at: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const needsCourier = depotModeNeedsCourier(mode);
  // Sortie coursier: only a livreur who can go out today (D-53). Retour de
  // tournée: any livreur, since one who stopped taking work still hands back.
  const choices = couriers
    .filter((c) => c.role === 'LIVREUR' && c.isActive !== false)
    .filter(
      (c) => mode !== ScanAction.SORTIE_COURSIER || (!c.absentToday && c.acceptsWork !== false),
    )
    .sort(byName);

  const chooseMode = useCallback((next: DepotScanMode) => {
    setMode(next);
    setCourierId('');
    setCurrent(null);
    input.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const next = DEPOT_SCAN_MODES.find((m) => DEPOT_SCAN_MODE_SHORTCUTS[m] === event.key);
      if (next) {
        event.preventDefault();
        chooseMode(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chooseMode]);

  useEffect(() => {
    if (!current?.accepted) return;
    const timer = setTimeout(() => setCurrent(null), ACCEPTED_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [current]);

  function show(line: Shown) {
    setCurrent(line);
    setHistory((h) => [line, ...h].slice(0, HISTORY_SIZE));
    input.current?.focus();
  }

  async function send(rawCode: string, source: ScanSource) {
    const clientScanId = crypto.randomUUID();
    if (needsCourier && !courierId) {
      show({
        key: clientScanId,
        scanId: null,
        accepted: false,
        cancelled: false,
        message: SCAN_REFUSAL_MESSAGES_FR[ScanRefusal.COURSIER_NON_PRECISE],
        code: rawCode,
        shopName: null,
        courier: null,
        plannedFor: null,
        manualEntry: false,
      });
      return;
    }
    const response = await bff<DepotScanResult>('POST', 'scans/depot', {
      clientScanId,
      mode,
      rawCode,
      source,
      ...(needsCourier ? { courierId } : {}),
      deviceTime: new Date().toISOString(),
    });
    if (!response.ok) {
      show({
        key: clientScanId,
        scanId: null,
        accepted: false,
        cancelled: false,
        message: response.error.message,
        code: rawCode,
        shopName: null,
        courier: null,
        plannedFor: null,
        manualEntry: false,
      });
      return;
    }
    const result = response.data;
    show({
      key: result.scanId ?? clientScanId,
      scanId: result.scanId,
      accepted: result.accepted,
      cancelled: false,
      message: result.message,
      code: result.parcel?.code ?? rawCode,
      shopName: result.parcel?.shopName ?? null,
      courier: fullName(result.courier),
      plannedFor: fullName(result.plannedFor),
      manualEntry: result.manualEntry,
    });
  }

  /**
   * Annuler le dernier scan (A-11, D-54). The server checks the window, that
   * it is this person's last scan and that nothing happened to the parcel.
   */
  async function cancelLast(line: Shown) {
    if (!line.scanId) return;
    const response = await bff<{ message: string; parcel: { code: string } }>(
      'POST',
      `scans/depot/${line.scanId}/cancel`,
    );
    const shown: Shown = {
      key: `annulation-${line.key}`,
      scanId: null,
      accepted: response.ok,
      cancelled: response.ok,
      message: response.ok ? response.data.message : response.error.message,
      code: line.code,
      shopName: null,
      courier: null,
      plannedFor: null,
      manualEntry: false,
    };
    if (response.ok) {
      setHistory((h) => h.map((l) => (l.key === line.key ? { ...l, cancelled: true } : l)));
    }
    setCurrent(shown);
    input.current?.focus();
  }

  // The newest accepted scan not cancelled: the only one the button offers.
  const cancellable = history.find((line) => line.accepted && line.scanId && !line.cancelled);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = code.trim();
      const source = classifyKeyboardEntry(keyTimes.current);
      keyTimes.current = [];
      setCode('');
      if (value) void send(value, source);
      return;
    }
    if (event.key.length === 1) keyTimes.current.push(now());
  }

  function onCameraCode(read: string) {
    const at = Date.now();
    if (isRepeatRead(lastRead.current, read, at)) return;
    lastRead.current = { code: read, at };
    void send(read, ScanSource.WEB_CAMERA);
  }

  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Scan</h1>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {DEPOT_SCAN_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => chooseMode(m)}
            className={`flex min-h-14 items-center justify-between rounded-xl border-2 px-4 text-lg font-bold ${
              mode === m
                ? 'border-orange bg-orange text-navy'
                : 'border-navy/20 bg-white text-navy hover:bg-navy/5'
            }`}
          >
            {DEPOT_SCAN_MODE_LABELS_FR[m]}
            <kbd className="rounded border border-navy/30 px-1.5 text-xs font-semibold">
              {DEPOT_SCAN_MODE_SHORTCUTS[m]}
            </kbd>
          </button>
        ))}
      </div>

      {needsCourier && (
        <div className="mb-4 max-w-md">
          <label htmlFor={courierSelectId} className="field-label">
            Coursier
          </label>
          <select
            id={courierSelectId}
            className="field min-h-14 text-lg"
            value={courierId}
            onChange={(e) => {
              setCourierId(e.target.value);
              input.current?.focus();
            }}
          >
            <option value="">Choisir…</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="card mb-4">
        <label htmlFor={inputId} className="field-label">
          Code du colis
        </label>
        <input
          id={inputId}
          ref={input}
          className="field min-h-14 font-mono text-lg"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <p className="mt-2 text-sm text-navy/70">
          Douchette : scannez directement. Étiquette abîmée : tapez le code puis Entrée (saisie
          manuelle, signalée).
        </p>
        <div className="mt-3">
          <button
            type="button"
            className="btn-secondary min-h-14"
            onClick={() => setCamera((c) => !c)}
          >
            {camera ? 'Arrêter la caméra' : 'Activer la caméra'}
          </button>
        </div>
        {camera && <CameraScanner onCode={onCameraCode} />}
      </div>

      {history.length > 0 && (
        <>
          <h2 className="mb-2 font-display text-lg font-bold text-navy">Derniers scans</h2>
          <ul aria-label="Derniers scans" className="space-y-2">
            {history.map((line) => (
              <li
                key={line.key}
                className={`card flex flex-wrap items-center justify-between gap-2 border-l-4 ${
                  line.cancelled
                    ? 'border-l-slate-400'
                    : line.accepted
                      ? 'border-l-green-700'
                      : 'border-l-red-700'
                }`}
              >
                <span className="font-mono">{line.code}</span>
                <span className="font-semibold">
                  {line.message}
                  {line.cancelled && <span className="badge-muted ml-2">Annulé</span>}
                </span>
                {line === cancellable && (
                  <button
                    type="button"
                    className="btn-secondary min-h-14"
                    onClick={() => void cancelLast(line)}
                  >
                    Annuler le dernier scan
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {current && <ResultOverlay line={current} onClose={() => setCurrent(null)} />}
    </section>
  );
}

/** Full screen, readable from arm's length (Admin 4.2): green, red, or navy once cancelled. */
function ResultOverlay({ line, onClose }: { line: Shown; onClose: () => void }) {
  return (
    <div
      role={line.accepted ? 'status' : 'alert'}
      aria-label={line.accepted ? 'Résultat du scan' : undefined}
      onClick={onClose}
      className={`fixed inset-0 z-40 flex cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center text-white ${
        line.cancelled ? 'bg-navy' : line.accepted ? 'bg-green-700' : 'bg-red-700'
      }`}
    >
      <p className="font-display text-4xl font-bold sm:text-5xl">{line.message}</p>
      {line.code && <p className="font-mono text-2xl">{line.code}</p>}
      {line.shopName && <p className="text-xl">{line.shopName}</p>}
      {line.courier && <p className="text-xl">Coursier : {line.courier}</p>}
      {line.plannedFor && (
        <p className="rounded-lg bg-white px-4 py-2 text-xl font-bold text-navy">
          Prévu pour {line.plannedFor}
        </p>
      )}
      {line.manualEntry && (
        <p className="rounded-lg bg-white px-4 py-2 text-lg font-semibold text-navy">
          Saisie manuelle signalée
        </p>
      )}
      <p className="mt-4 text-sm opacity-90">Touchez l’écran pour fermer</p>
    </div>
  );
}
