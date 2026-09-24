import { Injectable } from '@nestjs/common';
import { Prisma, type Delegation, type Gouvernorat, type Localite } from '@prisma/client';
import {
  normalizeForMatch,
  type CreateLocaliteValues,
  type UpdateDelegationValues,
  type UpdateGouvernoratValues,
  type UpdateLocaliteValues,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

/** What every screen needs of a localité; never the seed key. */
export interface LocaliteView {
  id: string;
  nameFr: string;
  nameAr: string | null;
  postalCode: string | null;
  aliases: string[];
  isOther: boolean;
}

export interface LocaliteAdminView extends LocaliteView {
  delegationId: string;
  isActive: boolean;
}

export interface GeoTree {
  gouvernorats: Array<{
    code: string;
    nameFr: string;
    nameAr: string;
    delegations: Array<{
      id: string;
      code: string;
      nameFr: string;
      nameAr: string;
      localites: LocaliteView[];
    }>;
  }>;
}

const localiteIntrouvable = () => apiError(404, 'LOCALITE_INTROUVABLE', 'Localité introuvable.');
const delegationIntrouvable = () =>
  apiError(404, 'DELEGATION_INTROUVABLE', 'Délégation introuvable.');
const gouvernoratIntrouvable = () =>
  apiError(404, 'GOUVERNORAT_INTROUVABLE', 'Gouvernorat introuvable.');
const gouvernoratExiste = (name: string) =>
  apiError(409, 'GOUVERNORAT_EXISTE', `Un gouvernorat s’appelle déjà « ${name} ».`);
const delegationExiste = (name: string) =>
  apiError(409, 'DELEGATION_EXISTE', `Ce gouvernorat a déjà une délégation « ${name} ».`);
const zoneIntrouvable = () => apiError(404, 'ZONE_INTROUVABLE', 'Zone introuvable.');
const zoneInactive = () =>
  apiError(409, 'ZONE_INACTIVE', 'Cette zone est désactivée : réactivez-la d’abord.');
const localiteExiste = (name: string) =>
  apiError(409, 'LOCALITE_EXISTE', `Cette délégation a déjà une localité « ${name} ».`);
const autreFixe = () =>
  apiError(
    409,
    'LOCALITE_AUTRE_FIXE',
    'La localité « Autre » ne peut être ni renommée ni désactivée.',
  );

function view(localite: Localite): LocaliteView {
  return {
    id: localite.id,
    nameFr: localite.nameFr,
    nameAr: localite.nameAr,
    postalCode: localite.postalCode,
    aliases: localite.aliases,
    isOther: localite.isOther,
  };
}

function adminView(localite: Localite): LocaliteAdminView {
  return { ...view(localite), delegationId: localite.delegationId, isActive: localite.isActive };
}

/** Paramètres › Géographie (D-51): what the admin reads and changes. */
export interface GeographyAdminView {
  id: string;
  code: string;
  nameFr: string;
  nameAr: string;
  delegations: Array<{
    id: string;
    code: string;
    nameFr: string;
    nameAr: string;
    isActive: boolean;
    zone: { id: string; name: string } | null;
    localiteCount: number;
  }>;
}

function gouvernoratView(row: Gouvernorat) {
  return { id: row.id, code: row.code, nameFr: row.nameFr, nameAr: row.nameAr };
}

function delegationView(row: Delegation) {
  return {
    id: row.id,
    code: row.code,
    nameFr: row.nameFr,
    nameAr: row.nameAr,
    zoneId: row.zoneId,
  };
}

/** Only the fields a change touched, for the audit entry's before and after. */
function picked(source: object, keys: readonly string[]): Prisma.InputJsonObject {
  const values = source as Record<string, unknown>;
  return Object.fromEntries(
    keys.map((key) => [key, values[key] ?? null]),
  ) as Prisma.InputJsonObject;
}

/** Autre last, then by French name: the order of every list (D-17). */
function byListOrder(a: Localite, b: Localite): number {
  if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
  return a.nameFr.localeCompare(b.nameFr, 'fr');
}

/**
 * Gouvernorats, délégations and localités (D-17). The tree is read by every
 * form and by the courier app, so it is cached in memory and rebuilt after
 * each change the admin makes: one API process, as for the login throttle (D-6).
 */
@Injectable()
export class GeoService {
  private cachedTree: GeoTree | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async tree(): Promise<GeoTree> {
    if (this.cachedTree) return this.cachedTree;
    const gouvernorats = await this.prisma.gouvernorat.findMany({
      where: { isActive: true },
      orderBy: { nameFr: 'asc' },
      include: {
        delegations: {
          where: { isActive: true },
          orderBy: { nameFr: 'asc' },
          include: { localites: { where: { isActive: true } } },
        },
      },
    });
    this.cachedTree = {
      gouvernorats: gouvernorats.map((g) => ({
        code: g.code,
        nameFr: g.nameFr,
        nameAr: g.nameAr,
        delegations: g.delegations.map((d) => ({
          id: d.id,
          code: d.code,
          nameFr: d.nameFr,
          nameAr: d.nameAr,
          localites: [...d.localites].sort(byListOrder).map(view),
        })),
      })),
    };
    return this.cachedTree;
  }

  /** Paramètres › Localités: deactivated ones included, so they can be reactivated. */
  async listForAdmin(delegationId?: string): Promise<LocaliteAdminView[]> {
    const rows = await this.prisma.localite.findMany({
      where: delegationId ? { delegationId } : {},
    });
    return rows.sort(byListOrder).map(adminView);
  }

  async create(
    actor: UserPrincipal,
    input: CreateLocaliteValues,
    meta: RequestMeta,
  ): Promise<LocaliteAdminView> {
    const created = await this.prisma.$transaction(async (tx) => {
      const delegation = await tx.delegation.findUnique({ where: { id: input.delegationId } });
      if (!delegation) throw delegationIntrouvable();
      await this.assertNameFree(tx, delegation.id, input.nameFr);

      const row = await tx.localite.create({
        data: {
          delegationId: delegation.id,
          nameFr: input.nameFr,
          nameAr: input.nameAr || null,
          postalCode: input.postalCode ?? null,
          aliases: input.aliases,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.CREATION_LOCALITE,
        entityType: 'localite',
        entityId: row.id,
        after: { ...adminView(row), delegationCode: delegation.code },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    this.cachedTree = null;
    return adminView(created);
  }

  async update(
    actor: UserPrincipal,
    id: string,
    input: UpdateLocaliteValues,
    meta: RequestMeta,
  ): Promise<LocaliteAdminView> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.localite.findUnique({ where: { id } });
      if (!current) throw localiteIntrouvable();
      if (
        current.isOther &&
        ((input.nameFr !== undefined && input.nameFr !== current.nameFr) ||
          input.isActive === false)
      ) {
        throw autreFixe();
      }
      if (input.nameFr !== undefined && input.nameFr !== current.nameFr) {
        await this.assertNameFree(tx, current.delegationId, input.nameFr, current.id);
      }

      const data: Prisma.LocaliteUpdateInput = {};
      if (input.nameFr !== undefined) data.nameFr = input.nameFr;
      if (input.nameAr !== undefined) data.nameAr = input.nameAr || null;
      if (input.postalCode !== undefined) data.postalCode = input.postalCode;
      if (input.aliases !== undefined) data.aliases = input.aliases;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const row = await tx.localite.update({ where: { id }, data });
      const changed = Object.keys(data) as Array<keyof LocaliteAdminView>;
      const pick = (source: LocaliteAdminView) =>
        Object.fromEntries(changed.map((key) => [key, source[key]])) as Prisma.InputJsonObject;
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MODIFICATION_LOCALITE,
        entityType: 'localite',
        entityId: id,
        before: pick(adminView(current)),
        after: pick(adminView(row)),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    this.cachedTree = null;
    return adminView(updated);
  }

  /**
   * Paramètres › Géographie (D-51): every gouvernorat and délégation, active
   * or not, with the délégation's zone and how many localités it has.
   */
  async geographyForAdmin(): Promise<GeographyAdminView[]> {
    const gouvernorats = await this.prisma.gouvernorat.findMany({
      orderBy: { nameFr: 'asc' },
      include: {
        delegations: {
          orderBy: { nameFr: 'asc' },
          include: {
            zone: { select: { id: true, name: true } },
            _count: { select: { localites: true } },
          },
        },
      },
    });
    return gouvernorats.map((g) => ({
      ...gouvernoratView(g),
      delegations: g.delegations.map((d) => ({
        id: d.id,
        code: d.code,
        nameFr: d.nameFr,
        nameAr: d.nameAr,
        isActive: d.isActive,
        zone: d.zone,
        localiteCount: d._count.localites,
      })),
    }));
  }

  /** Rename in French and Arabic; never add nor deactivate (D-51). */
  async updateGouvernorat(
    actor: UserPrincipal,
    id: string,
    input: UpdateGouvernoratValues,
    meta: RequestMeta,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.gouvernorat.findUnique({ where: { id } });
      if (!current) throw gouvernoratIntrouvable();
      if (input.nameFr !== undefined) {
        const needle = normalizeForMatch(input.nameFr);
        const others = await tx.gouvernorat.findMany({ where: { id: { not: id } } });
        const clash = others.find((other) => normalizeForMatch(other.nameFr) === needle);
        if (clash) throw gouvernoratExiste(clash.nameFr);
      }
      const row = await tx.gouvernorat.update({ where: { id }, data: input });
      const keys = Object.keys(input);
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MODIFICATION_GOUVERNORAT,
        entityType: 'gouvernorat',
        entityId: id,
        before: picked(current, keys),
        after: picked(row, keys),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    this.cachedTree = null;
    return gouvernoratView(updated);
  }

  /** Rename in French and Arabic, and move to another zone or to none (D-51). */
  async updateDelegation(
    actor: UserPrincipal,
    id: string,
    input: UpdateDelegationValues,
    meta: RequestMeta,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.delegation.findUnique({ where: { id } });
      if (!current) throw delegationIntrouvable();
      if (input.nameFr !== undefined) {
        const needle = normalizeForMatch(input.nameFr);
        const siblings = await tx.delegation.findMany({
          where: { gouvernoratId: current.gouvernoratId, id: { not: id } },
        });
        const clash = siblings.find((sibling) => normalizeForMatch(sibling.nameFr) === needle);
        if (clash) throw delegationExiste(clash.nameFr);
      }
      if (input.zoneId) {
        const zone = await tx.zone.findUnique({ where: { id: input.zoneId } });
        if (!zone) throw zoneIntrouvable();
        if (!zone.isActive) throw zoneInactive();
      }
      const row = await tx.delegation.update({ where: { id }, data: input });
      const keys = Object.keys(input);
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MODIFICATION_DELEGATION,
        entityType: 'delegation',
        entityId: id,
        before: picked(delegationView(current), keys),
        after: picked(delegationView(row), keys),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    this.cachedTree = null;
    return delegationView(updated);
  }

  /**
   * The parcels filed under Autre (D-17): what the admin reads to decide which
   * localités are missing from the list.
   */
  async parcelsUnderAutre() {
    const parcels = await this.prisma.parcel.findMany({
      where: { localite: { isOther: true } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        code: true,
        address: true,
        landmark: true,
        status: true,
        createdAt: true,
        delegation: { select: { code: true, nameFr: true } },
        seller: { select: { shopName: true } },
      },
    });
    return parcels.map(({ seller, ...parcel }) => ({ ...parcel, shopName: seller.shopName }));
  }

  /** Same name in the same délégation, whatever the case or accents. */
  private async assertNameFree(
    tx: Prisma.TransactionClient,
    delegationId: string,
    nameFr: string,
    exceptId?: string,
  ): Promise<void> {
    const needle = normalizeForMatch(nameFr);
    const siblings = await tx.localite.findMany({
      where: { delegationId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { nameFr: true },
    });
    const clash = siblings.find((sibling) => normalizeForMatch(sibling.nameFr) === needle);
    if (clash) throw localiteExiste(clash.nameFr);
  }

  clearCache(): void {
    this.cachedTree = null;
  }
}
