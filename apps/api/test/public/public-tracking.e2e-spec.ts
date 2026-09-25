import { PUBLIC_TRACKING_THROTTLE } from '@faffago/shared';
import { PublicTrackingThrottleService } from '../../src/public/public-tracking-throttle.service';
import { createTestApp, createUser, type Fixture, type TestApp } from '../support/test-app';
import { createParcel, place } from '../support/work-fixtures';

/**
 * Public tracking (Landing 4): the customer sees where his parcel is, and
 * nothing else. Q1–Q3 (amount, shop, délégation, changement de client),
 * D-9 (a postponement shows its date), D-31 (a cancelled order ends at
 * "Commande annulée", the return trip hidden), D-54 (a cancelled scan's event
 * never appears), Landing 4.4 (rate limiting).
 */

let t: TestApp;
let seller: Fixture;
let livreur: Fixture;

async function code(parcelId: string): Promise<string> {
  const parcel = await t.prisma.parcel.findUniqueOrThrow({
    where: { id: parcelId },
    select: { code: true },
  });
  return parcel.code;
}

function track(parcelCode: string, query = '') {
  return t.request('GET', `/public/tracking/${parcelCode}${query}`);
}

beforeAll(async () => {
  t = await createTestApp();
  await place(t.prisma);
  seller = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'suivi@boutique.tn',
    shopName: 'Boutique Suivi',
  });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.app.get(PublicTrackingThrottleService).clear();
});

describe('an unknown code', () => {
  it('reads "Aucun colis trouvé", never confirming or denying the code exists (Landing 4.4)', async () => {
    const response = await track('FG-00000000');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'CODE_INCONNU',
      message: 'Aucun colis trouvé avec ce code. Vérifiez le code sur l’étiquette.',
    });
  });

  it('reads a code typed without the prefix or in lower case the same way (labels.ts)', async () => {
    const id = await createParcel(t.prisma, { sellerId: seller.sellerId!, createdByUserId: seller.id });
    const parcelCode = await code(id);
    const response = await track(parcelCode.replace('FG-', '').toLowerCase());
    expect(response.status).toBe(200);
    expect(response.body.code).toBe(parcelCode);
  });
});

describe('what the customer sees, and never sees (Landing 4.1, 4.3)', () => {
  it('gives only the public fields: amount, shop, délégation, status, never the customer or an internal note', async () => {
    const id = await createParcel(t.prisma, { sellerId: seller.sellerId!, createdByUserId: seller.id });
    const parcelCode = await code(id);
    const response = await track(parcelCode);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: parcelCode,
      status: 'COMMANDE_ENREGISTREE',
      shopName: 'Boutique Suivi',
      codAmountMillimes: '85000',
    });
    expect(response.body.delegationName).toBeTruthy();
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('Client');
    expect(text).not.toContain('29876543');
    expect(text).not.toContain('Rue de Test');
  });

  it('names the livreur by first name only while the parcel is out for delivery', async () => {
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: livreur.courierId,
    });
    const response = await track(await code(id));
    expect(response.body.status).toBe('EN_COURS_DE_LIVRAISON');
    expect(response.body.livreurFirstName).toBe('Prénom');
  });

  it('resolves the délégation name in Arabic when asked (Q4)', async () => {
    const id = await createParcel(t.prisma, { sellerId: seller.sellerId!, createdByUserId: seller.id });
    const response = await track(await code(id), '?langue=AR');
    expect(response.body.delegationName).toBe('باردو');
  });
});

describe('a customer postponement (D-9)', () => {
  it('shows the date he chose, since he asked for it himself', async () => {
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'RELANCE',
      location: 'AU_DEPOT',
      extra: { relaunchOrigin: 'CLIENT', relaunchDate: new Date('2026-10-01T00:00:00.000Z') },
    });
    const response = await track(await code(id));
    expect(response.body.status).toBe('LIVRAISON_REPORTEE_CLIENT');
    expect(response.body.postponedTo).toBe('2026-10-01');
  });

  it('never shows a date for a relance the seller himself decided', async () => {
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'RELANCE',
      location: 'AU_DEPOT',
      extra: { relaunchOrigin: 'VENDEUR', relaunchDate: new Date('2026-10-01T00:00:00.000Z') },
    });
    const response = await track(await code(id));
    expect(response.body.status).toBe('LIVRAISON_REPORTEE');
    expect(response.body.postponedTo).toBeNull();
  });
});

describe('a cancelled order (D-28, D-31)', () => {
  it('ends at "Commande annulée" while it still travels back, and hides the return trip', async () => {
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'RETOUR_AU_DEPOT',
      extra: { cancelledAt: new Date('2026-09-25T09:00:00.000Z') },
    });
    await t.prisma.parcelEvent.createMany({
      data: [
        { parcelId: id, type: 'DEPART_RETOUR', serverTime: new Date('2026-09-25T10:00:00.000Z') },
        { parcelId: id, type: 'RETOUR_RECU', serverTime: new Date('2026-09-25T11:00:00.000Z') },
      ],
    });
    const response = await track(await code(id));
    expect(response.body.status).toBe('COMMANDE_ANNULEE');
    const types = response.body.timeline.map((e: { type: string }) => e.type);
    expect(types).not.toContain('DEPART_RETOUR');
    expect(types).not.toContain('RETOUR_RECU');
  });

  it('still shows the return trip of an ordinary return', async () => {
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'RETOUR_RECU',
    });
    await t.prisma.parcelEvent.createMany({
      data: [
        { parcelId: id, type: 'DEPART_RETOUR', serverTime: new Date('2026-09-25T10:00:00.000Z') },
        { parcelId: id, type: 'RETOUR_RECU', serverTime: new Date('2026-09-25T11:00:00.000Z') },
      ],
    });
    const response = await track(await code(id));
    expect(response.body.status).toBe('RETOURNE_AU_VENDEUR');
    const types = response.body.timeline.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['DEPART_RETOUR', 'RETOUR_RECU']));
  });
});

describe('a cancelled scan (D-54)', () => {
  it('never lets a cancelled Sortie coursier read "En cours de livraison"', async () => {
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'AU_DEPOT',
    });
    const scan = await t.prisma.scan.create({
      data: {
        clientScanId: crypto.randomUUID(),
        action: 'SORTIE_COURSIER',
        rawCode: 'FG-TEST',
        parcelId: id,
        actorUserId: livreur.id,
        source: 'WEB_DOUCHETTE',
        accepted: true,
        parcelBefore: { status: 'AU_DEPOT', location: 'AU_DEPOT' },
        deviceTime: new Date('2026-09-25T10:00:00.000Z'),
        businessDate: new Date('2026-09-25T00:00:00.000Z'),
        cancelledAt: new Date('2026-09-25T10:05:00.000Z'),
        cancelledByUserId: livreur.id,
      },
    });
    await t.prisma.parcelEvent.create({
      data: {
        parcelId: id,
        type: 'SORTIE_COURSIER',
        scanId: scan.id,
        serverTime: new Date('2026-09-25T10:00:00.000Z'),
      },
    });
    const response = await track(await code(id));
    expect(response.body.status).toBe('CHEZ_FAFFA_GO');
    const types = response.body.timeline.map((e: { type: string }) => e.type);
    expect(types).not.toContain('SORTIE_COURSIER');
  });
});

describe('rate limiting (Landing 4.4)', () => {
  it('slows down repeated wrong codes, and answers 429 with Retry-After', async () => {
    for (let i = 0; i <= PUBLIC_TRACKING_THROTTLE.freeFailuresPerIp; i++) {
      await track('FG-00000001');
    }
    const blocked = await track('FG-00000001');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('1');
    expect(blocked.body).toMatchObject({ code: 'TROP_DE_TENTATIVES', retryAfterSeconds: 1 });

    t.clock.advance(1);
    const after = await track('FG-00000001');
    expect(after.status).toBe(404);
  });

  it('lets a good lookup through without waiting', async () => {
    const id = await createParcel(t.prisma, { sellerId: seller.sellerId!, createdByUserId: seller.id });
    const response = await track(await code(id));
    expect(response.status).toBe(200);
  });
});
