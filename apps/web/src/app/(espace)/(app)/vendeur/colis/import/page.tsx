import type { GeoTreeView } from '@faffago/shared';
import { CsvImportScreen } from '@/components/csv-import-screen';
import { requireMe, serverGet } from '@/lib/server/session';

/** Import CSV (Vendeur 4.3). */
export default async function ImportCsvPage() {
  const me = await requireMe('vendeur');
  const tree = await serverGet<GeoTreeView>('vendeur', '/geo');
  return (
    <CsvImportScreen
      tree={tree}
      readOnly={me.readOnly}
      suspended={me.seller?.accountState === 'SUSPENDU'}
    />
  );
}
