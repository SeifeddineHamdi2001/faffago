import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  createUser,
  login,
  type ApiResponse,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Étiquettes over HTTP (Vendeur 4.4): one PDF per request, thermal one per
 * page or A4 four per page, for the seller's own parcels only (D-26).
 */

let t: TestApp;
let seller: Fixture;
let otherSeller: Fixture;
let admin: Fixture;
let token: string;
let codes: string[];

async function codeOf(owner: Fixture): Promise<string> {
  const id = await createParcel(t.prisma, { sellerId: owner.sellerId!, createdByUserId: owner.id });
  return (await t.prisma.parcel.findUniqueOrThrow({ where: { id } })).code;
}

function pdfOf(response: ApiResponse): string {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/pdf');
  const body = response.body as Buffer;
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  return body.toString('latin1');
}

function pages(pdf: string): number {
  return pdf.match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;
}

function mediaBox(pdf: string): number[] {
  const match = /\/MediaBox \[([^\]]+)\]/.exec(pdf)!;
  return match[1]!
    .trim()
    .split(/\s+/)
    .map((n) => Math.round(Number(n)));
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.etiquettes' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@etiquettes.tn' });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'autre@etiquettes.tn' });
  codes = [];
  for (let i = 0; i < 5; i += 1) codes.push(await codeOf(seller));
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  token = (await login(t, seller)).accessToken;
});

describe('one label', () => {
  it('is a 100 × 150 mm page by default', async () => {
    const pdf = pdfOf(await t.request('GET', `/parcels/${codes[0]}/label`, { token }));
    expect(pages(pdf)).toBe(1);
    expect(mediaBox(pdf)).toEqual([0, 0, 283, 425]);
  });

  it('keeps no copy anywhere: no-store, and named after the code', async () => {
    const response = await t.request('GET', `/parcels/${codes[0]}/label`, { token });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toBe(
      `inline; filename="etiquette-${codes[0]}.pdf"`,
    );
  });

  it("answers another seller's parcel like an unknown code (D-26)", async () => {
    const theirs = await codeOf(otherSeller);
    const response = await t.request('GET', `/parcels/${theirs}/label`, { token });
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Code inconnu');
  });
});

describe('a batch', () => {
  it('prints four per A4 page', async () => {
    const pdf = pdfOf(
      await t.request('GET', `/parcels/labels?format=A4&codes=${codes.join(',')}`, { token }),
    );
    expect(pages(pdf)).toBe(2);
    expect(mediaBox(pdf)).toEqual([0, 0, 595, 842]);
  });

  it('prints one per thermal page, a code asked twice once', async () => {
    const pdf = pdfOf(
      await t.request('GET', `/parcels/labels?codes=${codes[0]},${codes[1]},${codes[0]}`, {
        token,
      }),
    );
    expect(pages(pdf)).toBe(2);
  });

  it('refuses the whole batch when one code is not the seller’s', async () => {
    const theirs = await codeOf(otherSeller);
    const response = await t.request('GET', `/parcels/labels?codes=${codes[0]},${theirs}`, {
      token,
    });
    expect(response.status).toBe(404);
  });

  it('refuses an unknown format, no code, or more than 500', async () => {
    expect(
      (await t.request('GET', `/parcels/labels?format=A5&codes=${codes[0]}`, { token })).status,
    ).toBe(400);
    expect((await t.request('GET', '/parcels/labels?codes=', { token })).status).toBe(400);
    const many = Array.from({ length: 501 }, () => codes[0]).join(',');
    expect((await t.request('GET', `/parcels/labels?codes=${many}`, { token })).status).toBe(400);
  });
});

describe('every label of an import', () => {
  it('prints the parcels of the file, and none of another seller’s import', async () => {
    const created = await t.request('POST', '/parcels/imports', {
      token,
      body: {
        importId: randomUUID(),
        fileName: 'commandes.csv',
        rows: [3, 2].map((line) => ({
          line,
          cells: {
            nom_destinataire: `Client ${line}`,
            telephone: '29876543',
            localite: 'Khaznadar',
            adresse: '12 rue de Marseille',
            description_produit: 'Bracelet',
            montant_cod: '10',
          },
        })),
      },
    });
    expect(created.status).toBe(201);
    const pdf = pdfOf(
      await t.request('GET', `/parcels/imports/${created.body.id}/labels`, { token }),
    );
    expect(pages(pdf)).toBe(2);

    const other = await t.request('GET', `/parcels/imports/${created.body.id}/labels`, {
      token: (await login(t, otherSeller)).accessToken,
    });
    expect(other.status).toBe(404);
  });
});

describe('who may print', () => {
  it('is the seller alone: staff and "Voir comme le vendeur" are refused', async () => {
    const adminToken = (await login(t, admin)).accessToken;
    expect(
      (await t.request('GET', `/parcels/${codes[0]}/label`, { token: adminToken })).status,
    ).toBe(403);
    const started = await t.request('POST', '/auth/impersonation', {
      token: adminToken,
      body: { sellerId: seller.sellerId },
    });
    const response = await t.request('GET', `/parcels/${codes[0]}/label`, {
      token: started.body.impersonationToken,
    });
    expect(response.status).toBe(403);
  });
});
