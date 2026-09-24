import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, SellerDocument } from '@prisma/client';
import {
  SELLER_MESSAGES,
  SellerErrorCode,
  type DocumentMimeType,
  type SellerDocumentType,
} from '@faffago/shared';
import { AuditAction, AuditService, type AuditActor } from '../audit/audit.service';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { DocumentCipher } from '../storage/document-cipher';
import { DOCUMENT_STORAGE, newStorageKey, type DocumentStorage } from '../storage/document-storage';
import { sanitizeDocument } from '../storage/document-sanitizer';

type Tx = Prisma.TransactionClient;

/** A document cleaned, encrypted and on disk, waiting for its row. */
export interface StagedDocument {
  id: string;
  type: SellerDocumentType;
  storageKey: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
  sha256: string;
  keyId: string;
  iv: Buffer;
  tag: Buffer;
}

/** What the admin's seller page lists; never the file itself. */
export interface SellerDocumentView {
  id: string;
  type: SellerDocumentType;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  replacedAt: Date | null;
}

export function documentView(document: SellerDocument): SellerDocumentView {
  return {
    id: document.id,
    type: document.type,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt,
    replacedAt: document.replacedAt,
  };
}

/**
 * CIN, patente and auto-entrepreneur card (D-32). A file and its row cannot
 * be written atomically, so the order is: clean, encrypt and write the file
 * (`stage`), then insert the row in the caller's transaction (`record`), and
 * remove the file if that transaction fails (`discard`). A crash between the
 * two leaves a file without a row, which `documents:verify` reports; never a
 * row without its file.
 */
@Injectable()
export class SellerDocumentsService {
  private readonly logger = new Logger(SellerDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cipher: DocumentCipher,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async stage(type: SellerDocumentType, upload: Buffer): Promise<StagedDocument> {
    const clean = await sanitizeDocument(upload);
    const storageKey = newStorageKey();
    const sealed = this.cipher.seal(clean.bytes, storageKey);
    await this.storage.put(storageKey, sealed.ciphertext);
    return {
      // The row's id is the storage key: one name for the document everywhere.
      id: storageKey,
      type,
      storageKey,
      mimeType: clean.mimeType,
      sizeBytes: clean.bytes.length,
      sha256: createHash('sha256').update(sealed.ciphertext).digest('hex'),
      keyId: sealed.keyId,
      iv: sealed.iv,
      tag: sealed.tag,
    };
  }

  /** Stages every upload, or none: a failure removes the files already written. */
  async stageAll(
    uploads: readonly { type: SellerDocumentType; bytes: Buffer }[],
  ): Promise<StagedDocument[]> {
    const staged: StagedDocument[] = [];
    try {
      for (const upload of uploads) staged.push(await this.stage(upload.type, upload.bytes));
      return staged;
    } catch (error) {
      await this.discard(staged);
      throw error;
    }
  }

  async discard(staged: readonly StagedDocument[]): Promise<void> {
    for (const document of staged) {
      await this.storage.discard(document.storageKey).catch((error: unknown) => {
        // Left as an orphan file, which documents:verify reports.
        this.logger.error(`Fichier ${document.storageKey} non supprimé : ${String(error)}`);
      });
    }
  }

  /**
   * Inserts the rows, each replacing the seller's current document of its
   * type, and audits every upload. In the caller's transaction.
   */
  async record(
    tx: Tx,
    sellerId: string,
    staged: readonly StagedDocument[],
    actor: AuditActor,
    meta: RequestMeta,
  ): Promise<void> {
    for (const document of staged) {
      const current = await tx.sellerDocument.findFirst({
        where: { sellerId, type: document.type, replacedAt: null },
      });
      if (current) {
        // Marked first, so the new one fits the one-current-per-type index;
        // the reference to it is checked at commit.
        await tx.sellerDocument.update({
          where: { id: current.id },
          data: { replacedAt: this.clock.now(), replacedById: document.id },
        });
      }
      await tx.sellerDocument.create({
        data: {
          id: document.id,
          sellerId,
          type: document.type,
          storageKey: document.storageKey,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          sha256: document.sha256,
          encryptionKeyId: document.keyId,
          encryptionIv: new Uint8Array(document.iv),
          encryptionTag: new Uint8Array(document.tag),
          uploadedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: AuditAction.AJOUT_DOCUMENT_VENDEUR,
        entityType: 'seller',
        entityId: sellerId,
        after: {
          documentId: document.id,
          type: document.type,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          sha256: document.sha256,
          replaces: current?.id ?? null,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
  }

  /** Admin only, by the route. Every view is audited (D-32). */
  async read(
    sellerId: string,
    documentId: string,
    actor: AuditActor,
    meta: RequestMeta,
  ): Promise<{ bytes: Buffer; document: SellerDocument }> {
    const document = await this.prisma.sellerDocument.findFirst({
      where: { id: documentId, sellerId },
    });
    if (!document) {
      throw apiError(
        404,
        SellerErrorCode.DOCUMENT_INTROUVABLE,
        SELLER_MESSAGES.documentIntrouvable,
      );
    }
    const bytes = this.cipher.open(
      {
        keyId: document.encryptionKeyId,
        iv: Buffer.from(document.encryptionIv),
        tag: Buffer.from(document.encryptionTag),
        ciphertext: await this.storage.get(document.storageKey),
      },
      document.storageKey,
    );
    // Recorded once the file is known to open: the entry means "was shown".
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        actor,
        action: AuditAction.CONSULTATION_DOCUMENT_VENDEUR,
        entityType: 'seller',
        entityId: sellerId,
        after: { documentId: document.id, type: document.type },
        ip: meta.ip,
        userAgent: meta.userAgent,
      }),
    );
    return { bytes, document };
  }
}
