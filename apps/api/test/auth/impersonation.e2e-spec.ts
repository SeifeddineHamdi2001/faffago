import { Controller, Get, Post } from '@nestjs/common';
import { Permission } from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../../src/auth/decorators';
import { ImpersonationService } from '../../src/auth/impersonation.service';
import { sellerIdOf, type Principal } from '../../src/auth/principal';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';

/**
 * Voir comme le vendeur (D-5): admin only, read-only, 30 minutes, no refresh,
 * start and end audited.
 */

@Controller('test-espace-vendeur')
class SellerSpaceProbeController {
  @Get('colis')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  colis(@CurrentPrincipal() principal: Principal): { sellerId: string } {
    return { sellerId: sellerIdOf(principal) };
  }

  /** A seller write, as "Créer un colis" will be. */
  @Post('colis')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  creerColis(): string {
    return 'créé';
  }

  /** A seller read that has not opted in to impersonation. */
  @Get('prive')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  prive(): string {
    return 'ok';
  }
}

let t: TestApp;
let seller: Fixture;
let n = 0;

beforeAll(async () => {
  t = await createTestApp([SellerSpaceProbeController]);
  seller = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'imp.vendeur@mail.tn',
    shopName: 'Bijoux Sidi Bou',
  });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

async function start(adminToken: string, sellerId = seller.sellerId!) {
  return t.request('POST', '/auth/impersonation', { token: adminToken, body: { sellerId } });
}

async function freshAdmin(): Promise<{ user: Fixture; token: string; refreshToken: string }> {
  n += 1;
  const user = await createUser(t.prisma, { role: 'ADMIN', username: `imp.admin${n}` });
  const tokens = await login(t, user);
  return { user, token: tokens.accessToken, refreshToken: tokens.refreshToken };
}

describe('starting', () => {
  it('is for the admin only', async () => {
    for (const role of ['DEPOT', 'SERVICE_CLIENT'] as const) {
      n += 1;
      const staff = await createUser(t.prisma, { role, username: `imp.staff${n}` });
      const { accessToken } = await login(t, staff);
      expect((await start(accessToken)).status).toBe(403);
    }
    const other = await createUser(t.prisma, { role: 'VENDEUR', email: 'imp.autre@mail.tn' });
    const { accessToken } = await login(t, other);
    expect((await start(accessToken)).status).toBe(403);
  });

  it('gives a 30-minute token and the banner text', async () => {
    const { token } = await freshAdmin();
    const response = await start(token);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      impersonationToken: expect.any(String),
      shopName: 'Bijoux Sidi Bou',
      banner: 'Vous consultez le compte de Bijoux Sidi Bou',
    });
    expect(response.body.refreshToken).toBeUndefined();
    expect(Date.parse(response.body.expiresAt) - t.clock.now().getTime()).toBe(30 * 60 * 1000);
  });

  it('audits the start: admin, seller, time', async () => {
    const { user, token } = await freshAdmin();
    const response = await start(token);
    const entry = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'VOIR_COMME_VENDEUR_DEBUT', actorUserId: user.id },
    });
    expect(entry).toMatchObject({
      actorRole: 'ADMIN',
      entityType: 'seller',
      entityId: seller.sellerId,
      createdAt: t.clock.now(),
    });
    expect(entry.after).toMatchObject({ impersonationId: response.body.impersonationId });
  });

  it('answers 404 for an unknown seller', async () => {
    const { token } = await freshAdmin();
    expect((await start(token, '00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('while impersonating', () => {
  it('shows exactly the seller data, scoped to that seller', async () => {
    const { token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;

    const colis = await t.request('GET', '/test-espace-vendeur/colis', {
      token: impersonationToken,
    });
    expect(colis.status).toBe(200);
    expect(colis.body).toEqual({ sellerId: seller.sellerId });

    const me = await t.request('GET', '/auth/me', { token: impersonationToken });
    expect(me.body).toMatchObject({
      role: 'VENDEUR',
      readOnly: true,
      permissions: ['ESPACE_VENDEUR'],
      seller: { id: seller.sellerId, shopName: 'Bijoux Sidi Bou' },
      impersonation: { banner: 'Vous consultez le compte de Bijoux Sidi Bou' },
    });
  });

  it('refuses every write, even on a seller route', async () => {
    const { token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;
    const response = await t.request('POST', '/test-espace-vendeur/colis', {
      token: impersonationToken,
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'LECTURE_SEULE',
      message: 'Consultation en lecture seule : aucune action possible.',
    });
  });

  it('refuses admin routes: the token is the seller view, not the admin', async () => {
    const { token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;
    const response = await t.request('POST', '/accounts/staff', {
      token: impersonationToken,
      body: { role: 'ADMIN', username: 'intrus', firstName: 'I', lastName: 'I', phone: '20999999' },
    });
    expect(response.status).toBe(403);
  });

  it('refuses a seller route that has not opted in', async () => {
    const { token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;
    const response = await t.request('GET', '/test-espace-vendeur/prive', {
      token: impersonationToken,
    });
    expect(response.status).toBe(403);
  });

  it('cannot be refreshed or chained into another impersonation', async () => {
    const { token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;
    expect(
      (await t.request('POST', '/auth/refresh', { body: { refreshToken: impersonationToken } }))
        .status,
    ).toBe(401);
    expect((await start(impersonationToken)).status).toBe(403);
  });
});

describe('ending', () => {
  it('ends on the exit button, kills the token, and audits the end', async () => {
    const { user, token } = await freshAdmin();
    const { impersonationToken, impersonationId } = (await start(token)).body;

    t.clock.advance(5 * 60);
    const exit = await t.request('DELETE', '/auth/impersonation', { token: impersonationToken });
    expect(exit.status).toBe(204);

    expect(
      (await t.request('GET', '/test-espace-vendeur/colis', { token: impersonationToken })).status,
    ).toBe(401);

    const entry = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'VOIR_COMME_VENDEUR_FIN', actorUserId: user.id },
    });
    expect(entry).toMatchObject({ entityId: seller.sellerId, reason: 'SORTIE' });
    expect(entry.after).toMatchObject({ impersonationId });

    // The admin's own session is untouched.
    expect((await t.request('GET', '/auth/me', { token })).status).toBe(200);
  });

  it('stops working after 30 minutes and audits the end once, when it expires', async () => {
    const { user, token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;

    t.clock.advance(30 * 60 + 1);
    expect(
      (await t.request('GET', '/test-espace-vendeur/colis', { token: impersonationToken })).status,
    ).toBe(401);

    const jobs = t.app.get(ImpersonationService);
    await jobs.endExpired();
    await jobs.endExpired();

    const ends = await t.prisma.auditLog.findMany({
      where: { action: 'VOIR_COMME_VENDEUR_FIN', actorUserId: user.id },
    });
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ reason: 'EXPIRATION' });
  });

  it('ends when the admin session itself is revoked', async () => {
    const { user, token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;

    await t.request('POST', '/auth/logout', { token });

    expect(
      (await t.request('GET', '/test-espace-vendeur/colis', { token: impersonationToken })).status,
    ).toBe(401);
    const entry = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'VOIR_COMME_VENDEUR_FIN', actorUserId: user.id },
    });
    expect(entry.reason).toBe('SESSION_REVOQUEE');
  });

  it('ends when the admin loses the role, e.g. deactivated mid-way', async () => {
    const { user, token } = await freshAdmin();
    const { impersonationToken } = (await start(token)).body;
    await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(
      (await t.request('GET', '/test-espace-vendeur/colis', { token: impersonationToken })).status,
    ).toBe(401);
  });
});
