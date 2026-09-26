import type { NotificationTarget } from '@faffago/shared';

export type NotificationArea = 'vendeur' | 'admin';

/** Where a notification leads, in the seller space or the back office; null when it leads nowhere. */
export function notificationHref(
  area: NotificationArea,
  target: NotificationTarget,
): string | null {
  switch (target.screen) {
    case 'PARCEL':
      return area === 'vendeur' ? `/vendeur/colis/${target.code}` : `/admin/colis/${target.code}`;
    case 'CHAT':
      return area === 'vendeur'
        ? `/vendeur/colis/${target.code}#chat`
        : `/admin/chats/${target.code}`;
    case 'PICKUP':
      return area === 'vendeur'
        ? `/vendeur/ramassages/${target.pickupId}`
        : `/admin/ramassages/${target.pickupId}`;
    case 'PAYMENTS':
      return area === 'vendeur' ? '/vendeur/paiements' : '/admin/paiements';
    case 'RETURNS':
      return area === 'vendeur' ? '/vendeur/retours' : '/admin/retours';
    case 'CAISSE':
      return area === 'admin' ? '/admin/caisse' : null;
    case 'PAY':
      return area === 'admin' ? '/admin/paie' : null;
    default:
      return null;
  }
}
