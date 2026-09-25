import {
  CANCELLATION_AFTER_PICKUP,
  FailureReason,
  ParcelAction,
  RelaunchSlot,
  SettingKey,
  SYSTEM_ACTOR,
  type CreateParcelValues,
} from '@faffago/shared';
import {
  ParcelEventService,
  type ParcelActionRequest,
  type ParcelActor,
  type ParcelEventContext,
} from '../../src/parcels/parcel-event.service';
import { ParcelsService } from '../../src/parcels/parcels.service';
import { principalOf } from '../support/principals';
import { createTestApp, createUser, type Fixture, type TestApp } from '../support/test-app';
import { place } from '../support/work-fixtures';

/**
 * The parcel event service: the one door through which a parcel moves
 * (CLAUDE.md). Each action runs the shared state machine and writes, in one
 * transaction, the parcel, its events and the charges it owes. The callers —
 * scans, seller decisions, the 48-hour job — come in later phases; here the
 * service is driven directly.
 */

let t: TestApp;
let events: ParcelEventService;
let parcels: ParcelsService;
let admin: Fixture;
let depot: Fixture;
let serviceClient: Fixture;
let seller: Fixture;
let otherSeller: Fixture;
let livreur: Fixture;
let otherLivreur: Fixture;
let ramasseur: Fixture;
let localiteId: string;

const META = { ip: '127.0.0.1', userAgent: 'jest' };

beforeAll(async () => {
  t = await createTestApp();
  events = t.app.get(ParcelEventService);
  parcels = t.app.get(ParcelsService);
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.events' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'depot.events' });
  serviceClient = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'sc.events' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'a@events.tn' });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'b@events.tn' });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
  otherLivreur = await createUser(t.prisma, { role: 'LIVREUR' });
  ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
  localiteId = (await place(t.prisma)).localiteId;

  await setting(SettingKey.DELIVERY_FEE_MILLIMES, '5500');
  await setting(SettingKey.RETURN_FEE_MILLIMES, '2000');
  await setting(SettingKey.CHANGE_CLIENT_FEE_MILLIMES, '1000');
  await setting(SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES, '3500');
});

afterAll(async () => {
  await t.close();
});

// ── Helpers ─────────────────────────────────────────────────

async function setting(key: SettingKey, value: unknown): Promise<void> {
  await t.settings.update(principalOf(admin), key, value, META);
}

async function newParcel(overrides: Partial<CreateParcelValues> = {}): Promise<string> {
  const parcel = await parcels.create(principalOf(seller), {
    recipientName: 'Client',
    recipientPhone: '29876543',
    localiteId,
    address: 'Rue de Test',
    productDescription: 'Article',
    pieceCount: 1,
    codAmountMillimes: 85000n,
    isExchange: false,
    openingAllowed: false,
    ...overrides,
  });
  return parcel.id;
}

function act(
  parcelId: string,
  who: Fixture | typeof SYSTEM_ACTOR,
  request: ParcelActionRequest,
  context: ParcelEventContext = {},
) {
  const actor: ParcelActor = who === SYSTEM_ACTOR ? SYSTEM_ACTOR : principalOf(who);
  return events.run({ parcelId, actor, request, context });
}

async function ok(...args: Parameters<typeof act>) {
  const result = await act(...args);
  if (!result.ok) throw new Error(`Refusé : ${result.message}`);
  return result;
}

/** Créé → Ramassé → Au dépôt → En livraison, with this livreur. */
async function outForDelivery(parcelId: string, courier: Fixture = livreur): Promise<void> {
  await ok(parcelId, ramasseur, { action: ParcelAction.SCAN_RAMASSAGE });
  await ok(parcelId, depot, { action: ParcelAction.SCAN_ENTREE_DEPOT });
  await ok(parcelId, depot, {
    action: ParcelAction.SCAN_SORTIE_COURSIER,
    assignToCourierId: courier.courierId!,
  });
}

async function fail(parcelId: string, reason: FailureReason = FailureReason.NE_REPOND_PAS) {
  return ok(parcelId, livreur, { action: ParcelAction.SCAN_ECHEC, failureReason: reason });
}

async function snapshotOf(parcelId: string) {
  const [parcel, eventRows, charges] = await Promise.all([
    t.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } }),
    t.prisma.parcelEvent.findMany({ where: { parcelId }, orderBy: { serverTime: 'asc' } }),
    t.prisma.sellerCharge.findMany({ where: { parcelId } }),
  ]);
  return { parcel, events: eventRows, charges };
}

// ── The flow ────────────────────────────────────────────────

describe('Créé to Livré (Vendeur 4.8)', () => {
  it('records every step with who, when, and previous → new', async () => {
    const id = await newParcel();

    t.clock.advance(3600);
    await ok(id, ramasseur, { action: ParcelAction.SCAN_RAMASSAGE });
    const picked = await snapshotOf(id);
    expect(picked.parcel).toMatchObject({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    expect(picked.parcel.pickedUpAt).toEqual(t.clock.now());
    expect(picked.events.at(-1)).toMatchObject({
      type: 'RAMASSAGE',
      previousStatus: 'CREE',
      newStatus: 'RAMASSE',
      previousLocation: 'CHEZ_LE_VENDEUR',
      newLocation: 'AVEC_LE_RAMASSEUR',
      actorUserId: ramasseur.id,
      actorRole: 'RAMASSEUR',
      serverTime: t.clock.now(),
    });

    await ok(id, depot, { action: ParcelAction.SCAN_ENTREE_DEPOT }, { source: 'WEB_DOUCHETTE' });
    await ok(id, depot, {
      action: ParcelAction.SCAN_SORTIE_COURSIER,
      assignToCourierId: livreur.courierId!,
    });
    expect((await snapshotOf(id)).parcel).toMatchObject({
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: livreur.courierId,
    });

    const deviceTime = new Date(t.clock.now().getTime() - 30_000);
    await ok(
      id,
      livreur,
      { action: ParcelAction.SCAN_LIVRE },
      {
        source: 'APP_COURSIER',
        gps: { lat: 36.8065, lng: 10.1815, accuracyM: 12 },
        deviceId: 'android-123',
        appVersion: '1.0.0',
        deviceTime,
      },
    );

    const delivered = await snapshotOf(id);
    expect(delivered.parcel).toMatchObject({
      status: 'LIVRE',
      location: 'CHEZ_LE_CLIENT',
      cashStatus: 'CHEZ_LE_COURSIER',
      attemptCount: 1,
    });
    expect(delivered.parcel.deliveredAt).toEqual(t.clock.now());
    expect(delivered.parcel.closedAt).toBeNull();

    const last = delivered.events.at(-1)!;
    expect(last).toMatchObject({
      type: 'LIVRAISON',
      actorUserId: livreur.id,
      actorRole: 'LIVREUR',
      source: 'APP_COURSIER',
      gpsAccuracyM: 12,
      deviceId: 'android-123',
      appVersion: '1.0.0',
      deviceTime,
    });
    expect(last.gpsLat?.toString()).toBe('36.8065');
    expect(last.gpsLng?.toString()).toBe('10.1815');

    expect(delivered.events.map((event) => event.type)).toEqual([
      'CREATION',
      'RAMASSAGE',
      'ENTREE_DEPOT',
      'SORTIE_COURSIER',
      'LIVRAISON',
    ]);
  });

  it('refuses a step out of order with the reason, and writes nothing', async () => {
    const id = await newParcel();
    const before = await snapshotOf(id);

    const result = await act(id, livreur, { action: ParcelAction.SCAN_LIVRE });

    expect(result).toEqual({ ok: false, refusal: 'MAUVAIS_MODE', message: 'Mauvais mode' });
    expect(await snapshotOf(id)).toEqual(before);
  });
});

// ── Money ───────────────────────────────────────────────────

describe('the charges each transition owes (A-1, D-2)', () => {
  it('charges the delivery fee frozen on the parcel, not the fee in Paramètres today', async () => {
    const id = await newParcel();
    await setting(SettingKey.DELIVERY_FEE_MILLIMES, '9000');
    try {
      await outForDelivery(id);
      await ok(id, livreur, { action: ParcelAction.SCAN_LIVRE });
    } finally {
      await setting(SettingKey.DELIVERY_FEE_MILLIMES, '5500');
    }

    const { charges } = await snapshotOf(id);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      sellerId: seller.sellerId,
      type: 'LIVRAISON',
      amountMillimes: 5500n,
      status: 'EN_ATTENTE',
      createdByUserId: livreur.id,
    });
  });

  it('freezes the livreur rate in Paramètres at the moment of delivery (A-15)', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await setting(SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES, '4000');
    try {
      await ok(id, livreur, { action: ParcelAction.SCAN_LIVRE });
    } finally {
      await setting(SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES, '3500');
    }
    expect((await snapshotOf(id)).parcel.courierRateMillimes).toBe(4000n);
  });

  it('records the old item of an échange, with no fee for it (D-23, A-10)', async () => {
    const id = await newParcel({ isExchange: true });
    await outForDelivery(id);
    await ok(id, livreur, { action: ParcelAction.SCAN_LIVRE });

    const { parcel, charges } = await snapshotOf(id);
    expect(parcel.exchangeItemCollected).toBe(true);
    expect(parcel.exchangeItemStatus).toBe('RETOUR_AU_DEPOT');
    expect(charges.map((charge) => charge.type)).toEqual(['LIVRAISON']);
  });

  it('charges nothing for a failure, and starts the 48-hour clock', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await ok(
      id,
      livreur,
      { action: ParcelAction.SCAN_ECHEC, failureReason: FailureReason.INJOIGNABLE },
      { note: 'Téléphone éteint' },
    );

    const { parcel, events: eventRows, charges } = await snapshotOf(id);
    expect(parcel).toMatchObject({
      status: 'A_VERIFIER',
      location: 'AVEC_LE_LIVREUR',
      lastFailureReason: 'INJOIGNABLE',
      lastFailureNote: 'Téléphone éteint',
    });
    expect(parcel.verifyDeadlineAt).toEqual(new Date(t.clock.now().getTime() + 48 * 3_600_000));
    expect(eventRows.at(-1)).toMatchObject({
      type: 'ECHEC_LIVRAISON',
      reasonCode: 'INJOIGNABLE',
      reasonText: 'Téléphone éteint',
    });
    expect(charges).toEqual([]);
  });

  it('on the third failure writes both events and exactly one return fee', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await fail(id);
      // The seller's Relancer carries its date (D-9); the clock reads 25 September.
      await ok(id, seller, {
        action: ParcelAction.DECISION_RELANCER,
        postponedTo: new Date('2026-09-26T00:00:00.000Z'),
      });
      await ok(id, depot, { action: ParcelAction.SCAN_RETOUR_DE_TOURNEE });
      await ok(id, depot, {
        action: ParcelAction.SCAN_SORTIE_COURSIER,
        assignToCourierId: livreur.courierId!,
      });
    }
    await fail(id, FailureReason.REFUSE);

    const { parcel, events: eventRows, charges } = await snapshotOf(id);
    expect(parcel).toMatchObject({ status: 'RETOUR_AU_DEPOT', attemptCount: 3 });
    expect(eventRows.slice(-2).map((event) => event.type)).toEqual([
      'ECHEC_LIVRAISON',
      'RETOUR_AUTO_3E_TENTATIVE',
    ]);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ type: 'RETOUR', amountMillimes: 2000n });
  });

  it('records a customer postponement with its date, and starts no clock (D-9)', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    // The test clock reads 25 September; the customer asks for the 27th.
    const postponedTo = new Date('2026-09-27T00:00:00.000Z');
    await ok(id, livreur, {
      action: ParcelAction.SCAN_ECHEC,
      failureReason: FailureReason.REPORTE_PAR_LE_CLIENT,
      postponedTo,
      relaunchSlot: RelaunchSlot.APRES_MIDI,
    });

    const { parcel, events: eventRows } = await snapshotOf(id);
    expect(parcel).toMatchObject({
      status: 'RELANCE',
      relaunchOrigin: 'CLIENT',
      relaunchSlot: 'APRES_MIDI',
      verifyDeadlineAt: null,
    });
    expect(parcel.relaunchDate).toEqual(postponedTo);
    expect(eventRows.at(-1)?.metadata).toEqual({
      relaunchDate: '2026-09-27',
      relaunchSlot: 'APRES_MIDI',
    });
  });

  it('the 48-hour job acts as the system, with no user on the event', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await fail(id);
    await ok(id, SYSTEM_ACTOR, { action: ParcelAction.AUTO_RETOUR_48H });

    const { parcel, events: eventRows, charges } = await snapshotOf(id);
    expect(parcel).toMatchObject({ status: 'RETOUR_AU_DEPOT', verifyDeadlineAt: null });
    expect(eventRows.at(-1)).toMatchObject({
      type: 'RETOUR_AUTO_48H',
      actorUserId: null,
      actorRole: null,
    });
    expect(charges).toEqual([
      expect.objectContaining({ type: 'RETOUR', amountMillimes: 2000n, createdByUserId: null }),
    ]);
  });
});

// ── Relancer ────────────────────────────────────────────────

describe('Relancer (D-9, D-29)', () => {
  it('without a date is a clean refusal, not a database error, and writes nothing', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await fail(id);
    const before = await snapshotOf(id);

    const result = await act(id, seller, { action: ParcelAction.DECISION_RELANCER });

    expect(result).toEqual({
      ok: false,
      refusal: 'DATE_RELANCE_REQUISE',
      message: 'Choisissez le jour de la nouvelle tentative de livraison',
    });
    expect(await snapshotOf(id)).toEqual(before);
  });
});

// ── Cancelling ──────────────────────────────────────────────

describe('Annuler (Vendeur 4.6, D-28)', () => {
  it('before pickup: cancelled and closed, no fee', async () => {
    const id = await newParcel();
    await ok(id, seller, { action: ParcelAction.ANNULER });

    const { parcel, events: eventRows, charges } = await snapshotOf(id);
    expect(parcel).toMatchObject({ status: 'ANNULE' });
    expect(parcel.cancelledAt).toEqual(t.clock.now());
    expect(parcel.closedAt).toEqual(t.clock.now());
    expect(eventRows.at(-1)?.metadata).toBeNull();
    expect(charges).toEqual([]);
  });

  it('while the livreur carries it: a return, the fee charged, the parcel left with him', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await ok(id, seller, { action: ParcelAction.ANNULER });

    const { parcel, events: eventRows, charges } = await snapshotOf(id);
    expect(parcel).toMatchObject({ status: 'RETOUR_AU_DEPOT', location: 'AVEC_LE_LIVREUR' });
    expect(parcel.cancelledAt).toEqual(t.clock.now());
    expect(parcel.closedAt).toBeNull();
    expect(eventRows.at(-1)).toMatchObject({
      type: 'ANNULATION',
      previousStatus: 'EN_LIVRAISON',
      newStatus: 'RETOUR_AU_DEPOT',
      metadata: { annulation: CANCELLATION_AFTER_PICKUP },
    });
    expect(charges).toEqual([
      expect.objectContaining({ type: 'RETOUR', amountMillimes: 2000n, status: 'EN_ATTENTE' }),
    ]);
  });

  it('from À vérifier: stops the 48-hour clock', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await fail(id);
    await ok(id, seller, { action: ParcelAction.ANNULER });
    expect((await snapshotOf(id)).parcel.verifyDeadlineAt).toBeNull();
  });

  it('is refused once delivered, and writes nothing', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await ok(id, livreur, { action: ParcelAction.SCAN_LIVRE });
    const before = await snapshotOf(id);

    const result = await act(id, seller, { action: ParcelAction.ANNULER });
    expect(result).toMatchObject({ ok: false, refusal: 'COLIS_DEJA_LIVRE' });
    expect(await snapshotOf(id)).toEqual(before);
  });
});

// ── Permissions ─────────────────────────────────────────────

describe('who may act', () => {
  it('answers another seller as if the parcel did not exist (D-26)', async () => {
    const id = await newParcel();
    const before = await snapshotOf(id);

    const theirs = await act(id, otherSeller, { action: ParcelAction.ANNULER });
    const unknown = await act('00000000-0000-4000-8000-000000000000', otherSeller, {
      action: ParcelAction.ANNULER,
    });

    expect(theirs).toEqual({ ok: false, refusal: 'CODE_INCONNU', message: 'Code inconnu' });
    expect(unknown).toEqual(theirs);
    expect(await snapshotOf(id)).toEqual(before);
  });

  it('never lets the team take a seller decision (D-4)', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    await fail(id);
    for (const staff of [admin, depot, serviceClient]) {
      for (const action of [
        ParcelAction.ANNULER,
        ParcelAction.DECISION_RELANCER,
        ParcelAction.DECISION_RETOURNER,
      ]) {
        const result = await act(id, staff, { action });
        expect(result).toMatchObject({ ok: false, refusal: 'ROLE_NON_AUTORISE' });
      }
    }
    expect((await snapshotOf(id)).parcel.status).toBe('A_VERIFIER');
  });

  it('refuses a livreur another livreur’s parcel', async () => {
    const id = await newParcel();
    await outForDelivery(id, livreur);
    const result = await act(id, otherLivreur, { action: ParcelAction.SCAN_LIVRE });
    expect(result).toMatchObject({ ok: false, refusal: 'COLIS_AUTRE_COURSIER' });
  });

  it('keeps the system to the 48-hour return', async () => {
    const id = await newParcel();
    const result = await act(id, SYSTEM_ACTOR, { action: ParcelAction.ANNULER });
    expect(result).toMatchObject({ ok: false, refusal: 'ROLE_NON_AUTORISE' });
  });

  it('lets a suspended seller still cancel and decide (D-25)', async () => {
    const id = await newParcel();
    const other = await newParcel();
    await outForDelivery(other);
    await fail(other);
    await t.prisma.seller.update({
      where: { id: seller.sellerId! },
      data: { accountState: 'SUSPENDU' },
    });
    try {
      await ok(id, seller, { action: ParcelAction.ANNULER });
      await ok(other, seller, { action: ParcelAction.DECISION_RETOURNER });
    } finally {
      await t.prisma.seller.update({
        where: { id: seller.sellerId! },
        data: { accountState: 'ACTIF' },
      });
    }
  });
});

// ── Atomicity ───────────────────────────────────────────────

describe('one transaction', () => {
  it('rolls back the parcel and the charge when an event cannot be written', async () => {
    const id = await newParcel();
    await outForDelivery(id);
    const before = await snapshotOf(id);

    // Decimal(9,6) cannot hold 1000: the event insert fails after the parcel
    // row has been written.
    await expect(
      act(id, livreur, { action: ParcelAction.SCAN_LIVRE }, { gps: { lat: 1000, lng: 10 } }),
    ).rejects.toThrow();

    expect(await snapshotOf(id)).toEqual(before);
  });

  it('is the only way to move a parcel: a bare update is refused (D-21)', async () => {
    const id = await newParcel();
    await expect(
      t.prisma.parcel.update({ where: { id }, data: { status: 'ANNULE' } }),
    ).rejects.toThrow(/sans événement/);
    expect((await snapshotOf(id)).parcel.status).toBe('CREE');
  });

  it('composes with the caller’s own transaction', async () => {
    const id = await newParcel();
    await expect(
      t.prisma.$transaction(async (tx) => {
        const result = await events.apply(tx, {
          parcelId: id,
          actor: principalOf(ramasseur),
          request: { action: ParcelAction.SCAN_RAMASSAGE },
        });
        expect(result.ok).toBe(true);
        throw new Error('the caller changes its mind');
      }),
    ).rejects.toThrow(/changes its mind/);
    expect((await snapshotOf(id)).parcel.status).toBe('CREE');
  });
});
