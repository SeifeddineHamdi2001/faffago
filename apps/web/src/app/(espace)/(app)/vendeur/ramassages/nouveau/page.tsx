import { pickupFeeRuleText, type GeoTreeView } from '@faffago/shared';
import { PickupRequestForm } from '@/components/pickup-request-form';
import { requireMe, serverGet } from '@/lib/server/session';
import type { PickupAddress, ReadyParcel, SellerProfile } from '@/lib/types';

/** Demander un ramassage (Vendeur 4.5). */
export default async function DemanderUnRamassagePage() {
  const me = await requireMe('vendeur');
  if (me.readOnly || me.seller?.accountState === 'SUSPENDU') {
    return (
      <section>
        <h1 className="mb-6 font-display text-2xl font-bold text-navy">Demander un ramassage</h1>
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-900">
          {me.readOnly
            ? 'Consultation en lecture seule : aucun ramassage ne peut être demandé.'
            : 'Votre compte est suspendu : vous ne pouvez pas demander de ramassage.'}
        </p>
      </section>
    );
  }
  const [tree, addresses, readyParcels, profile] = await Promise.all([
    serverGet<GeoTreeView>('vendeur', '/geo'),
    serverGet<PickupAddress[]>('vendeur', '/pickup-addresses'),
    serverGet<ReadyParcel[]>('vendeur', '/pickups/ready-parcels'),
    serverGet<SellerProfile>('vendeur', '/profile'),
  ]);
  const feeRule = pickupFeeRuleText(
    BigInt(profile.rates.pickupFeeMillimes),
    profile.rates.pickupFreeThreshold,
  );
  return (
    <section>
      <h1 className="mb-6 font-display text-2xl font-bold text-navy">Demander un ramassage</h1>
      <PickupRequestForm
        tree={tree}
        addresses={addresses}
        readyParcels={readyParcels}
        feeRule={feeRule}
      />
    </section>
  );
}
