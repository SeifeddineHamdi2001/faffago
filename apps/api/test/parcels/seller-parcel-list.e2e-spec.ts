import { ParcelAction } from '@faffago/shared';
import { ParcelEventService } from '../../src/parcels/parcel-event.service';
import { principalOf } from '../support/principals';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createBonVersement, createParcel, place } from '../support/work-fixtures';

/**
 * Mes colis, Exporter and Détail du colis (Vendeur 4.7, 4.8, D-38): the
 * seller's own parcels only, filtered by group, search and dates, and a
 * timeline that names couriers by first name and never shows GPS.
 */

let t: TestApp;
let seller: Fixture;
let otherSeller: Fixture;
let token: string;

async function inState(
  status: string,
  location: string,
  cashStatus: string | null = null,
  owner = seller,
): Promise<string> {
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status: status as never,
    location: location as never,
    cashStatus: cashStatus as never,
  });
  return (await t.prisma.parcel.findUniqueOrThrow({ where: { id } })).code;
}

beforeAll(async () => {
  t = await createTestApp();
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@liste.tn' });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'autre@liste.tn' });
  await place(t.prisma);
  await inState('CREE', 'CHEZ_LE_VENDEUR');
  await inState('AU_DEPOT', 'AU_DEPOT');
  await inState('A_VERIFIER', 'AU_DEPOT');
  await inState('LIVRE', 'CHEZ_LE_CLIENT', 'CHEZ_LE_COURSIER');
  await inState('LIVRE', 'CHEZ_LE_CLIENT', 'PAYE');
  await inState('RETOUR_AU_DEPOT', 'AU_DEPOT');
  await inState('ANNULE', 'CHEZ_LE_VENDEUR');
  await inState('CREE', 'CHEZ_LE_VENDEUR', null, otherSeller);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  token = (await login(t, seller)).accessToken;
});

describe('Mes colis (Vendeur 4.7)', () => {
  it('lists the seller’s own parcels, newest first, with every group counted', async () => {
    const response = await t.request('GET', '/parcels', { token });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(7);
    expect(response.body.counts).toEqual({
      TOUS: 7,
      EN_COURS: 2,
      LIVRES: 2,
      A_VERIFIER: 1,
      PAYES: 1,
      NON_PAYES: 1,
      RETOURS: 1,
    });
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        recipientName: 'Client',
        delegationNameFr: 'Le Bardo',
        localiteNameFr: 'Khaznadar',
        codAmountMillimes: '85000',
      }),
    );
  });

  it('filters by group', async () => {
    const paid = await t.request('GET', '/parcels?group=PAYES', { token });
    expect(paid.body.items.map((p: { cashStatus: string }) => p.cashStatus)).toEqual(['PAYE']);
    const current = await t.request('GET', '/parcels?group=EN_COURS', { token });
    expect(current.body.items.map((p: { status: string }) => p.status).sort()).toEqual([
      'AU_DEPOT',
      'CREE',
    ]);
  });

  it('searches by code, by name, and by phone', async () => {
    const created = await t.request('POST', '/parcels', {
      token,
      body: {
        recipientName: 'Yasmine Jlassi',
        recipientPhone: '98 111 222',
        localiteId: (await place(t.prisma)).localiteId,
        address: '5 rue de Rome',
        productDescription: 'Sac',
        codAmountMillimes: '40',
      },
    });
    const code: string = created.body.code;
    for (const q of [code, code.slice(3, 8).toLowerCase(), 'jlassi', '98111']) {
      const found = await t.request('GET', `/parcels?q=${encodeURIComponent(q)}`, { token });
      expect(found.body.items.map((p: { code: string }) => p.code)).toEqual([code]);
    }
  });

  it('filters by the Tunisian calendar day', async () => {
    // 2025-03-15 00:30 in Tunis is 2025-03-14 23:30 UTC. A day far from the
    // real clock, which the other parcels of this file are created at.
    const code = await inState('CREE', 'CHEZ_LE_VENDEUR');
    await t.prisma.parcel.update({
      where: { code },
      data: { createdAt: new Date('2025-03-14T23:30:00.000Z') },
    });
    const day = await t.request('GET', '/parcels?from=2025-03-15&to=2025-03-15', { token });
    expect(day.body.items.map((p: { code: string }) => p.code)).toEqual([code]);
    const before = await t.request('GET', '/parcels?to=2025-03-14', { token });
    expect(before.body.items.map((p: { code: string }) => p.code)).not.toContain(code);
  });

  it('pages by 50', async () => {
    const response = await t.request('GET', '/parcels?page=2', { token });
    expect(response.body).toMatchObject({ page: 2, pageSize: 50, items: [] });
  });

  it('refuses a malformed filter', async () => {
    expect((await t.request('GET', '/parcels?group=PERDUS', { token })).status).toBe(400);
    expect(
      (await t.request('GET', '/parcels?from=2026-09-30&to=2026-09-01', { token })).status,
    ).toBe(400);
  });

  it('shows another seller nothing of these parcels (D-26)', async () => {
    const other = await t.request('GET', '/parcels', {
      token: (await login(t, otherSeller)).accessToken,
    });
    expect(other.body.total).toBe(1);
  });
});

describe('Exporter (Vendeur 4.7)', () => {
  it('gives the current filter as a CSV Excel opens, no cache', async () => {
    const response = await t.request('GET', '/parcels/export?group=RETOURS', { token });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = (response.body as Buffer).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(
      'Code;Date;Destinataire;Téléphone;Téléphone 2;Localité;Délégation;Adresse;Statut;Paiement;Montant COD (DT)',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(';Retour au dépôt;;85,000');
  });
});

describe('Détail du colis (Vendeur 4.8, D-38)', () => {
  it('tells the story: Vous, couriers by first name, Faffa Go, places but never GPS', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'le.depot.liste' });
    await t.prisma.user.update({
      where: { id: livreur.id },
      data: { firstName: 'Oussama', lastName: 'Trabelsi' },
    });
    await t.prisma.user.update({
      where: { id: ramasseur.id },
      data: { firstName: 'Hamza', lastName: 'Gharbi' },
    });

    const created = await t.request('POST', '/parcels', {
      token,
      body: {
        recipientName: 'Amira Ben Salah',
        recipientPhone: '29876543',
        localiteId: (await place(t.prisma)).localiteId,
        address: '12 rue de Marseille',
        productDescription: 'Bracelets',
        codAmountMillimes: '85,000',
      },
    });
    const parcelId: string = created.body.id;
    const events = t.app.get(ParcelEventService);
    const act = async (
      actor: Fixture,
      action: string,
      extra: object = {},
      context: object = {},
    ) => {
      const result = await events.run({
        parcelId,
        actor: principalOf(actor),
        request: { action: action as never, ...extra },
        context,
      });
      expect(result.ok).toBe(true);
    };
    await act(ramasseur, ParcelAction.SCAN_RAMASSAGE, {}, { gps: { lat: 36.8, lng: 10.18 } });
    await act(depot, ParcelAction.SCAN_ENTREE_DEPOT);
    await act(depot, ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: livreur.courierId });
    await act(
      livreur,
      ParcelAction.SCAN_ECHEC,
      { failureReason: 'NE_REPOND_PAS' },
      { gps: { lat: 36.81, lng: 10.19 }, note: 'Personne à la porte' },
    );

    const response = await t.request('GET', `/parcels/${created.body.code}`, { token });
    expect(response.status).toBe(200);
    const detail = response.body;
    expect(detail).toMatchObject({ status: 'A_VERIFIER', attemptCount: 1, maxAttempts: 3 });
    expect(
      detail.timeline.map((e: { type: string; actor: object; location: string }) => [
        e.type,
        e.actor,
        e.location,
      ]),
    ).toEqual([
      ['CREATION', { kind: 'VOUS' }, 'CHEZ_LE_VENDEUR'],
      ['RAMASSAGE', { kind: 'COURSIER', firstName: 'Hamza' }, 'AVEC_LE_RAMASSEUR'],
      ['ENTREE_DEPOT', { kind: 'FAFFA_GO' }, 'AU_DEPOT'],
      ['SORTIE_COURSIER', { kind: 'FAFFA_GO' }, 'AVEC_LE_LIVREUR'],
      ['ECHEC_LIVRAISON', { kind: 'COURSIER', firstName: 'Oussama' }, 'AVEC_LE_LIVREUR'],
    ]);
    expect(detail.timeline[4].failureReason).toBe('NE_REPOND_PAS');

    const text = JSON.stringify(detail);
    for (const secret of [
      'Trabelsi',
      'Gharbi',
      livreur.phone,
      '36.8',
      'gps',
      'Personne à la porte',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('keeps the order of events written by one action', async () => {
    const code = await inState('ANNULE', 'CHEZ_LE_VENDEUR');
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { code } });
    const at = new Date();
    await t.prisma.$transaction(async (tx) => {
      for (const type of ['DECISION_RETOURNER', 'PREPARATION_RETOUR', 'DEPART_RETOUR'] as const) {
        await tx.parcelEvent.create({
          data: {
            parcelId: parcel.id,
            type,
            serverTime: at,
            newStatus: 'ANNULE',
            newLocation: 'CHEZ_LE_VENDEUR',
          },
        });
      }
    });
    const response = await t.request('GET', `/parcels/${code}`, { token });
    expect(response.body.timeline.slice(-3).map((e: { type: string }) => e.type)).toEqual([
      'DECISION_RETOURNER',
      'PREPARATION_RETOUR',
      'DEPART_RETOUR',
    ]);
  });

  it('gives the bon de versement of a paid parcel', async () => {
    const code = await inState('LIVRE', 'CHEZ_LE_CLIENT', 'PAYE');
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { code } });
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.liste' });
    await createBonVersement(t.prisma, {
      sellerId: seller.sellerId!,
      ramasseurId: ramasseur.courierId!,
      preparedByUserId: admin.id,
      status: 'REMIS',
    });
    const bon = await t.prisma.bonVersement.findFirstOrThrow({
      where: { sellerId: seller.sellerId! },
    });
    await t.prisma.bonVersementParcel.create({
      data: { bonVersementId: bon.id, parcelId: parcel.id, codMillimes: 85000n },
    });
    const response = await t.request('GET', `/parcels/${code}`, { token });
    expect(response.body.bonNumber).toBe(bon.number);
  });
});
