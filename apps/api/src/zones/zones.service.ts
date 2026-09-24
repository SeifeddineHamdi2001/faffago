import { Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import {
  ROLE_LABELS_FR,
  ZONE_ROLES,
  ZoneAssignmentKind,
  normalizeForMatch,
  type CreateZoneValues,
  type UpdateZoneValues,
  type ZoneAssignmentsValues,
  type ZoneRole,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

interface CourierRef {
  id: string;
  firstName: string;
  lastName: string;
}

type Slots = Record<ZoneAssignmentKind, CourierRef | null>;

export interface ZoneView {
  id: string;
  name: string;
  isActive: boolean;
  delegations: Array<{ id: string; code: string; nameFr: string }>;
  assignments: Record<ZoneRole, Slots>;
}

const zoneIntrouvable = () => apiError(404, 'ZONE_INTROUVABLE', 'Zone introuvable.');
const zoneExiste = (name: string) =>
  apiError(409, 'ZONE_EXISTE', `Une zone s’appelle déjà « ${name} ».`);
const zoneInactive = () =>
  apiError(409, 'ZONE_INACTIVE', 'Cette zone est désactivée : réactivez-la d’abord.');
const zoneNonVide = (count: number) =>
  apiError(
    409,
    'ZONE_NON_VIDE',
    `Cette zone contient encore ${count} délégation(s) : déplacez-les d’abord vers une autre zone.`,
  );
const roleIncorrect = (role: ZoneRole) =>
  apiError(
    409,
    'AFFECTATION_ROLE_INCORRECT',
    `Ce compte n’est pas un ${ROLE_LABELS_FR[role].toLowerCase()}.`,
  );
const coursierIndisponible = (name: string) =>
  apiError(
    409,
    'COURSIER_INDISPONIBLE',
    `${name} ne reçoit plus de nouveau travail : il ne peut pas être affecté.`,
  );

const zoneInclude = {
  delegations: { orderBy: { nameFr: 'asc' }, select: { id: true, code: true, nameFr: true } },
  assignments: {
    include: {
      courier: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  },
} satisfies Prisma.ZoneInclude;

type ZoneRow = Prisma.ZoneGetPayload<{ include: typeof zoneInclude }>;

function view(zone: ZoneRow): ZoneView {
  const slots = (role: ZoneRole): Slots => {
    const at = (kind: ZoneAssignmentKind) => {
      const user = zone.assignments.find((a) => a.role === role && a.kind === kind)?.courier.user;
      return user ? { id: user.id, firstName: user.firstName, lastName: user.lastName } : null;
    };
    return { TITULAIRE: at('TITULAIRE'), BACKUP: at('BACKUP') };
  };
  return {
    id: zone.id,
    name: zone.name,
    isActive: zone.isActive,
    delegations: zone.delegations,
    assignments: { LIVREUR: slots('LIVREUR'), RAMASSEUR: slots('RAMASSEUR') },
  };
}

/** The audit trail names couriers by account id, as the API does. */
function auditShape(zone: ZoneView): Prisma.InputJsonObject {
  const ids = (slots: Slots) => ({
    TITULAIRE: slots.TITULAIRE?.id ?? null,
    BACKUP: slots.BACKUP?.id ?? null,
  });
  return {
    LIVREUR: ids(zone.assignments.LIVREUR),
    RAMASSEUR: ids(zone.assignments.RAMASSEUR),
  };
}

/**
 * Zones (Admin 4.5, 4.16, D-51): groups of délégations, each with a livreur
 * and a ramasseur, both with a titular and a backup. The admin's alone.
 */
@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ZoneView[]> {
    const zones = await this.prisma.zone.findMany({
      orderBy: { name: 'asc' },
      include: zoneInclude,
    });
    return zones.map(view);
  }

  async create(actor: UserPrincipal, input: CreateZoneValues, meta: RequestMeta) {
    const zone = await this.prisma.$transaction(async (tx) => {
      await this.assertNameFree(tx, input.name);
      const row = await tx.zone.create({ data: { name: input.name }, include: zoneInclude });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.CREATION_ZONE,
        entityType: 'zone',
        entityId: row.id,
        after: { name: row.name },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    return view(zone);
  }

  /** Rename, deactivate (refused while délégations are attached) or reactivate. */
  async update(actor: UserPrincipal, id: string, input: UpdateZoneValues, meta: RequestMeta) {
    const zone = await this.prisma.$transaction(async (tx) => {
      const current = await tx.zone.findUnique({
        where: { id },
        include: { _count: { select: { delegations: true } } },
      });
      if (!current) throw zoneIntrouvable();
      if (input.name !== undefined && input.name !== current.name) {
        await this.assertNameFree(tx, input.name, id);
      }
      if (input.isActive === false && current._count.delegations > 0) {
        throw zoneNonVide(current._count.delegations);
      }
      const row = await tx.zone.update({ where: { id }, data: input, include: zoneInclude });
      const keys = Object.keys(input) as Array<'name' | 'isActive'>;
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MODIFICATION_ZONE,
        entityType: 'zone',
        entityId: id,
        before: Object.fromEntries(keys.map((key) => [key, current[key]])),
        after: Object.fromEntries(keys.map((key) => [key, row[key]])),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    return view(zone);
  }

  /**
   * The four assignments of a zone, replaced together (Admin 4.5). A courier
   * newly placed must have the role and be able to take work (D-12); one
   * already in his slot stays, so a courier who stopped taking new work does
   * not block editing the rest of the zone.
   */
  async setAssignments(
    actor: UserPrincipal,
    id: string,
    input: ZoneAssignmentsValues,
    meta: RequestMeta,
  ) {
    const zone = await this.prisma.$transaction(async (tx) => {
      const current = await tx.zone.findUnique({ where: { id }, include: zoneInclude });
      if (!current) throw zoneIntrouvable();
      if (!current.isActive) throw zoneInactive();

      const rows: Prisma.ZoneAssignmentCreateManyInput[] = [];
      for (const role of ZONE_ROLES) {
        const wanted = {
          TITULAIRE: input[role].titulaireId,
          BACKUP: input[role].backupId,
        } satisfies Record<ZoneAssignmentKind, string | null>;
        for (const kind of [ZoneAssignmentKind.TITULAIRE, ZoneAssignmentKind.BACKUP]) {
          const userId = wanted[kind];
          if (!userId) continue;
          const user = await tx.user.findUnique({
            where: { id: userId },
            include: { courier: true },
          });
          if (!user?.courier || user.role !== (role as Role)) throw roleIncorrect(role);
          const kept = current.assignments.some(
            (a) => a.role === role && a.kind === kind && a.courierId === user.courier!.id,
          );
          const canWork =
            user.isActive && user.acceptsWork && user.courier.accountState === 'ACTIF';
          if (!kept && !canWork) throw coursierIndisponible(`${user.firstName} ${user.lastName}`);
          rows.push({ zoneId: id, courierId: user.courier.id, role, kind });
        }
      }

      await tx.zoneAssignment.deleteMany({ where: { zoneId: id } });
      if (rows.length > 0) await tx.zoneAssignment.createMany({ data: rows });
      const row = await tx.zone.findUniqueOrThrow({ where: { id }, include: zoneInclude });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MODIFICATION_AFFECTATIONS_ZONE,
        entityType: 'zone',
        entityId: id,
        before: auditShape(view(current)),
        after: auditShape(view(row)),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return row;
    });
    return view(zone);
  }

  /** Two zones never share a name, whatever the case or accents. */
  private async assertNameFree(
    tx: Prisma.TransactionClient,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const needle = normalizeForMatch(name);
    const zones = await tx.zone.findMany({
      where: exceptId ? { id: { not: exceptId } } : {},
      select: { name: true },
    });
    const clash = zones.find((zone) => normalizeForMatch(zone.name) === needle);
    if (clash) throw zoneExiste(clash.name);
  }
}
