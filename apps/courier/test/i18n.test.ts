import { makeI18n, translate } from '../src/i18n';
import { ar, fr } from '../src/i18n/messages';
import { moveStop, orderStops } from '../src/screens/livreur/stops';
import { stop } from './harness';

describe('French and Arabic (Coursier 2)', () => {
  it('has every text in both languages', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(fr).sort());
    for (const value of Object.values(ar)) expect(value.trim()).not.toBe('');
  });

  it('fills the values into the text', () => {
    expect(translate('FR', 'pendingScans', { count: 3 })).toBe('3 scans en attente d’envoi');
    expect(translate('AR', 'attempt', { n: 2, m: 3 })).toBe('المحاولة 2/3');
  });

  it('translates statuses and reasons, and keeps amounts in Latin digits', () => {
    const arabic = makeI18n('AR');
    expect(arabic.rtl).toBe(true);
    expect(arabic.reason('REPORTE_PAR_LE_CLIENT')).toBe('أجّله الحريف');
    expect(arabic.status('LIVRE')).toBe('تم التسليم');
    expect(arabic.money('85000')).toBe('85,000 DT');
    const french = makeI18n('FR');
    expect(french.reason('REPORTE_PAR_LE_CLIENT')).toBe('Reporté par le client');
    expect(french.day('2026-09-28')).toBe('28/09');
  });

  it('shows the API’s message in French, a translation by code in Arabic', () => {
    expect(makeI18n('FR').refusal('MONTANT_DIFFERENT', 'Le montant…')).toBe('Le montant…');
    expect(makeI18n('AR').refusal('MONTANT_DIFFERENT', 'Le montant…')).toBe(
      'المبلغ المحصّل يجب أن يساوي مبلغ الطرد بالضبط',
    );
    expect(makeI18n('AR').refusal('INCONNU', 'Message')).toBe('Message');
  });
});

describe('the order of Ma tournée (Coursier 4.2)', () => {
  const a = stop({ code: 'FG-A' });
  const b = stop({ code: 'FG-B' });
  const c = stop({ code: 'FG-C' });

  it('keeps the courier’s order, new stops last, gone ones dropped', () => {
    expect(orderStops([a, b, c], ['FG-C', 'FG-X', 'FG-A']).map((s) => s.code)).toEqual([
      'FG-C',
      'FG-A',
      'FG-B',
    ]);
  });

  it('moves a stop up or down, never past the ends', () => {
    expect(moveStop(['FG-A', 'FG-B', 'FG-C'], 'FG-C', -1)).toEqual(['FG-A', 'FG-C', 'FG-B']);
    expect(moveStop(['FG-A', 'FG-B'], 'FG-A', -1)).toEqual(['FG-A', 'FG-B']);
  });
});
