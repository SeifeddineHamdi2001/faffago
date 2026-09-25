import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { COURIER_APP_HEADERS, type ApiResponse, type Fixture, type TestApp } from './test-app';
import { createParcel } from './work-fixtures';

/**
 * Money happens after real scans: parcels are delivered through the courier
 * app's queue, so the tests count exactly what the Caisse will count.
 */

// The test clock: 2026-09-25T08:00Z, 09:00 in Tunis.
export const TODAY = '2026-09-25';
export const YESTERDAY = '2026-09-24';
export const NOW = '2026-09-25T08:00:00.000Z';

export interface OperationResult {
  kind: string;
  id: string;
  ok: boolean;
  replayed: boolean;
  code: string | null;
  message: string;
  parcel: { code: string; status: string } | null;
}

export async function sync(
  t: TestApp,
  token: string,
  operations: unknown[],
): Promise<OperationResult[]> {
  const response = await t.request('POST', '/scans/courier', {
    token,
    body: { operations },
    headers: COURIER_APP_HEADERS,
  });
  if (response.status !== 200)
    throw new Error(`sync ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body.results as OperationResult[];
}

export function scanOp(fields: Record<string, unknown>) {
  return {
    kind: 'SCAN',
    clientScanId: randomUUID(),
    source: 'APP_COURSIER',
    deviceTime: NOW,
    ...fields,
  };
}

/** A parcel out with the livreur, delivered by his scan at `deviceTime`. */
export async function delivered(
  t: TestApp,
  input: {
    seller: Fixture;
    livreur: Fixture;
    token: string;
    deviceTime?: string;
    cod?: bigint;
    extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
  },
): Promise<{ id: string; code: string; clientScanId: string }> {
  const id = await createParcel(t.prisma, {
    sellerId: input.seller.sellerId!,
    createdByUserId: input.seller.id,
    status: 'EN_LIVRAISON',
    location: 'AVEC_LE_LIVREUR',
    currentLivreurId: input.livreur.courierId!,
    extra: { ...(input.cod !== undefined ? { codAmountMillimes: input.cod } : {}), ...input.extra },
  });
  const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });
  const op = scanOp({
    action: 'LIVRE',
    rawCode: parcel.code,
    collectedMillimes: parcel.codAmountMillimes.toString(),
    deviceTime: input.deviceTime ?? NOW,
    ...(parcel.isExchange ? { exchangeItemCollected: true } : {}),
  });
  const [result] = await sync(t, input.token, [op]);
  if (!result?.ok) throw new Error(`Livré refusé : ${JSON.stringify(result)}`);
  return { id, code: parcel.code, clientScanId: op.clientScanId as string };
}

export async function count(
  t: TestApp,
  token: string,
  courier: Fixture,
  counted: string,
  day = TODAY,
): Promise<ApiResponse> {
  return t.request('POST', `/caisse/${courier.id}/${day}/compter`, { token, body: { counted } });
}

export async function close(
  t: TestApp,
  token: string,
  courier: Fixture,
  day = TODAY,
): Promise<ApiResponse> {
  return t.request('POST', `/caisse/${courier.id}/${day}/cloturer`, { token });
}

/** A delivered parcel whose courier's caisse is closed: its cash is at the depot. */
export async function cashAtDepot(
  t: TestApp,
  input: {
    seller: Fixture;
    livreur: Fixture;
    livreurToken: string;
    staffToken: string;
    cod?: bigint;
  },
): Promise<{ id: string; code: string }> {
  const parcel = await delivered(t, {
    seller: input.seller,
    livreur: input.livreur,
    token: input.livreurToken,
    cod: input.cod,
  });
  const session = await t.request('GET', `/caisse/${input.livreur.id}/${TODAY}`, {
    token: input.staffToken,
  });
  const expected = (BigInt(session.body.expected.totalMillimes) / 1000n).toString();
  const millimes = (BigInt(session.body.expected.totalMillimes) % 1000n)
    .toString()
    .padStart(3, '0');
  const counted = await count(t, input.staffToken, input.livreur, `${expected},${millimes}`);
  if (counted.status !== 200) throw new Error(`compter ${counted.status}`);
  const closed = await close(t, input.staffToken, input.livreur);
  if (closed.status !== 200)
    throw new Error(`clôturer ${closed.status}: ${JSON.stringify(closed.body)}`);
  return parcel;
}

export function stationScan(
  t: TestApp,
  token: string,
  mode: string,
  rawCode: string,
  extra: Record<string, unknown> = {},
): Promise<ApiResponse> {
  return t.request('POST', '/scans/depot', {
    token,
    body: {
      clientScanId: randomUUID(),
      mode,
      rawCode,
      source: 'WEB_DOUCHETTE',
      deviceTime: NOW,
      ...extra,
    },
  });
}
