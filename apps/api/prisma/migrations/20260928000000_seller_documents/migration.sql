-- Phase 4, step 1: seller accounts and their documents (D-32, D-33).

-- ─────────────────────────────────────────────────────────────
-- Product category: a fixed list (D-33)
--
-- It was free text. No production database exists yet; any value that is not
-- one of the new codes (the demo seller's "Démo", test fixtures) becomes AUTRE.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "ProductCategory" AS ENUM (
  'MODE_VETEMENTS',
  'CHAUSSURES',
  'BIJOUX_ACCESSOIRES',
  'BEAUTE_COSMETIQUE',
  'ELECTRONIQUE',
  'MAISON_DECO',
  'ENFANTS_BEBES',
  'SPORT',
  'ALIMENTATION',
  'AUTRE'
);

ALTER TABLE "sellers" ALTER COLUMN "productCategory" TYPE "ProductCategory" USING (
  CASE
    WHEN "productCategory" IN ('MODE_VETEMENTS', 'CHAUSSURES', 'BIJOUX_ACCESSOIRES',
      'BEAUTE_COSMETIQUE', 'ELECTRONIQUE', 'MAISON_DECO', 'ENFANTS_BEBES', 'SPORT',
      'ALIMENTATION', 'AUTRE')
    THEN "productCategory"
    ELSE 'AUTRE'
  END
)::"ProductCategory";

-- ─────────────────────────────────────────────────────────────
-- Seller documents: encrypted, kept, replaced but never rewritten (D-32)
--
-- No document was ever stored before this migration (there was no upload), so
-- the new NOT NULL columns need no default.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "seller_documents"
  ADD COLUMN "sha256" CHAR(64) NOT NULL,
  ADD COLUMN "encryptionKeyId" TEXT NOT NULL,
  ADD COLUMN "encryptionIv" BYTEA NOT NULL,
  ADD COLUMN "encryptionTag" BYTEA NOT NULL,
  ADD COLUMN "replacedAt" TIMESTAMP(3),
  ADD COLUMN "replacedById" UUID;

-- Deferred: the old document is marked replaced first (one current document
-- per type), then its replacement is inserted, in the same transaction.
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_replacedById_fkey"
  FOREIGN KEY ("replacedById") REFERENCES "seller_documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX "seller_documents_replacedById_key" ON "seller_documents"("replacedById");

-- One current document of each type per seller; replaced ones pile up beside it.
CREATE UNIQUE INDEX "seller_documents_current_type_key"
  ON "seller_documents"("sellerId", "type") WHERE "replacedAt" IS NULL;

ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_replacement_is_complete"
  CHECK (("replacedAt" IS NULL) = ("replacedById" IS NULL));
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_not_its_own_replacement"
  CHECK ("replacedById" IS NULL OR "replacedById" <> "id");
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_mime_type"
  CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'application/pdf'));
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_size_positive"
  CHECK ("sizeBytes" > 0);
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_sha256_hex"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_gcm_sizes"
  CHECK (octet_length("encryptionIv") = 12 AND octet_length("encryptionTag") = 16);

-- A document row is never deleted, and never changed except to be marked
-- replaced, once. Holds for every role, the schema owner included, like the
-- append-only tables: the row is what makes its file readable.
CREATE OR REPLACE FUNCTION faffago_seller_document_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Les documents vendeur ne sont jamais supprimés (%)', TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."replacedAt" IS NULL
     AND NEW."replacedAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'replacedAt' - 'replacedById')
       = (to_jsonb(OLD) - 'replacedAt' - 'replacedById') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un document vendeur ne change pas : seul son remplacement est enregistré, une fois'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "seller_documents_guard"
  BEFORE UPDATE OR DELETE ON "seller_documents"
  FOR EACH ROW EXECUTE FUNCTION faffago_seller_document_guard();

CREATE TRIGGER "seller_documents_no_truncate"
  BEFORE TRUNCATE ON "seller_documents"
  FOR EACH STATEMENT EXECUTE FUNCTION faffago_seller_document_guard();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faffago_app') THEN
    RAISE NOTICE 'Rôle faffago_app absent : privilèges non appliqués (développement local).';
    RETURN;
  END IF;
  EXECUTE 'REVOKE DELETE, TRUNCATE ON TABLE seller_documents FROM faffago_app';
END;
$$;
