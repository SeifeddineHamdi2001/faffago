import { Controller, Get } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Permission } from '@faffago/shared';
import {
  ALLOW_OUTDATED_COURIER_APP,
  AllowImpersonation,
  Authenticated,
  CurrentPrincipal,
  RequirePermission,
  isRouteDeclared,
} from '../../src/auth/decorators';
import { sellerIdOf, type Principal } from '../../src/auth/principal';
import { createTestApp, createUser, login, type TestApp } from '../support/test-app';

/**
 * Deny by default: a route answers only if it says who may call it.
 */

@Controller('test-guards')
class GuardProbeController {
  /** Forgot to declare anything: must refuse everyone, the admin included. */
  @Get('undeclared')
  undeclared(): string {
    return 'fuite';
  }

  @Get('parametres')
  @RequirePermission(Permission.PARAMETRES)
  parametres(): string {
    return 'ok';
  }

  @Get('scan')
  @RequirePermission(Permission.SCAN_DEPOT)
  scan(): string {
    return 'ok';
  }

  /** Where the seller scope comes from: the token, never the request. */
  @Get('mon-espace')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  monEspace(@CurrentPrincipal() principal: Principal): { sellerId: string } {
    return { sellerId: sellerIdOf(principal) };
  }

  @Get('connecte')
  @Authenticated()
  connecte(): string {
    return 'ok';
  }
}

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp([GuardProbeController]);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('every route declares who may call it', () => {
  it('has no route in the application without @Public, @Authenticated or @RequirePermission', () => {
    const discovery = t.app.get(DiscoveryService);
    const scanner = t.app.get(MetadataScanner);
    const reflector = t.app.get(Reflector);

    const undeclared: string[] = [];
    let routes = 0;
    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype || metatype === GuardProbeController) continue;
      for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = instance[name];
        if (!Reflect.getMetadata('path', handler)) continue;
        routes += 1;
        if (!isRouteDeclared(reflector, handler, metatype))
          undeclared.push(`${metatype.name}.${name}`);
      }
    }
    expect(routes).toBeGreaterThan(5);
    expect(undeclared).toEqual([]);
  });

  it('lets an outdated courier app through the scan upload only (D-14)', () => {
    const discovery = t.app.get(DiscoveryService);
    const scanner = t.app.get(MetadataScanner);

    const outdatedAllowed: string[] = [];
    for (const { instance, metatype } of discovery.getControllers()) {
      if (!instance || !metatype) continue;
      for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        if (Reflect.getMetadata(ALLOW_OUTDATED_COURIER_APP, instance[name])) {
          outdatedAllowed.push(`${metatype.name}.${name}`);
        }
      }
    }
    // Exactly one: the courier app's queue upload (phase 6).
    expect(outdatedAllowed).toEqual(['CourierSyncController.upload']);
  });

  it('refuses an undeclared route even to the admin', async () => {
    const admin = await createUser(t.prisma, { role: 'ADMIN', username: 'guard.admin' });
    const { accessToken } = await login(t, admin);
    const response = await t.request('GET', '/test-guards/undeclared', { token: accessToken });
    expect(response.status).toBe(403);
    expect(response.body.message).not.toContain('fuite');
  });
});

describe('authentication', () => {
  it('answers 401 with no token, 403 with the wrong role', async () => {
    expect((await t.request('GET', '/test-guards/parametres')).status).toBe(401);

    const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'guard.depot' });
    const { accessToken } = await login(t, depot);
    const response = await t.request('GET', '/test-guards/parametres', { token: accessToken });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('NON_AUTORISE');

    expect((await t.request('GET', '/test-guards/scan', { token: accessToken })).status).toBe(200);
  });

  it('lets any logged-in role through @Authenticated', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const { accessToken } = await login(t, livreur);
    const response = await t.request('GET', '/test-guards/connecte', {
      token: accessToken,
      headers: { 'x-app-version': '1.0.0' },
    });
    expect(response.status).toBe(200);
  });

  it('never trusts a role sent by the client (tech-stack 2)', async () => {
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'guard.depot2' });
    const { accessToken } = await login(t, depot);
    const response = await t.request('GET', '/test-guards/parametres', {
      token: accessToken,
      headers: { 'x-role': 'ADMIN' },
    });
    expect(response.status).toBe(403);
  });

  it('refuses a token whose role no longer matches the database', async () => {
    const user = await createUser(t.prisma, { role: 'DEPOT', username: 'guard.depot3' });
    const { accessToken } = await login(t, user);
    // Changing a role is not a feature (a new account is created instead,
    // Admin 4.15), but the guard must not rely on the token's copy of it.
    await t.prisma.user.update({ where: { id: user.id }, data: { role: 'SERVICE_CLIENT' } });
    const response = await t.request('GET', '/test-guards/scan', { token: accessToken });
    expect(response.status).toBe(401);
  });
});

describe('seller scope', () => {
  it('takes the seller from the session, whatever the request says', async () => {
    const a = await createUser(t.prisma, { role: 'VENDEUR', email: 'scope.a@mail.tn' });
    const b = await createUser(t.prisma, { role: 'VENDEUR', email: 'scope.b@mail.tn' });
    const { accessToken } = await login(t, a);

    const response = await t.request('GET', `/test-guards/mon-espace?sellerId=${b.sellerId}`, {
      token: accessToken,
      headers: { 'x-seller-id': b.sellerId! },
    });
    expect(response.body).toEqual({ sellerId: a.sellerId });
  });

  it('keeps staff out of the seller space', async () => {
    const admin = await createUser(t.prisma, { role: 'ADMIN', username: 'scope.admin' });
    const { accessToken } = await login(t, admin);
    const response = await t.request('GET', '/test-guards/mon-espace', { token: accessToken });
    expect(response.status).toBe(403);
  });
});
