'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  PRODUCT_CATEGORY_LABELS_FR,
  Permission,
  ProductCategory,
  SELLER_ACCOUNT_STATE_LABELS_FR,
  SELLER_DOCUMENT_POLICY,
  SELLER_DOCUMENT_TYPE_LABELS_FR,
  SELLER_STATUT_LABELS_FR,
  STATUT_DOCUMENT,
  SellerStatut,
  CONTACT_DOCUMENTS,
  changeSellerContactSchema,
  requiredDocumentsFor,
  updateSellerSchema,
  type ProductCategory as ProductCategoryT,
  type SellerAccountState,
  type SellerDocumentType,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, SellerDetail, SellerDocumentRow } from '@/lib/types';
import { ErrorAlert, fieldErrors, useAccountActions } from './account-actions';
import { Field } from './create-courier-form';
import { DocumentInput, FILE_TOO_LARGE } from './create-seller-form';
import { ConfirmDialog, Dialog } from './dialog';

const dateTime = new Intl.DateTimeFormat('fr-TN', { dateStyle: 'short', timeStyle: 'short' });

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** The file, through the BFF with the admin's session: never a public URL (D-32). */
function documentHref(sellerId: string, documentId: string): string {
  return `/api/bff/sellers/${sellerId}/documents/${documentId}`;
}

type Open =
  'modifier' | 'contact' | 'statut' | 'suspendre' | 'reactiver' | { remplacer: SellerDocumentType };

/**
 * The seller page (Admin 4.14). Dépôt and Service client read the shop and
 * the contact; the admin reads and changes everything, documents included.
 * Parcels, payable now, returns and the delivery rate join this page with
 * their phases.
 */
export function SellerDetailScreen({
  seller,
  permissions,
}: {
  seller: SellerDetail;
  permissions: Permission[];
}) {
  const router = useRouter();
  const actions = useAccountActions();
  const [open, setOpen] = useState<Open | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = permissions.includes(Permission.GERER_VENDEURS_COURSIERS);
  const canSeeDocuments = permissions.includes(Permission.VENDEURS_DOCUMENTS);
  const canRegenerate = permissions.includes(Permission.REGENERER_MOT_DE_PASSE);

  function done() {
    setOpen(null);
    setError(null);
    router.refresh();
  }

  async function setState(action: 'suspend' | 'reactivate') {
    setBusy(true);
    const result = await bff('POST', `sellers/${seller.id}/${action}`);
    setBusy(false);
    if (result.ok) done();
    else {
      setOpen(null);
      setError(result.error);
    }
  }

  const statut = seller.statut as SellerStatut | undefined;
  const state = seller.accountState as SellerAccountState | undefined;

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">{seller.shopName}</h1>
        {state && (
          <span className={state === 'ACTIF' ? 'badge-ok' : 'badge-muted'}>
            {SELLER_ACCOUNT_STATE_LABELS_FR[state]}
          </span>
        )}
        {/* D-11: every role that reads a seller reads his parcels in Colis. */}
        <Link href={`/admin/colis?sellerId=${seller.id}`} className="btn-secondary ml-auto">
          Voir ses colis
        </Link>
      </div>
      {(error ?? actions.error) && <ErrorAlert error={(error ?? actions.error)!} />}

      <dl className="card mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Personne de contact" value={seller.contactFullName} />
        <Item label="Téléphone" value={seller.contactPhone} />
        {seller.email && <Item label="Email (identifiant de connexion)" value={seller.email} />}
        {seller.productCategory && (
          <Item
            label="Catégorie de produits"
            value={PRODUCT_CATEGORY_LABELS_FR[seller.productCategory as ProductCategoryT]}
          />
        )}
        {seller.storeLink !== undefined && (
          <Item label="Lien de la boutique" value={seller.storeLink ?? '—'} />
        )}
        {statut && (
          <Item
            label="Statut"
            value={SELLER_STATUT_LABELS_FR[statut]}
            note={
              statut === SellerStatut.CIN_UNIQUEMENT
                ? 'Retenue à la source sur chaque paiement, après les frais Faffa Go.'
                : undefined
            }
          />
        )}
        {seller.createdAt && (
          <Item label="Créé le" value={dateTime.format(new Date(seller.createdAt))} />
        )}
      </dl>

      {canManage && (
        <div className="mb-8 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen('modifier')}>
            Modifier
          </button>
          <button type="button" className="btn-secondary" onClick={() => setOpen('contact')}>
            Changer de contact
          </button>
          <button type="button" className="btn-secondary" onClick={() => setOpen('statut')}>
            Changer le statut
          </button>
          {state === 'ACTIF' ? (
            <button type="button" className="btn-secondary" onClick={() => setOpen('suspendre')}>
              Suspendre
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setOpen('reactiver')}>
              Réactiver
            </button>
          )}
          {canRegenerate && seller.userId && seller.email && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                actions.askRegenerate({
                  userId: seller.userId!,
                  name: seller.shopName,
                  identifierLabel: 'Email',
                  identifier: seller.email!,
                })
              }
            >
              Régénérer le mot de passe
            </button>
          )}
        </div>
      )}

      {canSeeDocuments && seller.documents && statut && (
        <Documents
          sellerId={seller.id}
          documents={seller.documents}
          required={requiredDocumentsFor(statut)}
          onReplace={(type) => setOpen({ remplacer: type })}
        />
      )}

      {open === 'modifier' && (
        <EditSellerDialog seller={seller} onDone={done} onCancel={() => setOpen(null)} />
      )}
      {open === 'contact' && (
        <ChangeContactDialog sellerId={seller.id} onDone={done} onCancel={() => setOpen(null)} />
      )}
      {open === 'statut' && statut && (
        <ChangeStatutDialog
          sellerId={seller.id}
          current={statut}
          onDone={done}
          onCancel={() => setOpen(null)}
        />
      )}
      {typeof open === 'object' && open !== null && (
        <ReplaceDocumentDialog
          sellerId={seller.id}
          type={open.remplacer}
          onDone={done}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === 'suspendre' && (
        <ConfirmDialog
          title="Suspendre le vendeur"
          message="Le vendeur pourra se connecter et suivre ses colis, ses paiements et ses retours, mais ne pourra plus créer de colis ni demander de ramassage."
          confirmLabel="Suspendre"
          busy={busy}
          onConfirm={() => setState('suspend')}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === 'reactiver' && (
        <ConfirmDialog
          title="Réactiver le vendeur"
          message="Le vendeur pourra de nouveau créer des colis et demander des ramassages."
          confirmLabel="Réactiver"
          busy={busy}
          onConfirm={() => setState('reactivate')}
          onCancel={() => setOpen(null)}
        />
      )}
      {actions.element}
    </section>
  );
}

function Item({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-navy/70">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
      {note && <dd className="text-navy/70">{note}</dd>}
    </div>
  );
}

function Documents({
  sellerId,
  documents,
  required,
  onReplace,
}: {
  sellerId: string;
  documents: SellerDocumentRow[];
  required: SellerDocumentType[];
  onReplace: (type: SellerDocumentType) => void;
}) {
  const current = documents.filter((d) => d.replacedAt === null);
  const replaced = documents.filter((d) => d.replacedAt !== null);
  return (
    <section aria-labelledby="documents-title">
      <h2 id="documents-title" className="mb-1 font-display text-lg font-bold text-navy">
        Documents
      </h2>
      <p className="mb-3 text-sm text-navy/70">Visibles par l’admin uniquement.</p>
      <ul className="space-y-2">
        {current.map((document) => (
          <li key={document.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-navy">
                {SELLER_DOCUMENT_TYPE_LABELS_FR[document.type]}
              </p>
              <p className="text-sm text-navy/70">
                {dateTime.format(new Date(document.uploadedAt))} · {sizeLabel(document.sizeBytes)}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                className="btn-secondary"
                href={documentHref(sellerId, document.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Voir
              </a>
              {required.includes(document.type) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onReplace(document.type)}
                >
                  Remplacer
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {replaced.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-navy">
            Versions remplacées ({replaced.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {replaced.map((document) => (
              <li key={document.id}>
                <a
                  className="text-orange-dark underline"
                  href={documentHref(sellerId, document.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {SELLER_DOCUMENT_TYPE_LABELS_FR[document.type]}
                </a>{' '}
                <span className="text-navy/70">
                  · envoyé le {dateTime.format(new Date(document.uploadedAt))}, remplacé le{' '}
                  {dateTime.format(new Date(document.replacedAt!))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const EDITABLE = [
  'shopName',
  'productCategory',
  'storeLink',
  'contactFirstName',
  'contactLastName',
  'contactPhone',
  'email',
] as const;

function EditSellerDialog({
  seller,
  onDone,
  onCancel,
}: {
  seller: SellerDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const initial = Object.fromEntries(
    EDITABLE.map((key) => [key, (seller[key] as string | null | undefined) ?? '']),
  ) as Record<(typeof EDITABLE)[number], string>;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: (typeof EDITABLE)[number]) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const changed = Object.fromEntries(
      EDITABLE.filter((key) => values[key] !== initial[key]).map((key) => [key, values[key]]),
    );
    if (Object.keys(changed).length === 0) {
      onCancel();
      return;
    }
    const parsed = updateSellerSchema.safeParse(changed);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    const result = await bff('PATCH', `sellers/${seller.id}`, changed);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog title="Modifier le vendeur" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" noValidate>
        <Field
          id="shopName"
          label="Nom de la boutique"
          value={values.shopName}
          onChange={set('shopName')}
          error={errors.shopName}
        />
        <div>
          <label htmlFor="productCategory" className="field-label">
            Catégorie de produits
          </label>
          <select
            id="productCategory"
            className="field"
            value={values.productCategory}
            onChange={(e) => set('productCategory')(e.target.value)}
          >
            {Object.values(ProductCategory).map((category) => (
              <option key={category} value={category}>
                {PRODUCT_CATEGORY_LABELS_FR[category]}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="storeLink"
          label="Lien de la boutique (facultatif)"
          value={values.storeLink}
          onChange={set('storeLink')}
          error={errors.storeLink}
          inputMode="url"
        />
        <Field
          id="contactFirstName"
          label="Prénom du contact"
          value={values.contactFirstName}
          onChange={set('contactFirstName')}
          error={errors.contactFirstName}
        />
        <Field
          id="contactLastName"
          label="Nom du contact"
          value={values.contactLastName}
          onChange={set('contactLastName')}
          error={errors.contactLastName}
        />
        <Field
          id="contactPhone"
          label="Téléphone"
          value={values.contactPhone}
          onChange={set('contactPhone')}
          error={errors.contactPhone}
          inputMode="tel"
        />
        <Field
          id="email"
          label="Email (identifiant de connexion)"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * D-42: a different person, with his CIN front and back. The previous CIN is
 * kept as a replaced version. A typo in the name or phone is Modifier.
 */
function ChangeContactDialog({
  sellerId,
  onDone,
  onCancel,
}: {
  sellerId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    contactFirstName: '',
    contactLastName: '',
    contactPhone: '',
  });
  const [files, setFiles] = useState<Partial<Record<SellerDocumentType, File>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = changeSellerContactSchema.safeParse(values);
    const found = parsed.success ? {} : fieldErrors(parsed.error.issues);
    for (const type of CONTACT_DOCUMENTS) {
      const file = files[type];
      if (!file) found[type] = 'Document obligatoire';
      else if (file.size > SELLER_DOCUMENT_POLICY.maxBytes) found[type] = FILE_TOO_LARGE;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.append(key, value);
    for (const type of CONTACT_DOCUMENTS) form.append(type, files[type]!, files[type]!.name);
    setBusy(true);
    const result = await bff('POST', `sellers/${sellerId}/contact`, form);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog title="Changer de contact" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" noValidate>
        <p className="text-sm text-navy/70">
          Une autre personne devient le contact : elle reçoit l’argent et les retours et signe les
          bons. Joignez sa CIN. Pour corriger une faute de frappe, utilisez Modifier.
        </p>
        <Field
          id="newContactFirstName"
          label="Prénom"
          value={values.contactFirstName}
          onChange={set('contactFirstName')}
          error={errors.contactFirstName}
        />
        <Field
          id="newContactLastName"
          label="Nom"
          value={values.contactLastName}
          onChange={set('contactLastName')}
          error={errors.contactLastName}
        />
        <Field
          id="newContactPhone"
          label="Téléphone"
          value={values.contactPhone}
          onChange={set('contactPhone')}
          error={errors.contactPhone}
          inputMode="tel"
        />
        {CONTACT_DOCUMENTS.map((type) => (
          <DocumentInput
            key={type}
            id={`contact-${type}`}
            label={SELLER_DOCUMENT_TYPE_LABELS_FR[type]}
            error={errors[type]}
            onChange={(file) => setFiles((current) => ({ ...current, [type]: file ?? undefined }))}
          />
        ))}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Changer de contact
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** D-33, D-34: Patente and Auto-entrepreneur come with their document. */
function ChangeStatutDialog({
  sellerId,
  current,
  onDone,
  onCancel,
}: {
  sellerId: string;
  current: SellerStatut;
  onDone: () => void;
  onCancel: () => void;
}) {
  const choices = Object.values(SellerStatut).filter((s) => s !== current);
  const [statut, setStatut] = useState<SellerStatut>(choices[0]!);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const needed = STATUT_DOCUMENT[statut];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (needed && !file) return setFileError('Document obligatoire');
    if (file && file.size > SELLER_DOCUMENT_POLICY.maxBytes) return setFileError(FILE_TOO_LARGE);
    const form = new FormData();
    form.append('statut', statut);
    if (needed && file) form.append('document', file, file.name);
    setBusy(true);
    const result = await bff('POST', `sellers/${sellerId}/statut`, form);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog title="Changer le statut" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-sm text-navy/70">
          Statut actuel : {SELLER_STATUT_LABELS_FR[current]}. Le changement s’applique aux bons de
          versement préparés après lui ; un bon déjà préparé ne change pas.
        </p>
        <fieldset>
          <legend className="field-label">Nouveau statut</legend>
          <div className="flex flex-wrap gap-4">
            {choices.map((choice) => (
              <label key={choice} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="statut"
                  checked={statut === choice}
                  onChange={() => {
                    setStatut(choice);
                    setFileError(undefined);
                  }}
                />
                {SELLER_STATUT_LABELS_FR[choice]}
              </label>
            ))}
          </div>
        </fieldset>
        {needed && (
          <DocumentInput
            id="statut-document"
            label={SELLER_DOCUMENT_TYPE_LABELS_FR[needed]}
            error={fileError}
            onChange={setFile}
          />
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Changer le statut
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** A new version; the old one is kept, listed under "Versions remplacées" (D-32). */
function ReplaceDocumentDialog({
  sellerId,
  type,
  onDone,
  onCancel,
}: {
  sellerId: string;
  type: SellerDocumentType;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setFileError('Document obligatoire');
    if (file.size > SELLER_DOCUMENT_POLICY.maxBytes) return setFileError(FILE_TOO_LARGE);
    const form = new FormData();
    form.append('type', type);
    form.append('document', file, file.name);
    setBusy(true);
    const result = await bff('POST', `sellers/${sellerId}/documents`, form);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog title={`Remplacer : ${SELLER_DOCUMENT_TYPE_LABELS_FR[type]}`} onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-sm text-navy/70">L’ancienne version reste consultable.</p>
        <DocumentInput
          id="replace-document"
          label="Nouveau fichier"
          error={fileError}
          onChange={setFile}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Remplacer
          </button>
        </div>
      </form>
    </Dialog>
  );
}
