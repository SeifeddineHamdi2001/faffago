import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Seller, SellerDocument, User } from '@prisma/client';
import {
  Permission,
  Role,
  CONTACT_DOCUMENTS,
  SELLER_MESSAGES,
  STATUT_DOCUMENT,
  SellerAccountState,
  SellerErrorCode,
  can,
  checkDocumentSet,
  requiredDocumentsFor,
  type ChangeSellerContactValues,
  type ChangeSellerStatutValues,
  type CreateSellerValues,
  type ProductCategory,
  type SellerDocumentType,
  type UpdateSellerValues,
  SellerStatut,
} from '@faffago/shared';
import {
  identifiantDejaUtilise,
  telephoneDejaUtilise,
  withUniqueAccountErrors,
} from '../accounts/account-errors';
import { AuditAction, AuditService, type AuditActor } from '../audit/audit.service';
import { PasswordsService } from '../auth/passwords.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SellerDocumentsService,
  documentView,
  type SellerDocumentView,
  type StagedDocument,
} from './seller-documents.service';

type Tx = Prisma.TransactionClient;

/** What Dépôt and Service client read about a seller (D-11). */
export interface SellerContactView {
  id: string;
  shopName: string;
  contactFullName: string;
  contactPhone: string;
}

/** The admin's view: adds the login email, the fiscal statut and the state. */
export interface SellerAdminView extends SellerContactView {
  userId: string;
  email: string | null;
  productCategory: ProductCategory;
  storeLink: string | null;
  contactFirstName: string;
  contactLastName: string;
  statut: string;
  accountState: string;
  createdAt: Date;
}

/** The seller page for the admin, with the list of documents (never the files). */
export interface SellerDetailView extends SellerAdminView {
  documents: SellerDocumentView[];
  /** Printed on the retenue certificates: admin only, like the documents (D-89). */
  cinNumber: string | null;
}

/** An uploaded file as the controller hands it over. */
export interface Upload {
  type: SellerDocumentType;
  bytes: Buffer;
}

type SellerWithUser = Seller & { user: User };

function contactView(seller: Seller): SellerContactView {
  return {
    id: seller.id,
    shopName: seller.shopName,
    contactFullName: seller.contactFullName,
    contactPhone: seller.contactPhone,
  };
}

function adminView(seller: SellerWithUser): SellerAdminView {
  return {
    ...contactView(seller),
    userId: seller.userId,
    email: seller.user.email,
    productCategory: seller.productCategory,
    storeLink: seller.storeLink,
    contactFirstName: seller.user.firstName,
    contactLastName: seller.user.lastName,
    statut: seller.statut,
    accountState: seller.accountState,
    createdAt: seller.createdAt,
  };
}

function actorOf(principal: UserPrincipal): AuditActor {
  return { userId: principal.userId, role: principal.role };
}

const vendeurIntrouvable = () =>
  apiError(404, SellerErrorCode.VENDEUR_INTROUVABLE, SELLER_MESSAGES.vendeurIntrouvable);
const documentManquant = (types: SellerDocumentType[]) =>
  apiError(400, SellerErrorCode.DOCUMENT_MANQUANT, SELLER_MESSAGES.documentManquant(types), {
    documents: types,
  });
const documentInattendu = (types: SellerDocumentType[]) =>
  apiError(400, SellerErrorCode.DOCUMENT_INATTENDU, SELLER_MESSAGES.documentInattendu(types), {
    documents: types,
  });

/**
 * Seller accounts (Vendeur 2.2, Admin 4.14). The admin creates them with the
 * CIN documents; Dépôt and Service client read the shop and the contact only
 * (D-11). Every change and its audit entry commit together; a document file
 * written for a change that fails is removed.
 */
@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordsService,
    private readonly documents: SellerDocumentsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(role: Role): Promise<(SellerContactView | SellerAdminView)[]> {
    const sellers = await this.prisma.seller.findMany({
      orderBy: { shopName: 'asc' },
      include: { user: true },
    });
    // The seller's email is his login identifier: admin only (D-11).
    const withEmail = can(role, Permission.VENDEURS_EMAIL);
    return sellers.map((seller) => (withEmail ? adminView(seller) : contactView(seller)));
  }

  async detail(role: Role, sellerId: string): Promise<SellerContactView | SellerDetailView> {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: { user: true, documents: { orderBy: [{ type: 'asc' }, { uploadedAt: 'desc' }] } },
    });
    if (!seller) throw vendeurIntrouvable();
    if (!can(role, Permission.VENDEURS_EMAIL)) return contactView(seller);
    return {
      ...adminView(seller),
      documents: can(role, Permission.VENDEURS_DOCUMENTS) ? seller.documents.map(documentView) : [],
      cinNumber: can(role, Permission.VENDEURS_DOCUMENTS) ? seller.cinNumber : null,
    };
  }

  /**
   * Créer un vendeur. CIN front and back always, plus the statut's own
   * document, in the same request: no account exists without them (D-33).
   */
  async create(
    principal: UserPrincipal,
    values: CreateSellerValues,
    uploads: Upload[],
    meta: RequestMeta,
  ): Promise<{ seller: SellerAdminView; password: string }> {
    this.assertDocumentSet(
      values.statut,
      uploads.map((upload) => upload.type),
    );
    // Cheap checks before any file is written; the transaction checks again.
    await this.assertLoginFree(this.prisma, values.email, values.contactPhone);

    const password = this.passwords.generate();
    const passwordHash = await this.passwords.hash(password);
    const ordered = requiredDocumentsFor(values.statut).map((type) =>
      uploads.find((upload) => upload.type === type)!,
    );
    const staged = await this.documents.stageAll(ordered);
    const actor = actorOf(principal);

    const seller = await this.keepingFilesOnlyIfCommitted(staged, () =>
      withUniqueAccountErrors(() =>
        this.prisma.$transaction(async (tx) => {
          await this.assertLoginFree(tx, values.email, values.contactPhone);
          const user = await tx.user.create({
            data: {
              role: Role.VENDEUR,
              email: values.email,
              phone: values.contactPhone,
              firstName: values.contactFirstName,
              lastName: values.contactLastName,
              passwordHash,
            },
          });
          const created = await tx.seller.create({
            data: {
              userId: user.id,
              shopName: values.shopName,
              productCategory: values.productCategory,
              storeLink: values.storeLink ?? null,
              contactFullName: `${values.contactFirstName} ${values.contactLastName}`,
              contactPhone: values.contactPhone,
              statut: values.statut,
              cinNumber: values.cinNumber ?? null,
              createdByUserId: principal.userId,
            },
            include: { user: true },
          });
          await this.audit.record(tx, {
            actor,
            action: AuditAction.CREATION_COMPTE,
            entityType: 'user',
            entityId: user.id,
            after: {
              role: user.role,
              email: user.email,
              phone: user.phone,
              firstName: user.firstName,
              lastName: user.lastName,
              sellerId: created.id,
              shopName: created.shopName,
              productCategory: created.productCategory,
              storeLink: created.storeLink,
              statut: created.statut,
              cinNumber: created.cinNumber,
            },
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
          await this.documents.record(tx, created.id, staged, actor, meta);
          return created;
        }),
      ),
    );
    return { seller: adminView(seller), password };
  }

  /** Shop and contact corrections. The contact phone is also the seller's login phone. */
  async update(
    principal: UserPrincipal,
    sellerId: string,
    values: UpdateSellerValues,
    meta: RequestMeta,
  ): Promise<SellerAdminView> {
    return withUniqueAccountErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const seller = await this.lockSeller(tx, sellerId);
        const beforeView = adminView(seller);
        const next = { ...beforeView, ...values };

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const key of Object.keys(values) as (keyof UpdateSellerValues)[]) {
          if (values[key] === undefined || beforeView[key] === next[key]) continue;
          before[key] = beforeView[key];
          after[key] = next[key];
        }
        if (Object.keys(after).length === 0) return beforeView;

        if (after.email !== undefined || after.contactPhone !== undefined) {
          await this.assertLoginFree(tx, next.email!, next.contactPhone, seller.userId);
        }
        await tx.user.update({
          where: { id: seller.userId },
          data: {
            email: next.email,
            phone: next.contactPhone,
            firstName: next.contactFirstName,
            lastName: next.contactLastName,
          },
        });
        const updated = await tx.seller.update({
          where: { id: sellerId },
          data: {
            shopName: next.shopName,
            productCategory: next.productCategory,
            storeLink: next.storeLink ?? null,
            contactFullName: `${next.contactFirstName} ${next.contactLastName}`,
            contactPhone: next.contactPhone,
          },
          include: { user: true },
        });
        await this.audit.record(tx, {
          actor: actorOf(principal),
          action: AuditAction.MODIFICATION_VENDEUR,
          entityType: 'seller',
          entityId: sellerId,
          before: before as Prisma.InputJsonValue,
          after: after as Prisma.InputJsonValue,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        return adminView(updated);
      }),
    );
  }

  /**
   * Changer le statut (D-33, D-34). Patente and Auto-entrepreneur come with
   * their document in the same action. The retenue follows from the next bon
   * prepared; a bon already prepared keeps the statut it snapshotted.
   */
  async changeStatut(
    principal: UserPrincipal,
    sellerId: string,
    values: ChangeSellerStatutValues,
    upload: Buffer | null,
    meta: RequestMeta,
  ): Promise<SellerAdminView> {
    const needed = STATUT_DOCUMENT[values.statut];
    if (needed && !upload) throw documentManquant([needed]);
    if (!needed && upload) throw documentInattendu([]);

    const current = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!current) throw vendeurIntrouvable();
    if (current.statut === values.statut) throw this.statutInchange();
    // CIN uniquement: the certificates print his CIN number (D-89).
    if (values.statut === SellerStatut.CIN_UNIQUEMENT && !values.cinNumber && !current.cinNumber) {
      throw apiError(400, SellerErrorCode.CIN_OBLIGATOIRE, SELLER_MESSAGES.cinObligatoire);
    }

    const staged =
      needed && upload ? await this.documents.stageAll([{ type: needed, bytes: upload }]) : [];
    const actor = actorOf(principal);
    return this.keepingFilesOnlyIfCommitted(staged, () =>
      this.prisma.$transaction(async (tx) => {
        const seller = await this.lockSeller(tx, sellerId);
        if (seller.statut === values.statut) throw this.statutInchange();
        const updated = await tx.seller.update({
          where: { id: sellerId },
          data: {
            statut: values.statut,
            ...(values.cinNumber ? { cinNumber: values.cinNumber } : {}),
          },
          include: { user: true },
        });
        await this.audit.record(tx, {
          actor,
          action: AuditAction.CHANGEMENT_STATUT_VENDEUR,
          entityType: 'seller',
          entityId: sellerId,
          before: { statut: seller.statut, cinNumber: seller.cinNumber },
          after: {
            statut: values.statut,
            documentId: staged[0]?.id ?? null,
            cinNumber: updated.cinNumber,
          },
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        await this.documents.record(tx, sellerId, staged, actor, meta);
        return adminView(updated);
      }),
    );
  }

  /** Numéro de CIN (D-89): recorded or corrected by the admin, audited. */
  async setCinNumber(
    principal: UserPrincipal,
    sellerId: string,
    cinNumber: string,
    meta: RequestMeta,
  ): Promise<{ cinNumber: string }> {
    return this.prisma.$transaction(async (tx) => {
      const seller = await this.lockSeller(tx, sellerId);
      if (seller.cinNumber === cinNumber) return { cinNumber };
      await tx.seller.update({ where: { id: sellerId }, data: { cinNumber } });
      await this.audit.record(tx, {
        actor: actorOf(principal),
        action: AuditAction.MODIFICATION_CIN_VENDEUR,
        entityType: 'seller',
        entityId: sellerId,
        before: { cinNumber: seller.cinNumber },
        after: { cinNumber },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { cinNumber };
    });
  }

  /**
   * Changer de contact (D-42): a different person becomes the contact, with
   * his CIN front and back in the same action. The previous CIN stays as a
   * replaced version. The login email belongs to the account and is kept.
   */
  async changeContact(
    principal: UserPrincipal,
    sellerId: string,
    values: ChangeSellerContactValues,
    uploads: Upload[],
    meta: RequestMeta,
  ): Promise<SellerAdminView> {
    const provided = uploads.map((upload) => upload.type);
    const unexpected = provided.filter((type) => !CONTACT_DOCUMENTS.includes(type));
    if (unexpected.length > 0) throw documentInattendu(unexpected);
    const missing = CONTACT_DOCUMENTS.filter((type) => !provided.includes(type));
    if (missing.length > 0) throw documentManquant(missing);

    const current = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!current) throw vendeurIntrouvable();
    await this.assertPhoneFree(this.prisma, values.contactPhone, current.userId);

    const staged = await this.documents.stageAll(
      CONTACT_DOCUMENTS.map((type) => uploads.find((upload) => upload.type === type)!),
    );
    const actor = actorOf(principal);
    return this.keepingFilesOnlyIfCommitted(staged, () =>
      withUniqueAccountErrors(() =>
        this.prisma.$transaction(async (tx) => {
          const seller = await this.lockSeller(tx, sellerId);
          await this.assertPhoneFree(tx, values.contactPhone, seller.userId);
          await tx.user.update({
            where: { id: seller.userId },
            data: {
              firstName: values.contactFirstName,
              lastName: values.contactLastName,
              phone: values.contactPhone,
            },
          });
          const contactFullName = `${values.contactFirstName} ${values.contactLastName}`;
          const updated = await tx.seller.update({
            where: { id: sellerId },
            data: { contactFullName, contactPhone: values.contactPhone },
            include: { user: true },
          });
          await this.audit.record(tx, {
            actor,
            action: AuditAction.CHANGEMENT_CONTACT_VENDEUR,
            entityType: 'seller',
            entityId: sellerId,
            before: { contactFullName: seller.contactFullName, contactPhone: seller.contactPhone },
            after: {
              contactFullName,
              contactPhone: values.contactPhone,
              documentIds: staged.map((document) => document.id),
            },
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
          await this.documents.record(tx, sellerId, staged, actor, meta);
          return adminView(updated);
        }),
      ),
    );
  }

  /**
   * Adds a document, replacing the current one of its type; the old version
   * is kept (D-32). Only the documents the seller's statut calls for.
   */
  async addDocument(
    principal: UserPrincipal,
    sellerId: string,
    type: SellerDocumentType,
    upload: Buffer,
    meta: RequestMeta,
  ): Promise<SellerDocumentView> {
    const current = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!current) throw vendeurIntrouvable();
    if (!requiredDocumentsFor(current.statut).includes(type)) throw documentInattendu([type]);

    const staged = await this.documents.stageAll([{ type, bytes: upload }]);
    const actor = actorOf(principal);
    return this.keepingFilesOnlyIfCommitted(staged, () =>
      this.prisma.$transaction(async (tx) => {
        const seller = await this.lockSeller(tx, sellerId);
        if (!requiredDocumentsFor(seller.statut).includes(type)) throw documentInattendu([type]);
        await this.documents.record(tx, sellerId, staged, actor, meta);
        const created = await tx.sellerDocument.findUniqueOrThrow({ where: { id: staged[0]!.id } });
        return documentView(created);
      }),
    );
  }

  /** Vendeur 2.5: a suspended seller keeps his access, but creates nothing new (D-25). */
  async setAccountState(
    principal: UserPrincipal,
    sellerId: string,
    state: SellerAccountState,
    meta: RequestMeta,
  ): Promise<SellerAdminView> {
    return this.prisma.$transaction(async (tx) => {
      const seller = await this.lockSeller(tx, sellerId);
      if (seller.accountState === state) {
        throw state === SellerAccountState.SUSPENDU
          ? apiError(409, SellerErrorCode.COMPTE_DEJA_SUSPENDU, SELLER_MESSAGES.compteDejaSuspendu)
          : apiError(409, SellerErrorCode.COMPTE_DEJA_ACTIF, SELLER_MESSAGES.compteDejaActif);
      }
      const updated = await tx.seller.update({
        where: { id: sellerId },
        data: { accountState: state },
        include: { user: true },
      });
      await this.audit.record(tx, {
        actor: actorOf(principal),
        action:
          state === SellerAccountState.SUSPENDU
            ? AuditAction.SUSPENSION_VENDEUR
            : AuditAction.REACTIVATION_VENDEUR,
        entityType: 'seller',
        entityId: sellerId,
        before: { accountState: seller.accountState },
        after: { accountState: state, at: this.clock.now().toISOString() },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await this.notifications.send(
        tx,
        { sellerId },
        state === SellerAccountState.SUSPENDU ? 'COMPTE_SUSPENDU' : 'COMPTE_REACTIVE',
        {},
      );
      return adminView(updated);
    });
  }

  readDocument(
    principal: UserPrincipal,
    sellerId: string,
    documentId: string,
    meta: RequestMeta,
  ): Promise<{ bytes: Buffer; document: SellerDocument }> {
    return this.documents.read(sellerId, documentId, actorOf(principal), meta);
  }

  // ── helpers ────────────────────────────────────────────────

  private assertDocumentSet(
    statut: CreateSellerValues['statut'],
    provided: SellerDocumentType[],
  ): void {
    const { missing, unexpected } = checkDocumentSet(statut, provided);
    if (unexpected.length > 0) throw documentInattendu(unexpected);
    if (missing.length > 0) throw documentManquant(missing);
  }

  /** Emails are unique across accounts; two sellers never share a phone (Q8, Q13). */
  private async assertLoginFree(
    db: Tx,
    email: string,
    phone: string,
    exceptUserId?: string,
  ): Promise<void> {
    const except = exceptUserId ? { id: { not: exceptUserId } } : {};
    if (await db.user.findFirst({ where: { email, ...except } })) throw identifiantDejaUtilise();
    if (await db.user.findFirst({ where: { phone, role: Role.VENDEUR, ...except } })) {
      throw telephoneDejaUtilise();
    }
  }

  private async assertPhoneFree(db: Tx, phone: string, exceptUserId: string): Promise<void> {
    const taken = await db.user.findFirst({
      where: { phone, role: Role.VENDEUR, id: { not: exceptUserId } },
    });
    if (taken) throw telephoneDejaUtilise();
  }

  private async lockSeller(tx: Tx, sellerId: string): Promise<SellerWithUser> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM sellers WHERE id = ${sellerId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw vendeurIntrouvable();
    return tx.seller.findUniqueOrThrow({ where: { id: sellerId }, include: { user: true } });
  }

  private statutInchange() {
    return apiError(409, SellerErrorCode.STATUT_INCHANGE, SELLER_MESSAGES.statutInchange);
  }

  /** Runs the transaction; if it fails, the files staged for it are removed. */
  private async keepingFilesOnlyIfCommitted<T>(
    staged: StagedDocument[],
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      await this.documents.discard(staged);
      throw error;
    }
  }
}
