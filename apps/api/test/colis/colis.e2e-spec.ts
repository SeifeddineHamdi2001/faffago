import { randomUUID } from 'node:crypto';
import type { ParcelLocation, ParcelStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Colis, the team's side (Admin 4.3, D-11): every parcel, searched and
 * filtered, exported; the detail with the whole event log, the money and the
 * courier's reason; Réimprimer l'étiquette with the same code (A-9). Reading
 * is open to Admin, Dépôt and Service client; reprinting to Admin and Dépôt.
 */

let t: TestApp;
let adminToken: string;
let depot: Fixture;
let depotToken: string;
let sc: Fixture;
let scToken: string;
let yasmine: Fixture;
let chic: Fixture;
let ali: Fixture;
let marsaZone: string;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };

async function placeIn(code: string) {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code } });
  const localite = await t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
    orderBy: { nameFr: 'asc' },
  });
  return { delegationId: delegation.id, localiteId: localite.id };
}

async function parcel(input: {
  seller?: Fixture;
  in?: string;
  status?: ParcelStatus;
  location?: ParcelLocation;
  extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
}) {
  const seller = input.seller ?? yasmine;
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: input.status,
    location: input.location,
    where: await placeIn(input.in ?? 'TUN-MARSA'),
    extra: input.extra,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function list(query = '', token = depotToken) {
  return t.request('GET', `/colis${query ? `?${query}` : ''}`, { token });
}

function codes(response: { body: { items: Array<{ code: string }> } }) {
  return response.body.items.map((item) => item.code).sort();
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'colis.depot' });
  sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'colis.sc' });
  yasmine = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'yasmine@boutique.tn',
    shopName: 'Boutique Yasmine',
  });
  chic = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'chic@boutique.tn',
    shopName: 'Chic Tunis',
  });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
  await t.prisma.user.update({
    where: { id: ali.id },
    data: { firstName: 'Ali', lastName: 'Ben Salah' },
  });
  marsaZone = (await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-MARSA' } }))
    .zoneId!;
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  depotToken = (await login(t, depot)).accessToken;
  scToken = (await login(t, sc)).accessToken;
  adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken;
});

describe('GET /colis (Admin 4.3)', () => {
  it('lists every seller’s parcels, newest first, with what the team reads at a glance', async () => {
    const mine = await parcel({
      extra: { recipientName: 'Amira Trabelsi', recipientPhone: '22111333' },
    });
    const theirs = await parcel({ seller: chic, in: 'TUN-BARDO' });

    const response = await list();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 50 });
    expect(codes(response)).toEqual(expect.arrayContaining([mine.code, theirs.code]));
    const row = response.body.items.find((i: { code: string }) => i.code === mine.code);
    expect(row).toMatchObject({
      code: mine.code,
      shopName: 'Boutique Yasmine',
      sellerId: yasmine.sellerId,
      recipientName: 'Amira Trabelsi',
      recipientPhone: '22111333',
      delegationNameFr: 'La Marsa',
      localiteNameFr: expect.any(String),
      zoneName: expect.any(String),
      status: 'CREE',
      location: 'CHEZ_LE_VENDEUR',
      cashStatus: null,
      codAmountMillimes: '85000',
      courier: null,
    });
  });

  it('searches by code, customer name, phone or shop', async () => {
    const p = await parcel({
      extra: { recipientName: 'Hela Mansour', recipientPhone: '98765001' },
    });
    const other = await parcel({ seller: chic });

    expect(codes(await list(`q=${p.code.toLowerCase()}`))).toEqual([p.code]);
    expect(codes(await list(`q=${encodeURIComponent(p.code.slice(3, 8))}`))).toEqual([p.code]);
    expect(codes(await list('q=mansour'))).toEqual([p.code]);
    expect(codes(await list('q=98%20765%20001'))).toEqual([p.code]);
    expect(codes(await list('q=chic'))).toContain(other.code);
    expect(codes(await list('q=chic'))).not.toContain(p.code);
  });

  it('filters by status, cash status, seller, courier and zone', async () => {
    const out = await parcel({
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      extra: { currentLivreurId: ali.courierId! },
    });
    const paid = await parcel({
      status: 'LIVRE',
      location: 'CHEZ_LE_CLIENT',
      extra: { cashStatus: 'AU_DEPOT' },
    });
    const bardo = await parcel({ seller: chic, in: 'TUN-BARDO' });

    expect(codes(await list('status=EN_LIVRAISON'))).toContain(out.code);
    expect(codes(await list('status=EN_LIVRAISON'))).not.toContain(paid.code);
    expect(codes(await list('cashStatus=AU_DEPOT'))).toEqual([paid.code]);
    expect(codes(await list(`sellerId=${chic.sellerId}`))).toContain(bardo.code);
    expect(codes(await list(`sellerId=${chic.sellerId}`))).not.toContain(out.code);
    const byCourier = await list(`courierId=${ali.id}`);
    expect(codes(byCourier)).toEqual([out.code]);
    expect(byCourier.body.items[0].courier).toEqual({ firstName: 'Ali', lastName: 'Ben Salah' });
    expect(codes(await list(`zoneId=${marsaZone}`))).toContain(out.code);
    expect(codes(await list(`zoneId=${marsaZone}`))).not.toContain(bardo.code);
  });

  it('filters the parcels of a délégation in no zone (D-51)', async () => {
    const kram = await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-KRAM' } });
    const p = await parcel({ in: 'TUN-KRAM' });
    await t.prisma.delegation.update({ where: { id: kram.id }, data: { zoneId: null } });
    try {
      expect(codes(await list('zoneId=SANS_ZONE'))).toEqual([p.code]);
    } finally {
      await t.prisma.delegation.update({ where: { id: kram.id }, data: { zoneId: kram.zoneId } });
    }
  });

  it('filters by creation day, in Tunis time', async () => {
    const p = await parcel({ extra: { createdAt: new Date('2026-08-31T23:30:00.000Z') } });
    // 00:30 on 1 September in Tunis.
    expect(codes(await list('from=2026-09-01&to=2026-09-01'))).toContain(p.code);
    expect(codes(await list('from=2026-08-31&to=2026-08-31'))).not.toContain(p.code);
  });

  it('refuses a bad filter with 400', async () => {
    expect((await list('status=PERDU')).status).toBe(400);
  });

  it('is open to Admin, Dépôt and Service client, never to a seller (D-11)', async () => {
    expect((await list('', adminToken)).status).toBe(200);
    expect((await list('', scToken)).status).toBe(200);
    expect((await list('', (await login(t, yasmine)).accessToken)).status).toBe(403);
  });
});

describe('GET /colis/filters', () => {
  it('gives the zones, the sellers and the livreurs to filter by', async () => {
    const response = await t.request('GET', '/colis/filters', { token: scToken });
    expect(response.status).toBe(200);
    expect(response.body.zones).toContainEqual({ id: marsaZone, name: expect.any(String) });
    expect(response.body.sellers).toEqual(
      expect.arrayContaining([
        { id: yasmine.sellerId, shopName: 'Boutique Yasmine' },
        { id: chic.sellerId, shopName: 'Chic Tunis' },
      ]),
    );
    expect(response.body.livreurs).toContainEqual({
      id: ali.id,
      firstName: 'Ali',
      lastName: 'Ben Salah',
    });
  });
});

describe('GET /colis/export (Admin 4.3)', () => {
  it('exports the filtered parcels as CSV, with the seller, zone and courier', async () => {
    const p = await parcel({
      seller: chic,
      extra: { recipientName: 'Export Test', address: '9 rue du Lac' },
    });
    const response = await t.request('GET', `/colis/export?q=${p.code}`, { token: scToken });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    const text = String(response.body).replace(/^﻿/, '');
    const [header, line] = text.trim().split('\r\n');
    expect(header).toBe(
      'Code;Date;Vendeur;Destinataire;Téléphone;Téléphone 2;Adresse;Localité;Délégation;Zone;Statut;Lieu;Paiement;Montant COD (DT);Livreur',
    );
    expect(line).toContain(p.code);
    expect(line).toContain('Chic Tunis');
    expect(line).toContain('9 rue du Lac');
    expect(line).toContain('85,000');
  });
});

describe('GET /colis/:code (Admin 4.3)', () => {
  it('gives the parcel, its money, the courier’s reason and the whole event log', async () => {
    const p = await parcel({
      status: 'A_VERIFIER',
      location: 'AVEC_LE_LIVREUR',
      extra: {
        currentLivreurId: ali.courierId!,
        attemptCount: 1,
        lastFailureReason: 'NE_REPOND_PAS',
        lastFailureNote: 'Sonné trois fois',
        landmark: 'Face à la mosquée',
      },
    });
    const scan = await t.prisma.scan.create({
      data: {
        clientScanId: randomUUID(),
        action: 'ECHEC',
        rawCode: p.code,
        parcelId: p.id,
        actorUserId: ali.id,
        source: 'SAISIE_MANUELLE',
        manualEntry: true,
        accepted: true,
        failureReason: 'NE_REPOND_PAS',
        parcelBefore: { status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR' },
        deviceTime: new Date('2026-09-25T08:00:00.000Z'),
        businessDate: new Date('2026-09-25T00:00:00.000Z'),
      },
    });
    await t.prisma.parcelEvent.create({
      data: {
        parcelId: p.id,
        type: 'ECHEC_LIVRAISON',
        previousStatus: 'EN_LIVRAISON',
        newStatus: 'A_VERIFIER',
        previousLocation: 'AVEC_LE_LIVREUR',
        newLocation: 'AVEC_LE_LIVREUR',
        actorUserId: ali.id,
        actorRole: 'LIVREUR',
        source: 'SAISIE_MANUELLE',
        scanId: scan.id,
        reasonCode: 'NE_REPOND_PAS',
        reasonText: 'Sonné trois fois',
        gpsLat: 36.8765,
        gpsLng: 10.3245,
        gpsAccuracyM: 12,
        deviceTime: new Date('2026-09-25T08:00:00.000Z'),
      },
    });

    const response = await t.request('GET', `/colis/${p.code.toLowerCase()}`, { token: scToken });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: p.code,
      seller: { id: yasmine.sellerId, shopName: 'Boutique Yasmine', contactPhone: yasmine.phone },
      recipientName: 'Client',
      recipientPhone: '29876543',
      address: 'Rue de Test',
      landmark: 'Face à la mosquée',
      delegationNameFr: 'La Marsa',
      zoneName: expect.any(String),
      status: 'A_VERIFIER',
      location: 'AVEC_LE_LIVREUR',
      attemptCount: 1,
      lastFailureReason: 'NE_REPOND_PAS',
      lastFailureNote: 'Sonné trois fois',
      currentLivreur: { id: ali.id, firstName: 'Ali', lastName: 'Ben Salah' },
      money: {
        codAmountMillimes: '85000',
        deliveryFeeMillimes: '7000',
        returnFeeMillimes: '5000',
        changeClientFeeMillimes: '1000',
        courierRateMillimes: null,
        cashStatus: null,
        bonNumber: null,
        charges: [],
      },
    });
    const failure = response.body.events.find(
      (e: { type: string }) => e.type === 'ECHEC_LIVRAISON',
    );
    expect(failure).toMatchObject({
      actor: { name: 'Ali Ben Salah', role: 'LIVREUR' },
      source: 'SAISIE_MANUELLE',
      previousStatus: 'EN_LIVRAISON',
      newStatus: 'A_VERIFIER',
      reasonCode: 'NE_REPOND_PAS',
      reasonText: 'Sonné trois fois',
      gps: { lat: 36.8765, lng: 10.3245, accuracyM: 12 },
      deviceTime: '2026-09-25T08:00:00.000Z',
      scan: { manualEntry: true, cancelled: false, clockSkewFlagged: false },
    });
    // The fixture's first event, written by the seller's account.
    expect(response.body.events[0]).toMatchObject({ actor: { role: null } });
  });

  it('names who planned a parcel for whom in the log (D-55)', async () => {
    const p = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT' });
    await t.prisma.$transaction(async (tx) => {
      await tx.parcelEvent.create({
        data: {
          parcelId: p.id,
          type: 'AFFECTATION_LIVREUR',
          previousStatus: 'AU_DEPOT',
          newStatus: 'AU_DEPOT',
          previousLocation: 'AU_DEPOT',
          newLocation: 'AU_DEPOT',
          actorUserId: depot.id,
          actorRole: 'DEPOT',
          metadata: { livreurPrevu: ali.courierId },
        },
      });
    });
    const response = await t.request('GET', `/colis/${p.code}`, { token: depotToken });
    const move = response.body.events.find(
      (e: { type: string }) => e.type === 'AFFECTATION_LIVREUR',
    );
    expect(move).toMatchObject({
      actor: { name: 'Prénom Nom', role: 'DEPOT' },
      plannedFor: 'Ali Ben Salah',
    });
  });

  it('answers 404 for an unknown code, and is closed to sellers', async () => {
    expect((await t.request('GET', '/colis/FG-ZZZZZZZZ', { token: depotToken })).status).toBe(404);
    const p = await parcel({});
    const asSeller = await t.request('GET', `/colis/${p.code}`, {
      token: (await login(t, yasmine)).accessToken,
    });
    expect(asSeller.status).toBe(403);
  });
});

describe('Réimprimer l’étiquette (A-9)', () => {
  it('prints any seller’s parcel with the same code, for the admin and the depot', async () => {
    const p = await parcel({ seller: chic, status: 'AU_DEPOT', location: 'AU_DEPOT' });
    for (const token of [depotToken, adminToken]) {
      const response = await t.request('GET', `/colis/${p.code}/label?format=THERMAL`, { token });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('is not the service client’s (D-11)', async () => {
    const p = await parcel({});
    const response = await t.request('GET', `/colis/${p.code}/label?format=A4`, { token: scToken });
    expect(response.status).toBe(403);
  });

  it('answers 404 for an unknown code', async () => {
    const response = await t.request('GET', '/colis/FG-ZZZZZZZZ/label?format=A4', {
      token: depotToken,
    });
    expect(response.status).toBe(404);
  });
});
