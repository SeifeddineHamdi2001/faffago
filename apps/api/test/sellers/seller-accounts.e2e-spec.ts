import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import * as argon2 from 'argon2';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  nextPhone,
  type ApiResponse,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { BROKEN_JPEG, HTML_CALLED_JPEG, PDF, blob, jpegWithGps, png } from '../support/documents';

/**
 * Seller accounts (Vendeur 2.2, Admin 4.14): created by the admin with the
 * CIN documents, which are encrypted, private and audited (D-32, D-33, D-34).
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let serviceClient: Fixture;
let livreur: Fixture;
let adminToken: string;
let n = 0;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'chef.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'le.depot' });
  serviceClient = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'le.sc' });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  adminToken = (await login(t, admin)).accessToken;
});

function uniqueEmail(): string {
  n += 1;
  return `boutique.${n}@exemple.tn`;
}

/** Every file in the documents folder, by name. */
function storedFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(t.storageDir);
  return files;
}

interface SellerForm {
  fields?: Record<string, string>;
  files?: Record<string, Buffer>;
}

async function sellerForm({ fields = {}, files }: SellerForm = {}): Promise<FormData> {
  const form = new FormData();
  const values: Record<string, string> = {
    shopName: 'Bijoux Yasmine',
    productCategory: 'BIJOUX_ACCESSOIRES',
    storeLink: 'https://www.instagram.com/bijoux.yasmine',
    contactFirstName: 'Yasmine',
    contactLastName: 'Trabelsi',
    contactPhone: nextPhone(),
    email: uniqueEmail(),
    statut: 'CIN_UNIQUEMENT',
    cinNumber: '01234567',
    ...fields,
  };
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  const documents = files ?? { CIN_RECTO: await jpegWithGps(), CIN_VERSO: await png() };
  for (const [type, bytes] of Object.entries(documents)) {
    form.append(type, blob(bytes, 'image/jpeg'), `${type.toLowerCase()}.jpg`);
  }
  return form;
}

/** A courier's calls carry the app version, or D-14 refuses them first. */
function headersFor(token: string): Record<string, string> {
  return courierTokens.has(token) ? COURIER_APP_HEADERS : {};
}
const courierTokens = new Set<string>();

function createSeller(form: FormData, token = adminToken): Promise<ApiResponse> {
  return t.request('POST', '/sellers', { token, form, headers: headersFor(token) });
}

async function createdSeller(form?: SellerForm) {
  const response = await createSeller(await sellerForm(form));
  expect(response.status).toBe(201);
  return response.body as {
    seller: { id: string; email: string; userId: string };
    password: string;
  };
}

async function documentsOf(sellerId: string) {
  return t.prisma.sellerDocument.findMany({ where: { sellerId }, orderBy: { uploadedAt: 'asc' } });
}

async function tokenOf(role: Fixture): Promise<string> {
  const token = (await login(t, role)).accessToken;
  if (role.role === 'LIVREUR' || role.role === 'RAMASSEUR') courierTokens.add(token);
  return token;
}

describe('Créer un vendeur (Admin 4.14)', () => {
  it('creates the account, shows the password once, and the seller logs in by email', async () => {
    const email = uniqueEmail();
    const response = await createSeller(
      await sellerForm({ fields: { email: email.toUpperCase(), contactPhone: '22 123 456' } }),
    );
    expect(response.status).toBe(201);
    const { seller, password } = response.body;
    expect(seller).toMatchObject({
      shopName: 'Bijoux Yasmine',
      productCategory: 'BIJOUX_ACCESSOIRES',
      contactFullName: 'Yasmine Trabelsi',
      contactPhone: '22123456',
      email,
      statut: 'CIN_UNIQUEMENT',
      accountState: 'ACTIF',
    });

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: seller.userId } });
    expect(user).toMatchObject({ role: 'VENDEUR', email, phone: '22123456' });
    expect(await argon2.verify(user.passwordHash, password)).toBe(true);

    const loggedIn = await t.request('POST', '/auth/login/vendeur', {
      body: { email, password },
    });
    expect(loggedIn.status).toBe(200);
  });

  it('stores CIN front and back encrypted, named by UUID, never in clear', async () => {
    const cinRecto = await jpegWithGps();
    const before = storedFiles().length;
    const { seller } = await createdSeller({
      files: { CIN_RECTO: cinRecto, CIN_VERSO: await png() },
    });

    const documents = await documentsOf(seller.id);
    expect(documents.map((d) => d.type).sort()).toEqual(['CIN_RECTO', 'CIN_VERSO']);
    expect(storedFiles()).toHaveLength(before + 2);
    for (const document of documents) {
      expect(document).toMatchObject({ encryptionKeyId: 'test1', replacedAt: null });
      const [path] = storedFiles().filter((file) => file.endsWith(document.storageKey));
      const onDisk = readFileSync(path!);
      // Not a JPEG or PNG any more: the image signatures are gone.
      expect(onDisk.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
      expect(onDisk.subarray(1, 4).toString()).not.toBe('PNG');
      expect(onDisk.includes(Buffer.from('TestPhone'))).toBe(false);
      expect(path).not.toContain(seller.id);
      expect(path).not.toContain('Yasmine');
    }
  });

  it('audits the creation and each upload, never the password', async () => {
    const { seller, password } = await createdSeller();
    const entries = await t.prisma.auditLog.findMany({
      where: { entityId: { in: [seller.userId, seller.id] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => e.action).sort()).toEqual([
      'AJOUT_DOCUMENT_VENDEUR',
      'AJOUT_DOCUMENT_VENDEUR',
      'CREATION_COMPTE',
    ]);
    const text = JSON.stringify(entries);
    expect(text).not.toContain(password);
    expect(text).not.toContain('argon2');
  });

  it.each([
    ['PATENTE', { CIN_RECTO: 'jpg', CIN_VERSO: 'jpg' }, 'DOCUMENT_MANQUANT'],
    ['AUTO_ENTREPRENEUR', { CIN_RECTO: 'jpg', CIN_VERSO: 'jpg' }, 'DOCUMENT_MANQUANT'],
    ['CIN_UNIQUEMENT', { CIN_RECTO: 'jpg' }, 'DOCUMENT_MANQUANT'],
    [
      'CIN_UNIQUEMENT',
      { CIN_RECTO: 'jpg', CIN_VERSO: 'jpg', PATENTE: 'pdf' },
      'DOCUMENT_INATTENDU',
    ],
    [
      'PATENTE',
      { CIN_RECTO: 'jpg', CIN_VERSO: 'jpg', PATENTE: 'pdf', CARTE_AUTO_ENTREPRENEUR: 'pdf' },
      'DOCUMENT_INATTENDU',
    ],
  ])('statut %s with %j is refused: %s, and nothing is kept', async (statut, kinds, code) => {
    const files: Record<string, Buffer> = {};
    for (const [type, kind] of Object.entries(kinds)) {
      files[type] = kind === 'pdf' ? PDF : await jpegWithGps();
    }
    const before = storedFiles().length;
    const email = uniqueEmail();
    const response = await createSeller(await sellerForm({ fields: { statut, email }, files }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe(code);
    expect(await t.prisma.user.findFirst({ where: { email } })).toBeNull();
    expect(storedFiles()).toHaveLength(before);
  });

  it('accepts Patente with its patente, and Auto-entrepreneur with its card', async () => {
    const patente = await createdSeller({
      fields: { statut: 'PATENTE' },
      files: { CIN_RECTO: await png(), CIN_VERSO: await png(), PATENTE: PDF },
    });
    expect((await documentsOf(patente.seller.id)).map((d) => d.type).sort()).toEqual([
      'CIN_RECTO',
      'CIN_VERSO',
      'PATENTE',
    ]);
    const auto = await createdSeller({
      fields: { statut: 'AUTO_ENTREPRENEUR' },
      files: { CIN_RECTO: await png(), CIN_VERSO: await png(), CARTE_AUTO_ENTREPRENEUR: PDF },
    });
    expect((await documentsOf(auto.seller.id)).map((d) => d.type)).toContain(
      'CARTE_AUTO_ENTREPRENEUR',
    );
  });

  it.each([
    ['an HTML page called .jpg', HTML_CALLED_JPEG, 400, 'DOCUMENT_FORMAT_REFUSE'],
    ['a JPEG no decoder can read', BROKEN_JPEG, 400, 'DOCUMENT_ILLISIBLE'],
    [
      'a file over 10 MB',
      Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]),
      413,
      'DOCUMENT_TROP_VOLUMINEUX',
    ],
  ])('refuses %s, and keeps no file of the attempt', async (_label, bad, status, code) => {
    const before = storedFiles().length;
    const response = await createSeller(
      await sellerForm({ files: { CIN_RECTO: await png(), CIN_VERSO: bad } }),
    );
    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(storedFiles()).toHaveLength(before);
  });

  it('refuses an email already used, whatever its case, and removes the files it wrote', async () => {
    const first = await createdSeller();
    const before = storedFiles().length;
    const response = await createSeller(
      await sellerForm({ fields: { email: first.seller.email.toUpperCase() } }),
    );
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDENTIFIANT_DEJA_UTILISE');
    expect(storedFiles()).toHaveLength(before);
  });

  it("refuses another seller's phone (Q8)", async () => {
    const phone = nextPhone();
    await createdSeller({ fields: { contactPhone: phone } });
    const response = await createSeller(await sellerForm({ fields: { contactPhone: phone } }));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TELEPHONE_DEJA_UTILISE');
  });

  it('refuses a category outside the list (D-33)', async () => {
    const response = await createSeller(await sellerForm({ fields: { productCategory: 'Mode' } }));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION');
  });

  it('refuses a file under a name that is not a document type', async () => {
    const form = await sellerForm();
    form.append('AUTRE_CHOSE', blob(PDF), 'x.pdf');
    const response = await createSeller(form);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DOCUMENT_INATTENDU');
  });

  it('is the admin’s alone, refused before any file is written', async () => {
    const before = storedFiles().length;
    for (const who of [depot, serviceClient, livreur]) {
      const response = await createSeller(await sellerForm(), await tokenOf(who));
      expect(response.status).toBe(403);
    }
    expect(storedFiles()).toHaveLength(before);
  });
});

describe('the documents: admin only, every view audited (D-32)', () => {
  it('gives the admin the cleaned file, with no-store headers, and audits the view', async () => {
    const { seller } = await createdSeller({
      fields: { statut: 'PATENTE' },
      files: { CIN_RECTO: await jpegWithGps(), CIN_VERSO: await png(), PATENTE: PDF },
    });
    const documents = await documentsOf(seller.id);
    const recto = documents.find((d) => d.type === 'CIN_RECTO')!;
    const patente = documents.find((d) => d.type === 'PATENTE')!;

    const image = await t.request('GET', `/sellers/${seller.id}/documents/${recto.id}`, {
      token: adminToken,
    });
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/jpeg');
    expect(image.headers.get('cache-control')).toBe('no-store');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(image.headers.get('content-disposition')).toMatch(/^inline; filename="cin-recto\.jpg"$/);
    expect((await sharp(image.body as Buffer).metadata()).exif).toBeUndefined();

    const pdf = await t.request('GET', `/sellers/${seller.id}/documents/${patente.id}`, {
      token: adminToken,
    });
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.body).toEqual(PDF);

    const views = await t.prisma.auditLog.findMany({
      where: { entityId: seller.id, action: 'CONSULTATION_DOCUMENT_VENDEUR' },
    });
    expect(views.map((v) => (v.after as { documentId: string }).documentId).sort()).toEqual(
      [recto.id, patente.id].sort(),
    );
    expect(views.every((v) => v.actorUserId === admin.id)).toBe(true);
  });

  it('refuses Dépôt, Service client, couriers, and the seller himself', async () => {
    const { seller, password } = await createdSeller();
    const [document] = await documentsOf(seller.id);
    const sellerToken = (
      await t.request('POST', '/auth/login/vendeur', { body: { email: seller.email, password } })
    ).body.accessToken as string;

    for (const token of [
      await tokenOf(depot),
      await tokenOf(serviceClient),
      await tokenOf(livreur),
      sellerToken,
    ]) {
      const response = await t.request('GET', `/sellers/${seller.id}/documents/${document!.id}`, {
        token,
        headers: headersFor(token),
      });
      expect(response.status).toBe(403);
    }
    const views = await t.prisma.auditLog.count({
      where: { entityId: seller.id, action: 'CONSULTATION_DOCUMENT_VENDEUR' },
    });
    expect(views).toBe(0);
  });

  it('refuses "Voir comme le vendeur" (D-5)', async () => {
    const { seller } = await createdSeller();
    const [document] = await documentsOf(seller.id);
    const started = await t.request('POST', '/auth/impersonation', {
      token: adminToken,
      body: { sellerId: seller.id },
    });
    const response = await t.request('GET', `/sellers/${seller.id}/documents/${document!.id}`, {
      token: started.body.impersonationToken,
    });
    expect(response.status).toBe(403);
  });

  it('answers 404 for a document of another seller, and audits nothing', async () => {
    const a = await createdSeller();
    const b = await createdSeller();
    const [documentOfB] = await documentsOf(b.seller.id);
    const response = await t.request(
      'GET',
      `/sellers/${a.seller.id}/documents/${documentOfB!.id}`,
      { token: adminToken },
    );
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('DOCUMENT_INTROUVABLE');
  });

  it('refuses to serve a file altered on disk, and audits no view', async () => {
    const { seller } = await createdSeller();
    const [document] = await documentsOf(seller.id);
    const [path] = storedFiles().filter((file) => file.endsWith(document!.storageKey));
    const bytes = readFileSync(path!);
    bytes[10] = bytes[10]! ^ 0xff;
    writeFileSync(path!, bytes);

    const response = await t.request('GET', `/sellers/${seller.id}/documents/${document!.id}`, {
      token: adminToken,
    });
    expect(response.status).toBe(500);
    expect(
      await t.prisma.auditLog.count({
        where: { entityId: seller.id, action: 'CONSULTATION_DOCUMENT_VENDEUR' },
      }),
    ).toBe(0);
  });
});

describe('the seller page', () => {
  it('shows the admin the account and the list of documents, never keys or file names', async () => {
    const { seller } = await createdSeller();
    const response = await t.request('GET', `/sellers/${seller.id}`, { token: adminToken });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: seller.id,
      email: seller.email,
      statut: 'CIN_UNIQUEMENT',
      contactFirstName: 'Yasmine',
      contactLastName: 'Trabelsi',
    });
    expect(response.body.documents).toHaveLength(2);
    const text = JSON.stringify(response.body);
    for (const secret of ['storageKey', 'encryption', 'sha256', 'passwordHash']) {
      expect(text).not.toContain(secret);
    }
  });

  it('shows Dépôt and Service client the shop and the contact only (D-11)', async () => {
    const { seller } = await createdSeller();
    for (const who of [depot, serviceClient]) {
      const response = await t.request('GET', `/sellers/${seller.id}`, {
        token: await tokenOf(who),
      });
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(
        ['contactFullName', 'contactPhone', 'id', 'shopName'].sort(),
      );
    }
  });

  it('answers 404 for an unknown seller', async () => {
    const response = await t.request('GET', '/sellers/00000000-0000-4000-8000-000000000000', {
      token: adminToken,
    });
    expect(response.status).toBe(404);
  });
});

describe('Modifier un vendeur', () => {
  it('corrects the shop and the contact, keeps the login phone in step, and audits both sides', async () => {
    const { seller } = await createdSeller();
    const phone = nextPhone();
    const newEmail = uniqueEmail();
    const response = await t.request('PATCH', `/sellers/${seller.id}`, {
      token: adminToken,
      body: { shopName: 'Yasmine Bijoux', contactPhone: phone, email: newEmail.toUpperCase() },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      shopName: 'Yasmine Bijoux',
      contactPhone: phone,
      email: newEmail,
    });
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: seller.userId } });
    expect(user).toMatchObject({ phone, email: newEmail });

    const [entry] = await t.prisma.auditLog.findMany({
      where: { entityId: seller.id, action: 'MODIFICATION_VENDEUR' },
    });
    expect(entry!.before).toMatchObject({ shopName: 'Bijoux Yasmine', email: seller.email });
    expect(entry!.after).toMatchObject({ shopName: 'Yasmine Bijoux', email: newEmail });
    expect(Object.keys(entry!.after as object).sort()).toEqual(
      ['contactPhone', 'email', 'shopName'].sort(),
    );
  });

  it('never changes the statut this way (D-34)', async () => {
    const { seller } = await createdSeller();
    const response = await t.request('PATCH', `/sellers/${seller.id}`, {
      token: adminToken,
      body: { statut: 'PATENTE' },
    });
    expect(response.status).toBe(400);
  });

  it('is the admin’s alone', async () => {
    const { seller } = await createdSeller();
    const response = await t.request('PATCH', `/sellers/${seller.id}`, {
      token: await tokenOf(serviceClient),
      body: { shopName: 'Autre' },
    });
    expect(response.status).toBe(403);
  });
});

describe('Changer le statut (D-33, D-34)', () => {
  function changeStatut(sellerId: string, statut: string, document?: Buffer, token = adminToken) {
    const form = new FormData();
    form.append('statut', statut);
    if (document) form.append('document', blob(document), 'document.pdf');
    return t.request('POST', `/sellers/${sellerId}/statut`, { token, form });
  }

  it('to Patente needs the patente in the same action', async () => {
    const { seller } = await createdSeller();
    const refused = await changeStatut(seller.id, 'PATENTE');
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('DOCUMENT_MANQUANT');

    const response = await changeStatut(seller.id, 'PATENTE', PDF);
    expect(response.status).toBe(200);
    expect(response.body.statut).toBe('PATENTE');
    expect((await documentsOf(seller.id)).map((d) => d.type)).toContain('PATENTE');

    const [entry] = await t.prisma.auditLog.findMany({
      where: { entityId: seller.id, action: 'CHANGEMENT_STATUT_VENDEUR' },
    });
    expect(entry!.before).toMatchObject({ statut: 'CIN_UNIQUEMENT' });
    expect(entry!.after).toMatchObject({ statut: 'PATENTE' });
  });

  it('to Auto-entrepreneur needs the card', async () => {
    const { seller } = await createdSeller();
    expect((await changeStatut(seller.id, 'AUTO_ENTREPRENEUR')).body.code).toBe(
      'DOCUMENT_MANQUANT',
    );
    expect((await changeStatut(seller.id, 'AUTO_ENTREPRENEUR', PDF)).status).toBe(200);
  });

  it('to CIN uniquement takes no document', async () => {
    const { seller } = await createdSeller({
      fields: { statut: 'PATENTE' },
      files: { CIN_RECTO: await png(), CIN_VERSO: await png(), PATENTE: PDF },
    });
    expect((await changeStatut(seller.id, 'CIN_UNIQUEMENT', PDF)).body.code).toBe(
      'DOCUMENT_INATTENDU',
    );
    const response = await changeStatut(seller.id, 'CIN_UNIQUEMENT');
    expect(response.status).toBe(200);
    expect(response.body.statut).toBe('CIN_UNIQUEMENT');
  });

  it('to CIN uniquement needs the CIN number, recorded or sent with it (D-89)', async () => {
    const { seller } = await createdSeller({
      fields: { statut: 'PATENTE', cinNumber: '' },
      files: { CIN_RECTO: await png(), CIN_VERSO: await png(), PATENTE: PDF },
    });
    const refused = await changeStatut(seller.id, 'CIN_UNIQUEMENT');
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('CIN_OBLIGATOIRE');
    const form = new FormData();
    form.append('statut', 'CIN_UNIQUEMENT');
    form.append('cinNumber', '07654321');
    const response = await t.request('POST', `/sellers/${seller.id}/statut`, {
      token: adminToken,
      form,
    });
    expect(response.status).toBe(200);
    expect((await t.prisma.seller.findUniqueOrThrow({ where: { id: seller.id } })).cinNumber).toBe(
      '07654321',
    );
  });

  it('refuses to create a CIN uniquement seller without his CIN number (D-89)', async () => {
    const response = await createSeller(await sellerForm({ fields: { cinNumber: '' } }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('Numéro de CIN obligatoire');
  });

  it('refuses the statut the seller already has', async () => {
    const { seller } = await createdSeller();
    const response = await changeStatut(seller.id, 'CIN_UNIQUEMENT');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('STATUT_INCHANGE');
  });

  it('is the admin’s alone', async () => {
    const { seller } = await createdSeller();
    const response = await changeStatut(seller.id, 'PATENTE', PDF, await tokenOf(depot));
    expect(response.status).toBe(403);
  });
});

describe('Remplacer un document (D-32)', () => {
  function addDocument(sellerId: string, type: string, bytes: Buffer, token = adminToken) {
    const form = new FormData();
    form.append('type', type);
    form.append('document', blob(bytes), 'document');
    return t.request('POST', `/sellers/${sellerId}/documents`, { token, form });
  }

  it('keeps the old version, marked replaced, still readable', async () => {
    const { seller } = await createdSeller();
    const old = (await documentsOf(seller.id)).find((d) => d.type === 'CIN_RECTO')!;

    const response = await addDocument(seller.id, 'CIN_RECTO', PDF);
    expect(response.status).toBe(201);

    const documents = await documentsOf(seller.id);
    const rectos = documents.filter((d) => d.type === 'CIN_RECTO');
    expect(rectos).toHaveLength(2);
    const current = rectos.find((d) => d.replacedAt === null)!;
    expect(rectos.find((d) => d.id === old.id)!.replacedById).toBe(current.id);

    const oldFile = await t.request('GET', `/sellers/${seller.id}/documents/${old.id}`, {
      token: adminToken,
    });
    expect(oldFile.status).toBe(200);
    expect(oldFile.headers.get('content-type')).toBe('image/jpeg');

    const page = await t.request('GET', `/sellers/${seller.id}`, { token: adminToken });
    expect(page.body.documents).toHaveLength(3);
  });

  it("refuses a document the seller's statut does not call for", async () => {
    const { seller } = await createdSeller();
    const response = await addDocument(seller.id, 'PATENTE', PDF);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DOCUMENT_INATTENDU');
  });

  it('is the admin’s alone', async () => {
    const { seller } = await createdSeller();
    const response = await addDocument(seller.id, 'CIN_RECTO', PDF, await tokenOf(serviceClient));
    expect(response.status).toBe(403);
  });
});

describe('Changer de contact (D-42)', () => {
  async function changeContact(
    sellerId: string,
    fields: Record<string, string>,
    files: Record<string, Buffer>,
    token = adminToken,
  ) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const [type, bytes] of Object.entries(files))
      form.append(type, blob(bytes), `${type}.png`);
    return t.request('POST', `/sellers/${sellerId}/contact`, {
      token,
      form,
      headers: headersFor(token),
    });
  }

  const newPerson = () => ({
    contactFirstName: 'Mehdi',
    contactLastName: 'Ben Salah',
    contactPhone: nextPhone(),
  });

  it("names a new person with the new person's CIN; the old CIN stays, marked replaced", async () => {
    const { seller, password } = await createdSeller();
    const before = await documentsOf(seller.id);
    const person = newPerson();

    const response = await changeContact(seller.id, person, {
      CIN_RECTO: await png(),
      CIN_VERSO: await png(),
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contactFullName: 'Mehdi Ben Salah',
      contactFirstName: 'Mehdi',
      contactLastName: 'Ben Salah',
      contactPhone: person.contactPhone,
      email: seller.email,
    });

    const documents = await documentsOf(seller.id);
    expect(documents).toHaveLength(4);
    for (const old of before) {
      expect(documents.find((d) => d.id === old.id)!.replacedAt).not.toBeNull();
    }
    expect(
      documents
        .filter((d) => d.replacedAt === null)
        .map((d) => d.type)
        .sort(),
    ).toEqual(['CIN_RECTO', 'CIN_VERSO']);

    const [entry] = await t.prisma.auditLog.findMany({
      where: { entityId: seller.id, action: 'CHANGEMENT_CONTACT_VENDEUR' },
    });
    expect(entry!.before).toMatchObject({ contactFullName: 'Yasmine Trabelsi' });
    expect(entry!.after).toMatchObject({ contactFullName: 'Mehdi Ben Salah' });

    // The account and its login are untouched.
    const loggedIn = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password },
    });
    expect(loggedIn.status).toBe(200);
  });

  it.each([
    ['no CIN at all', {}],
    ['the front only', { CIN_RECTO: 'png' }],
    ['the back only', { CIN_VERSO: 'png' }],
  ])('refuses %s, and changes nothing', async (_label, kinds) => {
    const { seller } = await createdSeller();
    const files: Record<string, Buffer> = {};
    for (const type of Object.keys(kinds)) files[type] = await png();
    const stored = storedFiles().length;

    const response = await changeContact(seller.id, newPerson(), files);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DOCUMENT_MANQUANT');
    expect(storedFiles()).toHaveLength(stored);
    const unchanged = await t.request('GET', `/sellers/${seller.id}`, { token: adminToken });
    expect(unchanged.body.contactFullName).toBe('Yasmine Trabelsi');
  });

  it('refuses a patente: only the CIN belongs to the contact', async () => {
    const { seller } = await createdSeller();
    const response = await changeContact(seller.id, newPerson(), {
      CIN_RECTO: await png(),
      CIN_VERSO: await png(),
      PATENTE: PDF,
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DOCUMENT_INATTENDU');
  });

  it("refuses another seller's phone, and removes the files it wrote", async () => {
    const other = nextPhone();
    await createdSeller({ fields: { contactPhone: other } });
    const { seller } = await createdSeller();
    const stored = storedFiles().length;
    const response = await changeContact(
      seller.id,
      { ...newPerson(), contactPhone: other },
      { CIN_RECTO: await png(), CIN_VERSO: await png() },
    );
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TELEPHONE_DEJA_UTILISE');
    expect(storedFiles()).toHaveLength(stored);
  });

  it('is the admin’s alone', async () => {
    const { seller } = await createdSeller();
    const response = await changeContact(
      seller.id,
      newPerson(),
      { CIN_RECTO: await png(), CIN_VERSO: await png() },
      await tokenOf(serviceClient),
    );
    expect(response.status).toBe(403);
  });
});

describe('Suspendre / Réactiver (Vendeur 2.5)', () => {
  it('suspends and reactivates, audited; a suspended seller still logs in', async () => {
    const { seller, password } = await createdSeller();

    const suspended = await t.request('POST', `/sellers/${seller.id}/suspend`, {
      token: adminToken,
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.accountState).toBe('SUSPENDU');
    expect(
      (await t.request('POST', `/sellers/${seller.id}/suspend`, { token: adminToken })).body.code,
    ).toBe('COMPTE_DEJA_SUSPENDU');

    const loggedIn = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password },
    });
    expect(loggedIn.status).toBe(200);

    const reactivated = await t.request('POST', `/sellers/${seller.id}/reactivate`, {
      token: adminToken,
    });
    expect(reactivated.body.accountState).toBe('ACTIF');
    expect(
      (await t.request('POST', `/sellers/${seller.id}/reactivate`, { token: adminToken })).body
        .code,
    ).toBe('COMPTE_DEJA_ACTIF');

    const actions = (
      await t.prisma.auditLog.findMany({
        where: {
          entityId: seller.id,
          action: { in: ['SUSPENSION_VENDEUR', 'REACTIVATION_VENDEUR'] },
        },
        orderBy: { createdAt: 'asc' },
      })
    ).map((e) => e.action);
    expect(actions).toEqual(['SUSPENSION_VENDEUR', 'REACTIVATION_VENDEUR']);
  });

  it('is the admin’s alone', async () => {
    const { seller } = await createdSeller();
    const response = await t.request('POST', `/sellers/${seller.id}/suspend`, {
      token: await tokenOf(depot),
    });
    expect(response.status).toBe(403);
  });
});
