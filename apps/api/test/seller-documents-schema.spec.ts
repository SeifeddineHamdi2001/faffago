import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations';

/**
 * Seller documents in the database (D-32, D-33): a row is what makes its
 * encrypted file readable, so it is never deleted and never rewritten; a new
 * document replaces the old one and the old one stays.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SELLER_ID = '22222222-2222-2222-2222-222222222222';
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOC_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHA = 'a'.repeat(64);

let db: PGlite;

function insertDocument(id: string, type = 'CIN_RECTO', extra: Record<string, string> = {}) {
  const values = {
    mime: "'image/jpeg'",
    size: '1000',
    sha: `'${SHA}'`,
    iv: "decode('000000000000000000000000','hex')",
    tag: "decode('00000000000000000000000000000000','hex')",
    ...extra,
  };
  return db.query(
    `insert into seller_documents (id,"sellerId",type,"storageKey","mimeType","sizeBytes",sha256,
       "encryptionKeyId","encryptionIv","encryptionTag","uploadedByUserId")
     values ($1::uuid,$2,$3,$1::text,${values.mime},${values.size},${values.sha},'k1',${values.iv},${values.tag},$4)`,
    [id, SELLER_ID, type, USER_ID],
  );
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE ROLE faffago_app LOGIN PASSWORD 'test';`);
  await applyMigrations(db);
  await db.query(
    `insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
     values ($1,'ADMIN','saif','20123456','h','Saif','B',now())`,
    [USER_ID],
  );
  await db.query(
    `insert into sellers (id,"userId","shopName","productCategory","contactFullName",
       "contactPhone",statut,"createdByUserId","updatedAt")
     values ($1,$2,'Boutique','BIJOUX_ACCESSOIRES','Saif B','20123456','CIN_UNIQUEMENT',$2,now())`,
    [SELLER_ID, USER_ID],
  );
  await insertDocument(DOC_A);
});

afterAll(async () => {
  await db.close();
});

describe('product category (D-33)', () => {
  it('accepts only the fixed list', async () => {
    await expect(
      db.query(`update sellers set "productCategory" = 'Mode' where id = $1`, [SELLER_ID]),
    ).rejects.toThrow(/ProductCategory/);
  });
});

describe('seller documents are never deleted or rewritten (D-32)', () => {
  it('refuses a delete, even from the schema owner', async () => {
    await expect(db.query(`delete from seller_documents where id = $1`, [DOC_A])).rejects.toThrow(
      /jamais supprimés/,
    );
    await expect(db.exec(`truncate seller_documents cascade`)).rejects.toThrow(/jamais supprimés/);
  });

  it('refuses any change to a document', async () => {
    await expect(
      db.query(`update seller_documents set "storageKey" = 'autre' where id = $1`, [DOC_A]),
    ).rejects.toThrow(/ne change pas/);
    await expect(
      db.query(`update seller_documents set sha256 = $2 where id = $1`, [DOC_A, 'b'.repeat(64)]),
    ).rejects.toThrow(/ne change pas/);
  });

  it('keeps one current document per type', async () => {
    await expect(insertDocument(DOC_B)).rejects.toThrow(/seller_documents_current_type_key/);
  });

  it('refuses a replacement that points at nothing, at commit', async () => {
    const ghost = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `update seller_documents set "replacedAt" = now(), "replacedById" = $2 where id = $1`,
          [DOC_A, ghost],
        );
      }),
    ).rejects.toThrow(/seller_documents_replacedById_fkey/);
  });

  it('marks a document replaced then inserts its replacement, in one transaction', async () => {
    // The service's order: the old document stops being current first, so the
    // new one fits the one-current-per-type index; the FK waits for the commit.
    await db.transaction(async (tx) => {
      await tx.query(
        `update seller_documents set "replacedAt" = now(), "replacedById" = $2 where id = $1`,
        [DOC_A, DOC_B],
      );
      await tx.query(
        `insert into seller_documents (id,"sellerId",type,"storageKey","mimeType","sizeBytes",sha256,
           "encryptionKeyId","encryptionIv","encryptionTag","uploadedByUserId")
         values ($1::uuid,$2,'CIN_RECTO',$1::text,'image/png',2000,$3,'k1',
                 decode('000000000000000000000000','hex'),decode('00000000000000000000000000000000','hex'),$4)`,
        [DOC_B, SELLER_ID, SHA, USER_ID],
      );
    });
    const { rows } = await db.query<{ id: string; replacedById: string | null }>(
      `select id, "replacedById" from seller_documents where type = 'CIN_RECTO' order by "uploadedAt", id`,
    );
    expect(rows).toEqual([
      { id: DOC_A, replacedById: DOC_B },
      { id: DOC_B, replacedById: null },
    ]);
  });

  it('never marks a document replaced twice', async () => {
    await expect(
      db.query(
        `update seller_documents set "replacedAt" = now(), "replacedById" = $2 where id = $1`,
        [DOC_A, DOC_A],
      ),
    ).rejects.toThrow(/ne change pas/);
  });

  it('refuses a half-recorded replacement', async () => {
    await insertDocument(DOC_C, 'PATENTE');
    await expect(
      db.query(`update seller_documents set "replacedAt" = now() where id = $1`, [DOC_C]),
    ).rejects.toThrow(/seller_documents_replacement_is_complete/);
  });

  it('refuses a type, a checksum or GCM values that cannot be real', async () => {
    const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await expect(
      insertDocument(id, 'CARTE_AUTO_ENTREPRENEUR', { mime: "'text/html'" }),
    ).rejects.toThrow(/seller_documents_mime_type/);
    await expect(insertDocument(id, 'CARTE_AUTO_ENTREPRENEUR', { sha: "'xyz'" })).rejects.toThrow(
      /seller_documents_sha256_hex/,
    );
    await expect(
      insertDocument(id, 'CARTE_AUTO_ENTREPRENEUR', { iv: "decode('00','hex')" }),
    ).rejects.toThrow(/seller_documents_gcm_sizes/);
    await expect(insertDocument(id, 'CARTE_AUTO_ENTREPRENEUR', { size: '0' })).rejects.toThrow(
      /seller_documents_size_positive/,
    );
  });

  it('gives the application role no DELETE privilege at all', async () => {
    await db.exec('SET ROLE faffago_app;');
    try {
      await expect(db.query(`delete from seller_documents where id = $1`, [DOC_C])).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec('RESET ROLE;');
    }
  });
});
