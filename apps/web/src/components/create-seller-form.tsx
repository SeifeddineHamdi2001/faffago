'use client';

import { useState, type FormEvent } from 'react';
import {
  PRODUCT_CATEGORY_LABELS_FR,
  ProductCategory,
  SELLER_DOCUMENT_POLICY,
  SELLER_DOCUMENT_TYPE_LABELS_FR,
  SELLER_STATUT_LABELS_FR,
  SellerStatut,
  createSellerSchema,
  requiredDocumentsFor,
  type SellerDocumentType,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, CreatedSeller } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Field } from './create-courier-form';
import { Dialog } from './dialog';

export const FILE_TOO_LARGE = 'Fichier trop volumineux : 10 Mo maximum.';

/**
 * Créer un vendeur (Admin 4.14, Vendeur 2.2). The CIN front and back always,
 * plus the patente or the auto-entrepreneur card for those statuts, all sent
 * with the account in one request: no seller exists without them (D-33). The
 * server decides what a file really is; here only presence and size are
 * checked, to save a wasted upload.
 */
export function CreateSellerForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: CreatedSeller) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    shopName: '',
    productCategory: '',
    storeLink: '',
    contactFirstName: '',
    contactLastName: '',
    contactPhone: '',
    email: '',
    statut: SellerStatut.CIN_UNIQUEMENT as SellerStatut,
    cinNumber: '',
  });
  const [files, setFiles] = useState<Partial<Record<SellerDocumentType, File>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const documents = requiredDocumentsFor(values.statut);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createSellerSchema.safeParse(values);
    const found = parsed.success ? {} : fieldErrors(parsed.error.issues);
    for (const type of documents) {
      const file = files[type];
      if (!file) found[type] = 'Document obligatoire';
      else if (file.size > SELLER_DOCUMENT_POLICY.maxBytes) found[type] = FILE_TOO_LARGE;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.append(key, value);
    for (const type of documents) form.append(type, files[type]!, files[type]!.name);

    setBusy(true);
    setApiError(null);
    const result = await bff<CreatedSeller>('POST', 'sellers', form);
    setBusy(false);
    if (result.ok) onCreated(result.data);
    else setApiError(result.error);
  }

  return (
    <Dialog title="Créer un vendeur" onDismiss={onCancel}>
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
            aria-invalid={errors.productCategory ? true : undefined}
            onChange={(e) => set('productCategory')(e.target.value)}
          >
            <option value="">Choisir…</option>
            {Object.values(ProductCategory).map((category) => (
              <option key={category} value={category}>
                {PRODUCT_CATEGORY_LABELS_FR[category]}
              </option>
            ))}
          </select>
          {errors.productCategory && (
            <p className="mt-1 text-sm text-red-700">{errors.productCategory}</p>
          )}
        </div>
        <Field
          id="storeLink"
          label="Lien de la boutique (facultatif)"
          value={values.storeLink}
          onChange={set('storeLink')}
          error={errors.storeLink}
          inputMode="url"
        />
        <fieldset className="space-y-3">
          <legend className="field-label">Personne de contact</legend>
          <Field
            id="contactFirstName"
            label="Prénom"
            value={values.contactFirstName}
            onChange={set('contactFirstName')}
            error={errors.contactFirstName}
          />
          <Field
            id="contactLastName"
            label="Nom"
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
        </fieldset>
        <fieldset>
          <legend className="field-label">Statut</legend>
          <div className="flex flex-wrap gap-4">
            {Object.values(SellerStatut).map((statut) => (
              <label key={statut} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="statut"
                  checked={values.statut === statut}
                  onChange={() => set('statut')(statut)}
                />
                {SELLER_STATUT_LABELS_FR[statut]}
              </label>
            ))}
          </div>
          {values.statut === SellerStatut.CIN_UNIQUEMENT && (
            <>
              <p className="mt-1 text-sm text-navy/70">
                Retenue à la source sur chaque paiement, après les frais Faffa Go.
              </p>
              <div className="mt-3">
                <Field
                  id="seller-cin"
                  label="Numéro de CIN (imprimé sur les certificats de retenue)"
                  value={values.cinNumber}
                  onChange={set('cinNumber')}
                  error={errors.cinNumber}
                  inputMode="decimal"
                />
              </div>
            </>
          )}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="field-label">Documents</legend>
          <p className="text-sm text-navy/70">
            Photo JPEG ou PNG, ou PDF. 10 Mo maximum. Visibles par l’admin uniquement.
          </p>
          {documents.map((type) => (
            <DocumentInput
              key={type}
              id={`document-${type}`}
              label={SELLER_DOCUMENT_TYPE_LABELS_FR[type]}
              error={errors[type]}
              onChange={(file) =>
                setFiles((current) => ({ ...current, [type]: file ?? undefined }))
              }
            />
          ))}
        </fieldset>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Créer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DocumentInput({
  id,
  label,
  error,
  onChange,
}: {
  id: string;
  label: string;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="file"
        className="field"
        accept={SELLER_DOCUMENT_POLICY.accept}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
