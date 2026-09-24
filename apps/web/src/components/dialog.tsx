'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal dialog. Escape closes it only when `onDismiss` is given: the
 * "Copier les identifiants" box has none, so it cannot be closed by accident.
 */
export function Dialog({
  title,
  children,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-4 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onDismiss) onDismiss();
        }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none"
      >
        <h2 id={titleId} className="mb-4 font-display text-lg font-bold text-navy">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** When the action itself is a cancellation, "Annuler" would say both things. */
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onDismiss={onCancel}>
      <p className="mb-6 text-sm text-navy/80">{message}</p>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
