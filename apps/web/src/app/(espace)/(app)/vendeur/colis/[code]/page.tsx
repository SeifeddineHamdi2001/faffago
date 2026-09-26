import { notFound } from 'next/navigation';
import type { GeoTreeView } from '@faffago/shared';
import { ChatPanel } from '@/components/chat-panel';
import { ParcelScreen } from '@/components/parcel-screen';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { ChatThreadView, SellerParcelDetail } from '@/lib/types';

/** One of the seller's parcels. Another seller's code is simply not found (D-26). */
export default async function ColisPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireMe('vendeur');
  const { code } = await params;
  const parcel = await serverGetOrNull<SellerParcelDetail>(
    'vendeur',
    `/parcels/${encodeURIComponent(code)}`,
  );
  if (!parcel) notFound();
  const tree = await serverGet<GeoTreeView>('vendeur', '/geo');
  // The chat of the parcel (Vendeur 4.10): read here, written unless the parcel is at the depot or closed.
  const chat = await serverGetOrNull<{ thread: ChatThreadView | null }>(
    'vendeur',
    `/chat/seller/${encodeURIComponent(code)}`,
  );
  return (
    <>
      <ParcelScreen parcel={parcel} tree={tree} readOnly={me.readOnly} />
      <div className="mt-6">
        <ChatPanel
          side="seller"
          code={parcel.code}
          initial={chat?.thread ?? null}
          readOnly={me.readOnly}
        />
      </div>
    </>
  );
}
