import type { Prisma } from '@prisma/client';
import { CourierBlockerType, courierBlocker, type CourierBlocker } from '@faffago/shared';

/**
 * What still ties a courier to the operation (D-12). The deactivation is
 * refused while this list is not empty, and the admin sees it whole.
 *
 * Phase 7 adds, with the Caisse and the pay — see the it.todo tests in
 * test/accounts/courier-deactivation.e2e-spec.ts:
 *   CAISSE_NON_CLOTUREE    a caisse session of his that is not CLOTUREE
 *   FICHE_DE_PAIE_A_PAYER  a payslip of his that is A_PAYER
 *   DETTE_EN_COURS         a debt of his that is EN_COURS
 */
export async function courierOpenWork(
  tx: Prisma.TransactionClient,
  courierId: string,
): Promise<CourierBlocker[]> {
  const [inHands, cash, bonsVersement, bonsRetour] = await Promise.all([
    tx.parcel.count({
      where: {
        OR: [
          // With the livreur, out for delivery.
          { currentLivreurId: courierId, location: 'AVEC_LE_LIVREUR' },
          // With the ramasseur: picked up at the seller, or returns he is
          // taking back on a bon de retour.
          {
            location: 'AVEC_LE_RAMASSEUR',
            OR: [
              { pickupLinks: { some: { pickup: { ramasseurId: courierId } } } },
              {
                bonRetourLines: {
                  some: { bonRetour: { ramasseurId: courierId, status: 'EN_ROUTE' } },
                },
              },
            ],
          },
        ],
      },
    }),
    tx.parcel.count({ where: { currentLivreurId: courierId, cashStatus: 'CHEZ_LE_COURSIER' } }),
    tx.bonVersement.count({ where: { ramasseurId: courierId, status: 'EN_ROUTE' } }),
    tx.bonRetour.count({ where: { ramasseurId: courierId, status: 'EN_ROUTE' } }),
  ]);

  const counts: [CourierBlockerType, number][] = [
    [CourierBlockerType.COLIS_EN_MAIN, inHands],
    [CourierBlockerType.ARGENT_CHEZ_LE_COURSIER, cash],
    [CourierBlockerType.BON_VERSEMENT_EN_ROUTE, bonsVersement],
    [CourierBlockerType.BON_RETOUR_EN_ROUTE, bonsRetour],
  ];
  return counts
    .filter(([, count]) => count > 0)
    .map(([type, count]) => courierBlocker(type, count));
}
