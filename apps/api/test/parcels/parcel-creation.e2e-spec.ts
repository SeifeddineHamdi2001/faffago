import { isValidParcelCode, SettingKey, type CreateParcelValues } from '@faffago/shared';
import { ParcelCodeGenerator } from '../../src/parcels/parcel-code.generator';
import { ParcelsService } from '../../src/parcels/parcels.service';
import { principalOf } from '../support/principals';
import { createTestApp, createUser, type Fixture, type TestApp } from '../support/test-app';
import { place } from '../support/work-fixtures';

/**
 * Creating a parcel (Vendeur 4.2): fees frozen from Paramètres, the délégation
 * taken from the localité, and the CREATION event written in the same
 * transaction. The endpoint and its screen come in phase 4 (D-22); the
 * service is tested directly.
 */

let t: TestApp;
let parcels: ParcelsService;
let admin: Fixture;
let seller: Fixture;
let where: { delegationId: string; localiteId: string };

const META = { ip: '127.0.0.1', userAgent: 'jest' };

function input(overrides: Partial<CreateParcelValues> = {}): CreateParcelValues {
  return {
    recipientName: 'Amira Ben Salah',
    recipientPhone: '29876543',
    recipientPhone2: null,
    localiteId: where.localiteId,
    address: '12 rue de Marseille',
    landmark: 'En face de la pharmacie',
    productDescription: '2 bracelets',
    pieceCount: 2,
    codAmountMillimes: 85000n,
    isExchange: false,
    openingAllowed: true,
    courierNote: 'Sonner deux fois',
    ...overrides,
  };
}

async function setFee(key: SettingKey, millimes: string): Promise<void> {
  await t.settings.update(principalOf(admin), key, millimes, META);
}

beforeAll(async () => {
  t = await createTestApp();
  parcels = t.app.get(ParcelsService);
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.colis' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@colis.tn' });
  where = await place(t.prisma);
});

afterAll(async () => {
  await t.close();
});

describe('fees are frozen at creation (CLAUDE.md, Money)', () => {
  it('copies the fees in Paramètres onto the parcel', async () => {
    await setFee(SettingKey.DELIVERY_FEE_MILLIMES, '5500');
    await setFee(SettingKey.RETURN_FEE_MILLIMES, '2000');
    await setFee(SettingKey.CHANGE_CLIENT_FEE_MILLIMES, '1000');

    const parcel = await parcels.create(principalOf(seller), input());

    expect(parcel.deliveryFeeMillimes).toBe(5500n);
    expect(parcel.returnFeeMillimes).toBe(2000n);
    expect(parcel.changeClientFeeMillimes).toBe(1000n);
    // Paid at delivery, not at creation (A-15).
    expect(parcel.courierRateMillimes).toBeNull();
  });

  it('keeps them after a rate change, which only reaches new parcels', async () => {
    const before = await parcels.create(principalOf(seller), input());

    await setFee(SettingKey.DELIVERY_FEE_MILLIMES, '6500');
    await setFee(SettingKey.RETURN_FEE_MILLIMES, '3000');
    await setFee(SettingKey.CHANGE_CLIENT_FEE_MILLIMES, '1500');
    // The very next parcel sees the change: the settings cache is cleared on update.
    const after = await parcels.create(principalOf(seller), input());

    const reread = await t.prisma.parcel.findUniqueOrThrow({ where: { id: before.id } });
    expect(reread.deliveryFeeMillimes).toBe(5500n);
    expect(reread.returnFeeMillimes).toBe(2000n);
    expect(reread.changeClientFeeMillimes).toBe(1000n);

    expect(after.deliveryFeeMillimes).toBe(6500n);
    expect(after.returnFeeMillimes).toBe(3000n);
    expect(after.changeClientFeeMillimes).toBe(1500n);

    await setFee(SettingKey.DELIVERY_FEE_MILLIMES, '5500');
    await setFee(SettingKey.RETURN_FEE_MILLIMES, '2000');
    await setFee(SettingKey.CHANGE_CLIENT_FEE_MILLIMES, '1000');
  });
});

describe('what is stored', () => {
  it('stores the form as typed, the délégation taken from the localité', async () => {
    const parcel = await parcels.create(principalOf(seller), input());

    expect(isValidParcelCode(parcel.code)).toBe(true);
    expect(parcel).toMatchObject({
      sellerId: seller.sellerId,
      createdByUserId: seller.id,
      recipientName: 'Amira Ben Salah',
      recipientPhone: '29876543',
      localiteId: where.localiteId,
      delegationId: where.delegationId,
      address: '12 rue de Marseille',
      landmark: 'En face de la pharmacie',
      productDescription: '2 bracelets',
      pieceCount: 2,
      codAmountMillimes: 85000n,
      isExchange: false,
      openingAllowed: true,
      courierNote: 'Sonner deux fois',
      status: 'CREE',
      location: 'CHEZ_LE_VENDEUR',
      cashStatus: null,
      attemptCount: 0,
    });
  });

  it('accepts a COD of zero, for a parcel already paid (Vendeur 4.2)', async () => {
    const parcel = await parcels.create(principalOf(seller), input({ codAmountMillimes: 0n }));
    expect(parcel.codAmountMillimes).toBe(0n);
  });

  it('writes the CREATION event in the same transaction: who, when, nothing → Créé', async () => {
    const parcel = await parcels.create(principalOf(seller), input());
    const events = await t.prisma.parcelEvent.findMany({ where: { parcelId: parcel.id } });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'CREATION',
      previousStatus: null,
      newStatus: 'CREE',
      previousLocation: null,
      newLocation: 'CHEZ_LE_VENDEUR',
      actorUserId: seller.id,
      actorRole: 'VENDEUR',
      serverTime: t.clock.now(),
    });
  });

  it('draws another code when the first one is taken', async () => {
    const existing = await parcels.create(principalOf(seller), input());
    const generator = t.app.get(ParcelCodeGenerator);
    const spy = jest.spyOn(generator, 'next').mockReturnValueOnce(existing.code);
    try {
      const parcel = await parcels.create(principalOf(seller), input());
      expect(parcel.code).not.toBe(existing.code);
      expect(isValidParcelCode(parcel.code)).toBe(true);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('gives up with a clear error rather than looping forever', async () => {
    const existing = await parcels.create(principalOf(seller), input());
    const generator = t.app.get(ParcelCodeGenerator);
    const spy = jest.spyOn(generator, 'next').mockReturnValue(existing.code);
    const count = await t.prisma.parcel.count();
    try {
      await expect(parcels.create(principalOf(seller), input())).rejects.toMatchObject({
        response: { code: 'CODE_COLIS_INDISPONIBLE' },
      });
      expect(await t.prisma.parcel.count()).toBe(count);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('refusals', () => {
  it('refuses a suspended seller, who can still log in and read (Vendeur 2.5, D-25)', async () => {
    const suspended = await createUser(t.prisma, {
      role: 'VENDEUR',
      email: 'suspendu@colis.tn',
      sellerState: 'SUSPENDU',
    });
    await expect(parcels.create(principalOf(suspended), input())).rejects.toMatchObject({
      status: 403,
      response: { code: 'COMPTE_SUSPENDU' },
    });
    expect(await t.prisma.parcel.count({ where: { sellerId: suspended.sellerId! } })).toBe(0);
  });

  it('refuses a localité the admin has deactivated (D-27)', async () => {
    const closed = await t.prisma.localite.create({
      data: { delegationId: where.delegationId, nameFr: 'Cité Fermée', isActive: false },
    });
    const count = await t.prisma.parcel.count();
    await expect(
      parcels.create(principalOf(seller), input({ localiteId: closed.id })),
    ).rejects.toMatchObject({ status: 400, response: { code: 'LOCALITE_INACTIVE' } });
    expect(await t.prisma.parcel.count()).toBe(count);
  });

  it('leaves existing parcels on a localité deactivated later (D-27)', async () => {
    const soon = await t.prisma.localite.create({
      data: { delegationId: where.delegationId, nameFr: 'Cité Bientôt Fermée' },
    });
    const parcel = await parcels.create(principalOf(seller), input({ localiteId: soon.id }));
    await t.prisma.localite.update({ where: { id: soon.id }, data: { isActive: false } });

    const reread = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
    expect(reread.localiteId).toBe(soon.id);
  });

  it('refuses an unknown localité', async () => {
    await expect(
      parcels.create(
        principalOf(seller),
        input({ localiteId: '00000000-0000-4000-8000-000000000000' }),
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: 'LOCALITE_INTROUVABLE' } });
  });

  it.each(['ADMIN', 'DEPOT', 'SERVICE_CLIENT', 'LIVREUR', 'RAMASSEUR'] as const)(
    'refuses a %s: only a seller creates his parcels',
    async (role) => {
      const user = await createUser(t.prisma, {
        role,
        username: ['ADMIN', 'DEPOT', 'SERVICE_CLIENT'].includes(role)
          ? `staff.${role.toLowerCase().replace('_', '')}`
          : undefined,
      });
      await expect(parcels.create(principalOf(user), input())).rejects.toMatchObject({
        status: 403,
      });
    },
  );
});
