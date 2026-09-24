import { TrackStepState, trackLineFor, type ParcelStatus } from '@faffago/shared';

/**
 * The track line (Vendeur 4.8): Créé › Ramassé › Au dépôt › En livraison ›
 * Livré, or the return flow once the parcel is a return. Compact in the
 * Mes colis table, with its labels on the parcel page.
 */
export function TrackLine({
  status,
  compact = false,
}: {
  status: ParcelStatus;
  compact?: boolean;
}) {
  const line = trackLineFor(status);
  const current = line.steps.findIndex((step) => step.state === TrackStepState.ACTUEL);
  const reached = current === -1 ? line.steps.length : current + 1;
  const summary = `${line.flow === 'RETOUR' ? 'Retour' : 'Livraison'} : étape ${reached} sur ${line.steps.length}`;
  const color = (state: TrackStepState) =>
    state === TrackStepState.FAIT
      ? 'bg-navy text-white'
      : state === TrackStepState.ACTUEL
        ? line.attention
          ? 'bg-orange text-navy'
          : 'bg-orange/30 text-navy'
        : 'bg-navy/10 text-navy/60';

  if (compact) {
    return (
      <span className="flex gap-0.5" role="img" aria-label={summary} title={summary}>
        {line.steps.map((step) => (
          <span key={step.label} className={`h-2 w-4 rounded-sm ${color(step.state)}`} />
        ))}
      </span>
    );
  }
  return (
    <ol className="flex flex-wrap gap-1 text-xs font-semibold" aria-label={summary}>
      {line.steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.state === TrackStepState.ACTUEL ? 'step' : undefined}
          className={`rounded-full px-3 py-1 ${color(step.state)} ${line.cancelled ? 'line-through' : ''}`}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}
