import type { Prisma } from '@prisma/client';
import { CourierBlockerType, courierBlocker, type CourierBlocker } from '@faffago/shared';

/**
 * What still ties a courier to the operation (D-12). The deactivation is
 * refused while this list is not empty, and the admin sees it whole: his
 * work, his cash, and from phase 8 a caisse session not closed, a fiche de
 * paie not paid, a debt en cours.
 */
export async function courierOpenWork(
  tx: Prisma.TransactionClient,
  courierId: string,
): Promise<CourierBlocker[]> {
  const [inHands, cash, bonsVersement, bonsRetour, caisse, fiches, dettes] = await Promise.all([
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
    tx.caisseSession.count({ where: { courierId, status: { not: 'CLOTUREE' } } }),
    tx.payslip.count({ where: { courierId, status: 'A_PAYER' } }),
    tx.courierDebt.count({ where: { courierId, status: 'EN_COURS' } }),
  ]);

  const counts: [CourierBlockerType, number][] = [
    [CourierBlockerType.COLIS_EN_MAIN, inHands],
    [CourierBlockerType.ARGENT_CHEZ_LE_COURSIER, cash],
    [CourierBlockerType.BON_VERSEMENT_EN_ROUTE, bonsVersement],
    [CourierBlockerType.BON_RETOUR_EN_ROUTE, bonsRetour],
    [CourierBlockerType.CAISSE_NON_CLOTUREE, caisse],
    [CourierBlockerType.FICHE_DE_PAIE_A_PAYER, fiches],
    [CourierBlockerType.DETTE_EN_COURS, dettes],
  ];
  return counts
    .filter(([, count]) => count > 0)
    .map(([type, count]) => courierBlocker(type, count));
}
