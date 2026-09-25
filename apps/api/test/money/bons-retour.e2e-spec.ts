import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { close, count, delivered, scanOp, stationScan, sync } from '../support/money-fixtures';
import { createParcel } from '../support/work-fixtures';

/**
 * Bons de retour (Vendeur 4.12, Admin 4.11, A-10, D-81): Préparation retours
 * at the station, the échange's old item on its own line and at no fee, the
 * ramasseur's Retour reçu, a return not handed over back at the depot at his
 * Clôturer, and the signed copy archived.
 */

let t: TestApp;
let depot: Fixture;
let seller: Fixture;
let livreur: Fixture;
let ramasseur: Fixture;
let other: Fixture;
let depotToken: string;
let ramasseurToken: string;
let otherToken: string;

async function returnAt(location: 'AU_DEPOT' | 'AVEC_LE_LIVREUR') {
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: 'RETOUR_AU_DEPOT',
    location,
    currentLivreurId: location === 'AVEC_LE_LIVREUR' ? livreur.courierId! : null,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function retourRecu(code: string, token = ramasseurToken) {
  return sync(t, token, [scanOp({ action: 'RETOUR_RECU', rawCode: code })]).then(
    ([result]) => result!,
  );
}

beforeAll(async () => {
  t = await createTestApp();
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'br.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'retours@boutique.tn' });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
  ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
  other = await createUser(t.prisma, { role: 'RAMASSEUR' });
  depotToken = (await login(t, depot)).accessToken;
  ramasseurToken = (await login(t, ramasseur)).accessToken;
  otherToken = (await login(t, other)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('a bon de retour from the station to the seller (D-81)', () => {
  it('prepares, hands out, receives, brings back what was not handed over, and archives', async () => {
    const p1 = await returnAt('AU_DEPOT');
    const p2 = await returnAt('AU_DEPOT');
    const p3 = await returnAt('AU_DEPOT');
    const withLivreur = await returnAt('AVEC_LE_LIVREUR');
    const exchange = await delivered(t, {
      seller,
      livreur,
      token: (await login(t, livreur)).accessToken,
      extra: { isExchange: true },
    });

    const first = await stationScan(t, depotToken, 'PREPARATION_RETOURS', p1.code);
    expect(first.body).toMatchObject({ accepted: true, message: 'Ajouté au BR-2026-0925-01' });
    expect((await stationScan(t, depotToken, 'PREPARATION_RETOURS', p2.code)).body.accepted).toBe(
      true,
    );
    expect((await stationScan(t, depotToken, 'PREPARATION_RETOURS', p1.code)).body).toMatchObject({
      accepted: false,
      refusal: 'DEJA_SUR_BON_RETOUR',
    });
    expect(
      (await stationScan(t, depotToken, 'PREPARATION_RETOURS', withLivreur.code)).body,
    ).toMatchObject({
      accepted: false,
      refusal: 'COLIS_PAS_AU_DEPOT',
    });
    // The old item of an échange: its own line, no fee (A-10).
    const item = await stationScan(t, depotToken, 'PREPARATION_RETOURS', exchange.code);
    expect(item.body).toMatchObject({
      accepted: true,
      message: 'Ancien article ajouté au BR-2026-0925-01',
    });
    expect(
      (await stationScan(t, depotToken, 'PREPARATION_RETOURS', exchange.code)).body,
    ).toMatchObject({
      refusal: 'DEJA_SUR_BON_RETOUR',
    });
    expect(
      await t.prisma.sellerCharge.count({ where: { parcelId: exchange.id, type: 'RETOUR' } }),
    ).toBe(0);

    // Annuler le dernier scan takes the parcel off the bon (D-54).
    const third = await stationScan(t, depotToken, 'PREPARATION_RETOURS', p3.code);
    const undone = await t.request('POST', `/scans/depot/${third.body.scanId}/cancel`, {
      token: depotToken,
    });
    expect(undone.status).toBe(200);

    const waiting = await t.request('GET', '/bons-retour', { token: depotToken });
    const group = waiting.body.find(
      (g: { seller: { id: string } }) => g.seller.id === seller.sellerId,
    );
    expect(group.bons).toHaveLength(1);
    const bon = group.bons[0];
    expect(bon).toMatchObject({ number: 'BR-2026-0925-01', status: 'PREPARE', pendingCount: 3 });
    expect(
      bon.lines.map((l: { code: string; itemType: string }) => `${l.code}:${l.itemType}`).sort(),
    ).toEqual([`${p1.code}:COLIS`, `${p2.code}:COLIS`, `${exchange.code}:ARTICLE_RECUPERE`].sort());

    // Out with the ramasseur.
    const out = await t.request('POST', '/caisse/depart', {
      token: depotToken,
      body: { ramasseurId: ramasseur.id, bonsRetour: [bon.id] },
    });
    expect(out.status).toBe(200);
    expect(out.body.bonsRetourEnRoute).toEqual([
      expect.objectContaining({ number: bon.number, pendingLines: 3 }),
    ]);
    expect(await t.prisma.parcel.findUniqueOrThrow({ where: { id: p1.id } })).toMatchObject({
      status: 'RETOUR_EN_ROUTE',
      location: 'AVEC_LE_RAMASSEUR',
    });
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: exchange.id } })).exchangeItemStatus,
    ).toBe('RETOUR_EN_ROUTE');

    // At the seller.
    expect(await retourRecu(p1.code)).toMatchObject({
      ok: true,
      message: `Retour reçu · ${bon.number}`,
      parcel: { status: 'RETOUR_RECU' },
    });
    expect(await retourRecu(p2.code, otherToken)).toMatchObject({
      ok: false,
      code: 'RETOUR_HORS_BON',
    });
    expect(await retourRecu(exchange.code)).toMatchObject({
      ok: true,
      message: `Ancien article rendu · ${bon.number}`,
    });
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: p1.id } })).closedAt,
    ).not.toBeNull();

    // The evening: p2 was not handed over, it comes back to the depot (answer 6).
    await count(t, depotToken, ramasseur, '0');
    expect((await close(t, depotToken, ramasseur)).body.status).toBe('CLOTUREE');
    expect(await t.prisma.parcel.findUniqueOrThrow({ where: { id: p2.id } })).toMatchObject({
      status: 'RETOUR_AU_DEPOT',
      location: 'AU_DEPOT',
    });
    const back = await t.prisma.parcelEvent.findFirstOrThrow({
      where: { parcelId: p2.id, type: 'RETOUR_NON_REMIS' },
    });
    expect(back).toMatchObject({ previousStatus: 'RETOUR_EN_ROUTE', newStatus: 'RETOUR_AU_DEPOT' });
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: p2.id } })).toBe(0);
    expect(await t.prisma.bonRetour.findUniqueOrThrow({ where: { id: bon.id } })).toMatchObject({
      status: 'PREPARE',
      ramasseurId: null,
    });

    // Next visit: only what is left goes, and the bon is Remis once all is received.
    const r2 = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const r2Token = (await login(t, r2)).accessToken;
    await t.request('POST', '/caisse/depart', {
      token: depotToken,
      body: { ramasseurId: r2.id, bonsRetour: [bon.id] },
    });
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p1.id } })).status).toBe(
      'RETOUR_RECU',
    );
    expect(await retourRecu(p2.code, r2Token)).toMatchObject({ ok: true });
    expect((await t.prisma.bonRetour.findUniqueOrThrow({ where: { id: bon.id } })).status).toBe(
      'REMIS',
    );

    const archived = await stationScan(t, depotToken, 'ARCHIVAGE_BON', bon.number);
    expect(archived.body).toMatchObject({ accepted: true, manualEntry: false });
    expect((await t.prisma.bonRetour.findUniqueOrThrow({ where: { id: bon.id } })).status).toBe(
      'ARCHIVE',
    );

    // The seller's Retours: his bons, printable.
    const sellerToken = (await login(t, seller)).accessToken;
    const retours = await t.request('GET', '/retours', { token: sellerToken });
    expect(retours.body.bons).toContainEqual(
      expect.objectContaining({ id: bon.id, status: 'ARCHIVE' }),
    );
    const pdf = await t.request('GET', `/retours/bons/${bon.id}/pdf`, { token: sellerToken });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('lets every staff read the returns, and only Admin and Dépôt prepare them (D-11)', async () => {
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'br.sc' });
    const scToken = (await login(t, sc)).accessToken;
    expect((await t.request('GET', '/bons-retour', { token: scToken })).status).toBe(200);
    const parcel = await returnAt('AU_DEPOT');
    expect((await stationScan(t, scToken, 'PREPARATION_RETOURS', parcel.code)).status).toBe(403);
  });
});
