import type { AEmporter } from '../../api/types';
import { BigButton, Card, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import { colors } from '../../theme';

/**
 * À emporter (Coursier 4.6, D-84): the bons de versement he hands this
 * seller, with their amount, and the bons de retour, line by line; then the
 * two scan steps, Bon de versement and Retours.
 */
export function AEmporterCard({
  aEmporter,
  onScanBon,
  onScanRetours,
}: {
  aEmporter: AEmporter;
  onScanBon: () => void;
  onScanRetours: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { bonsVersement, bonsRetour } = aEmporter;
  if (bonsVersement.length === 0 && bonsRetour.length === 0) {
    return (
      <Card>
        <T muted>{t('aEmporterNone')}</T>
      </Card>
    );
  }
  const state = (bon: { enMain: boolean; remis: boolean }) =>
    bon.remis ? t('bonRemis') : bon.enMain ? t('bonEnMain') : t('bonAuDepot');
  const bonToHand = bonsVersement.some((bon) => bon.enMain);
  const returnsToHand = bonsRetour.some(
    (bon) => bon.enMain && bon.lines.some((line) => !line.received),
  );

  return (
    <Card style={{ borderColor: colors.orange, borderWidth: 2 }}>
      <T bold size="large">
        {t('aEmporter')}
      </T>
      {bonsVersement.map((bon) => (
        <T key={bon.id} testID={`bon-${bon.number}`}>
          {t('bonVersementLine', { number: bon.number, amount: i18n.money(bon.netMillimes) })} ·{' '}
          {state(bon)}
        </T>
      ))}
      {bonsRetour.map((bon) => (
        <T key={bon.id}>
          {t('bonRetourLine', { number: bon.number, count: bon.lines.length })} · {state(bon)}
        </T>
      ))}
      {bonsRetour.flatMap((bon) =>
        bon.enMain
          ? bon.lines.map((line) => (
              <T key={`${bon.id}-${line.code}-${line.itemType}`} muted={line.received}>
                {line.code}
                {line.itemType === 'ARTICLE_RECUPERE' ? ` · ${t('ancienArticle')}` : ''} ·{' '}
                {line.received ? t('retourRecu') : t('retourARendre')}
              </T>
            ))
          : [],
      )}
      {bonToHand ? <BigButton testID="scan-bon" label={t('scanBon')} onPress={onScanBon} /> : null}
      {returnsToHand ? (
        <BigButton
          testID="scan-retours"
          variant="secondary"
          label={t('scanRetours')}
          onPress={onScanRetours}
        />
      ) : null}
    </Card>
  );
}
