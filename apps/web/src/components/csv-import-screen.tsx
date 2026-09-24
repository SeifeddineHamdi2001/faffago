'use client';

import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import {
  CSV_MAX_ROWS,
  CSV_ROW_VERDICT_LABELS_FR,
  CsvRowVerdict,
  csvTemplate,
  decodeCsvBytes,
  delegationListCsv,
  evaluateCsvRow,
  formatDT,
  localiteFullLabel,
  localitesOfTree,
  millimesFromJson,
  readCsvFile,
  tryParseDT,
  type CsvDataRow,
  type CsvFileError,
  type CsvRowEvaluation,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, ParcelImport, RefusedImportRow } from '@/lib/types';
import { ErrorAlert } from './account-actions';

/** The file's bytes, through FileReader: every browser has it, and so do the tests. */
function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsArrayBuffer(file);
  });
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const VERDICT_CLASS: Record<CsvRowVerdict, string> = {
  VALIDE: 'badge-ok',
  A_VERIFIER: 'badge-warn',
  ERREUR: 'badge-muted',
};

interface LoadedFile {
  name: string;
  /** Drawn for this file: a retried import creates nothing twice. */
  importId: string;
  rows: CsvDataRow[];
}

/**
 * Import CSV (Vendeur 4.3, D-17, D-37). The file is read and checked in the
 * browser with the shared rules: each row is Valide, À vérifier (a localité
 * to choose in its dropdown) or Erreur (fix the file and load it again).
 * Only Valide rows are sent, and the server checks each one again.
 */
export function CsvImportScreen({
  tree,
  readOnly,
  suspended,
}: {
  tree: GeoTreeView;
  readOnly: boolean;
  suspended: boolean;
}) {
  const localites = useMemo(() => localitesOfTree(tree), [tree]);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<CsvFileError | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [refused, setRefused] = useState<Map<number, RefusedImportRow>>(new Map());
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ParcelImport | null>(null);

  const evaluations: CsvRowEvaluation[] = useMemo(
    () => (file ? file.rows.map((row) => evaluateCsvRow(row, localites, choices[row.line])) : []),
    [file, localites, choices],
  );
  const counts = useMemo(() => {
    const out: Record<CsvRowVerdict, number> = { VALIDE: 0, A_VERIFIER: 0, ERREUR: 0 };
    for (const evaluation of evaluations) out[evaluation.verdict] += 1;
    return out;
  }, [evaluations]);

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setResult(null);
    setApiError(null);
    setRefused(new Map());
    setChoices({});
    const read = readCsvFile(decodeCsvBytes(await readBytes(chosen)));
    if (!read.ok) {
      setFile(null);
      setFileError(read.error);
      return;
    }
    setFileError(null);
    setFile({ name: chosen.name, importId: crypto.randomUUID(), rows: read.rows });
  }

  async function importValid() {
    if (!file) return;
    const rows = file.rows
      .filter((_, i) => evaluations[i]!.verdict === CsvRowVerdict.VALIDE)
      .map((row) => ({ line: row.line, cells: row.cells, localiteId: choices[row.line] ?? null }));
    setBusy(true);
    setApiError(null);
    const response = await bff<ParcelImport>('POST', 'parcels/imports', {
      importId: file.importId,
      fileName: file.name,
      rows,
    });
    setBusy(false);
    if (response.ok) {
      setResult(response.data);
      setFile(null);
      return;
    }
    setApiError(response.error);
    const rowsRefused = (response.error as ApiError & { rows?: RefusedImportRow[] }).rows ?? [];
    setRefused(new Map(rowsRefused.map((row) => [row.line, row])));
  }

  if (result) {
    return (
      <section>
        <h1 className="mb-6 font-display text-2xl font-bold text-navy">Import CSV</h1>
        <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 font-semibold text-green-900">
          {result.parcelCount} colis importés depuis {result.fileName}.
        </p>
        <ul className="card mb-6 divide-y divide-navy/10 text-sm">
          {result.parcels.map((parcel) => (
            <li key={parcel.code} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="text-navy/70">Ligne {parcel.line}</span>
              <Link
                href={`/vendeur/colis/${parcel.code}`}
                className="font-mono font-semibold text-navy underline"
              >
                {parcel.code}
              </Link>
              <span>{parcel.recipientName}</span>
              <span>{formatDT(millimesFromJson(parcel.codAmountMillimes))}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary" onClick={() => setResult(null)}>
          Nouvel import
        </button>
      </section>
    );
  }

  const blocked = readOnly || suspended;

  return (
    <section>
      <h1 className="mb-6 font-display text-2xl font-bold text-navy">Import CSV</h1>
      {suspended && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          Votre compte est suspendu : vous ne pouvez pas créer de colis.
        </p>
      )}
      {readOnly && (
        <p className="mb-4 text-navy/70">
          Consultation en lecture seule : aucun colis ne peut être importé.
        </p>
      )}

      <div className="card mb-6 space-y-3 text-sm">
        <p>
          Remplissez le modèle, une ligne par colis ({CSV_MAX_ROWS} au maximum), puis enregistrez-le
          au format CSV. La localité se donne par son nom ; ajoutez la délégation quand le nom
          existe à plusieurs endroits.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => download('modele-import-faffago.csv', csvTemplate())}
          >
            Télécharger le modèle
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => download('delegations-faffago.csv', delegationListCsv(tree))}
          >
            Liste des délégations
          </button>
        </div>
      </div>

      {!blocked && (
        <div className="mb-6">
          <label htmlFor="csv-file" className="field-label">
            Fichier CSV
          </label>
          <input
            id="csv-file"
            type="file"
            className="field"
            accept=".csv,text/csv"
            onChange={load}
          />
        </div>
      )}

      {fileError && <ErrorAlert error={{ code: fileError.code, message: fileError.message }} />}
      {apiError && <ErrorAlert error={apiError} />}

      {file && (
        <>
          <p className="mb-3 text-sm font-semibold text-navy" aria-live="polite">
            {file.name} : {counts.VALIDE} valide{counts.VALIDE > 1 ? 's' : ''} · {counts.A_VERIFIER}{' '}
            à vérifier · {counts.ERREUR} erreur{counts.ERREUR > 1 ? 's' : ''}
          </p>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-navy/70">
                <tr>
                  <th className="p-2">Ligne</th>
                  <th className="p-2">État</th>
                  <th className="p-2">Destinataire</th>
                  <th className="p-2">Téléphone</th>
                  <th className="p-2">Localité</th>
                  <th className="p-2">COD</th>
                  <th className="p-2">Détail</th>
                </tr>
              </thead>
              <tbody>
                {file.rows.map((row, i) => (
                  <PreviewRow
                    key={row.line}
                    row={row}
                    evaluation={evaluations[i]!}
                    refused={refused.get(row.line)}
                    onChoose={(localiteId) =>
                      setChoices((current) => ({ ...current, [row.line]: localiteId }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-4 text-sm text-navy/70">
            Seules les lignes valides sont importées. Pour les autres, corrigez le fichier et
            chargez-le de nouveau.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || counts.VALIDE === 0}
            onClick={importValid}
          >
            Importer {counts.VALIDE} colis
          </button>
        </>
      )}
    </section>
  );
}

function PreviewRow({
  row,
  evaluation,
  refused,
  onChoose,
}: {
  row: CsvDataRow;
  evaluation: CsvRowEvaluation;
  refused?: RefusedImportRow;
  onChoose: (localiteId: string) => void;
}) {
  const cod = tryParseDT(row.cells.montant_cod ?? '');
  const problems = refused?.problems.length ? refused.problems : evaluation.problems;
  // The server's word wins: a localité closed since this page was loaded, for one.
  const verdict = refused?.verdict ?? evaluation.verdict;
  const staleHere = refused !== undefined && evaluation.verdict === CsvRowVerdict.VALIDE;
  const selectId = `localite-ligne-${row.line}`;

  return (
    <tr className="border-t border-navy/10 align-top">
      <td className="p-2">{row.line}</td>
      <td className="p-2">
        <span className={VERDICT_CLASS[verdict]}>{CSV_ROW_VERDICT_LABELS_FR[verdict]}</span>
      </td>
      <td className="p-2">{row.cells.nom_destinataire}</td>
      <td className="p-2">{row.cells.telephone}</td>
      <td className="p-2">
        {evaluation.localiteIssue && evaluation.localiteIssue.options.length > 0 ? (
          <>
            <label htmlFor={selectId} className="sr-only">
              Localité de la ligne {row.line}
            </label>
            <select
              id={selectId}
              className="field"
              defaultValue=""
              onChange={(e) => onChoose(e.target.value)}
            >
              <option value="">{row.cells.localite || 'Choisir…'}</option>
              {evaluation.localiteIssue.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {localiteFullLabel(option)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-navy/70">{evaluation.localiteIssue.message}</p>
          </>
        ) : evaluation.localite ? (
          localiteFullLabel(evaluation.localite)
        ) : (
          row.cells.localite
        )}
      </td>
      <td className="p-2 whitespace-nowrap">
        {cod !== null ? formatDT(cod) : row.cells.montant_cod}
      </td>
      <td className="p-2">
        {staleHere && problems.length === 0 && (
          <p className="text-red-800">
            Refusée à l’import : rechargez la page, puis chargez le fichier de nouveau.
          </p>
        )}
        <ul>
          {problems.map((problem) => (
            <li key={`${problem.column}-${problem.message}`} className="text-red-800">
              {problem.column ? `${problem.column} : ` : ''}
              {problem.message}
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}
