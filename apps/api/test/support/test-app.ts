import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { LoginThrottleService } from '../../src/auth/login-throttle.service';
import { CLOCK, type Clock } from '../../src/common/clock';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { SettingsService } from '../../src/settings/settings.service';
import { pgliteAdapter } from './pglite-adapter';
import { applyMigrations } from '../migrations';

/**
 * The whole API, over HTTP, on a real PostgreSQL engine (PGlite) and a clock
 * the test moves by hand, so a 30-minute idle logout or a 90-day session is
 * tested in milliseconds.
 */

export class TestClock implements Clock {
  private current = new Date('2026-09-25T08:00:00.000Z');

  now(): Date {
    return new Date(this.current);
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export interface ApiResponse {
  status: number;
  // Tests read whatever shape each endpoint returns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
}

export interface RequestOptions {
  token?: string;
  body?: unknown;
  /** Multipart upload; fetch sets the boundary itself. */
  form?: FormData;
  headers?: Record<string, string>;
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaClient;
  clock: TestClock;
  throttle: LoginThrottleService;
  settings: SettingsService;
  /** This app's private document directory, emptied on close. */
  storageDir: string;
  request(method: string, path: string, options?: RequestOptions): Promise<ApiResponse>;
  close(): Promise<void>;
}

export const TEST_SECRETS = {
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789abcdef',
  NEXT_PUBLIC_SITE_URL: 'https://www.mirely.store',
  STORAGE_DRIVER: 'local',
  STORAGE_ENCRYPTION_KEY_ID: 'test1',
  STORAGE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

export interface TestAppOptions {
  /**
   * A real PostgreSQL server, already migrated (`startRealPostgres`). The API
   * then runs on the production Prisma setup, the unmodified `PrismaService`
   * with the real driver, instead of PGlite through the test adapter.
   */
  databaseUrl?: string;
}

export async function createTestApp(
  extraControllers: Type[] = [],
  options: TestAppOptions = {},
): Promise<TestApp> {
  const storageDir = mkdtempSync(join(tmpdir(), 'faffago-documents-'));
  Object.assign(process.env, TEST_SECRETS, { STORAGE_LOCAL_PATH: storageDir });

  let db: PGlite | null = null;
  const clock = new TestClock();
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  });
  if (options.databaseUrl) {
    process.env.DATABASE_URL = options.databaseUrl;
  } else {
    db = await PGlite.create();
    await applyMigrations(db);
    builder = builder
      .overrideProvider(PrismaService)
      .useValue(new PrismaClient({ adapter: pgliteAdapter(db) }));
  }
  const moduleRef = await builder.overrideProvider(CLOCK).useValue(clock).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const prisma: PrismaClient = app.get(PrismaService);
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  async function request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers,
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const isFile =
      contentType.startsWith('text/csv') ||
      (!contentType.includes('json') && !contentType.startsWith('text/') && contentType !== '');
    if (isFile) {
      // A file, handed back as bytes: a CSV keeps its byte-order mark, which
      // reading it as text would drop.
      return {
        status: response.status,
        body: Buffer.from(await response.arrayBuffer()),
        headers: response.headers,
      };
    }
    const text = await response.text();
    return {
      status: response.status,
      body: contentType.includes('json') ? JSON.parse(text) : text || null,
      headers: response.headers,
    };
  }

  return {
    app,
    prisma,
    clock,
    throttle: app.get(LoginThrottleService),
    settings: app.get(SettingsService),
    storageDir,
    request,
    async close() {
      await app.close();
      await prisma.$disconnect();
      await db?.close();
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

// ── Fixtures ────────────────────────────────────────────────

let phoneCounter = 20_000_100;

/** A fresh valid Tunisian number each call, so fixtures never collide. */
export function nextPhone(): string {
  phoneCounter += 1;
  return String(phoneCounter);
}

export interface Fixture {
  id: string;
  role: Role;
  password: string;
  phone: string;
  email?: string;
  username?: string;
  sellerId?: string;
  courierId?: string;
}

export async function createUser(
  prisma: PrismaClient,
  input: {
    role: Role;
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    isActive?: boolean;
    shopName?: string;
    sellerState?: 'ACTIF' | 'SUSPENDU';
  },
): Promise<Fixture> {
  const password = input.password ?? 'Mot-De-Passe-Test-42';
  const phone = input.phone ?? nextPhone();
  const user = await prisma.user.create({
    data: {
      role: input.role,
      username: input.username,
      email: input.email,
      phone,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName: 'Prénom',
      lastName: 'Nom',
      isActive: input.isActive ?? true,
    },
  });

  const fixture: Fixture = {
    id: user.id,
    role: input.role,
    password,
    phone,
    email: input.email,
    username: input.username,
  };

  if (input.role === 'VENDEUR') {
    const seller = await prisma.seller.create({
      data: {
        userId: user.id,
        shopName: input.shopName ?? 'Boutique Test',
        productCategory: 'MODE_VETEMENTS',
        contactFullName: 'Prénom Nom',
        contactPhone: phone,
        statut: 'PATENTE',
        accountState: input.sellerState ?? 'ACTIF',
        createdByUserId: user.id,
      },
    });
    fixture.sellerId = seller.id;
  }

  if (input.role === 'LIVREUR' || input.role === 'RAMASSEUR') {
    const courier = await prisma.courier.create({
      data: {
        userId: user.id,
        cin: '01234567',
        payPlan: input.role === 'LIVREUR' ? 'HEBDOMADAIRE' : null,
      },
    });
    fixture.courierId = courier.id;
  }

  return fixture;
}

export const COURIER_APP_HEADERS = { 'x-app-version': '1.0.0' };

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Logs a fixture in through the real endpoint for its role. */
export async function login(t: TestApp, user: Fixture): Promise<Tokens> {
  let response: ApiResponse;
  if (user.role === 'VENDEUR') {
    response = await t.request('POST', '/auth/login/vendeur', {
      body: { email: user.email, password: user.password },
    });
  } else if (user.role === 'LIVREUR' || user.role === 'RAMASSEUR') {
    response = await t.request('POST', '/auth/login/coursier', {
      body: { role: user.role, phone: user.phone, password: user.password },
      headers: COURIER_APP_HEADERS,
    });
  } else {
    response = await t.request('POST', '/auth/login/staff', {
      body: { username: user.username, password: user.password },
    });
  }
  if (response.status !== 200) {
    throw new Error(`login ${user.role} → ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body as Tokens;
}
