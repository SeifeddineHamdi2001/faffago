import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CAISSE_REFUSAL_MESSAGES_FR,
  CaisseLineOrigin,
  CaisseRefusal,
  CaisseSessionStatus,
  CashTransition,
  ParcelAction,
  Role,
  caisseCloseOutcome,
  caisseDayStatus,
  caisseLineOrigin,
  closeRefusal,
  countRefusal,
  documentDateKey,
  expectedBonCash,
  sumMillimes,
  tunisDayKey,
  type Millimes,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';
import { dateColumn } from './document-numbers';

type Db = Prisma.TransactionClient;

function refused(refusal: CaisseRefusal, status = 409) {
  return apiError(status, refusal, CAISSE_REFUSAL_MESSAGES_FR[refusal]);
}

interface CourierRef {
  userId: string;
  courierId: string;
  firstName: string;
  lastName: string;
  role: typeof Role.LIVREUR | typeof Role.RAMASSEUR;
}

/** A delivery the session expects, worked out from the scans (D-79). */
export interface CaisseLine {
  parcelId: string;
  code: string;
  shopName: string;
  codMillimes: Millimes;
  origin: CaisseLineOrigin;
  /** The day the phone made the Livré (A-12). */
  scanDay: string;
}

export interface CaisseBonLine {
  bonVersementId: string;
  number: string;
  shopName: string;
  status: string;
  takenOutMillimes: Millimes;
  remisMillimes: Millimes;
}

export interface CaisseSessionView {
  sessionId: string | null;
  day: string;
  courier: Omit<CourierRef, 'courierId'>;
  status: CaisseSessionStatus;
  expected: { deliveryMillimes: Millimes; bonCashMillimes: Millimes; totalMillimes: Millimes };
  countedMillimes: Millimes | null;
  ecartMillimes: Millimes | null;
  ecartFlagged: boolean;
  ecartCheckedAt: Date | null;
  ecartNote: string | null;
  countedAt: Date | null;
  closedAt: Date | null;
  /** Closed: what was counted against. Otherwise: what the scans say now. */
  lines: CaisseLine[];
  bons: CaisseBonLine[];
  /** Bons de retour he carries, handed back at his Clôturer when not received (D-81). */
  bonsRetourEnRoute: { number: string; shopName: string; pendingLines: number }[];
  debt: { id: string; amountMillimes: Millimes; status: string } | null;
}

export interface CaisseSummaryRow {
  courier: Omit<CourierRef, 'courierId'>;
  sessionId: string | null;
  status: CaisseSessionStatus;
  expectedMillimes: Millimes;
  countedMillimes: Millimes | null;
  ecartMillimes: Millimes | null;
  parcelCount: number;
  lateCount: number;
  bonCount: number;
  ecartFlagged: boolean;
  ecartChecked: boolean;
}

/**
 * The Caisse (Admin 4.9, D-79): one session per courier and business day,
 * counted and closed on its own by Admin or Dépôt. Every Clôturer runs in
 * one transaction: the parcels' cash Au dépôt, the debt or the flag, the bons
 * not handed over back to the depot (CLAUDE.md, Money).
 */
@Injectable()
export class CaisseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  today(): string {
    return tunisDayKey(this.clock.now());
  }

  // ── Reading ───────────────────────────────────────────────

  /** The daily summary (answer 1): every courier with money on that day. */
  async summary(day: string): Promise<{
    day: string;
    rows: CaisseSummaryRow[];
    totals: {
      expectedMillimes: Millimes;
      countedMillimes: Millimes;
      ecartMillimes: Millimes;
      byStatus: Record<CaisseSessionStatus, number>;
    };
  }> {
    const date = dateColumn(day);
    const [deliverers, sessions] = await Promise.all([
      this.prisma.scan.findMany({
        where: { action: 'LIVRE', accepted: true, cancelledAt: null, businessDate: date },
        select: { actorUserId: true },
        distinct: ['actorUserId'],
      }),
      this.prisma.caisseSession.findMany({
        where: { businessDate: date },
        select: { courier: { select: { userId: true } } },
      }),
    ]);
    const userIds = new Set([
      ...deliverers.map((row) => row.actorUserId),
      ...sessions.map((row) => row.courier.userId),
    ]);
    // Today, a livreur with a scan tardif waiting shows too (answer 2).
    if (day === this.today()) {
      const late = await this.prisma.scan.findMany({
        where: {
          action: 'LIVRE',
          accepted: true,
          cancelledAt: null,
          businessDate: { lt: date },
          parcel: { status: 'LIVRE', cashStatus: 'CHEZ_LE_COURSIER' },
        },
        select: { actorUserId: true },
        distinct: ['actorUserId'],
      });
      for (const row of late) userIds.add(row.actorUserId);
    }

    const rows: CaisseSummaryRow[] = [];
    for (const userId of userIds) {
      const view = await this.session(userId, day);
      if (
        view.status === CaisseSessionStatus.OUVERTE &&
        view.sessionId === null &&
        view.lines.length === 0
      ) {
        continue;
      }
      rows.push({
        courier: view.courier,
        sessionId: view.sessionId,
        status: view.status,
        expectedMillimes: view.expected.totalMillimes,
        countedMillimes: view.countedMillimes,
        ecartMillimes: view.ecartMillimes,
        parcelCount: view.lines.length,
        lateCount: view.lines.filter((line) => line.origin === CaisseLineOrigin.TARDIF).length,
        bonCount: view.bons.length,
        ecartFlagged: view.ecartFlagged,
        ecartChecked: view.ecartCheckedAt !== null,
      });
    }
    rows.sort(
      (a, b) =>
        a.courier.lastName.localeCompare(b.courier.lastName, 'fr') ||
        a.courier.firstName.localeCompare(b.courier.firstName, 'fr'),
    );
    const byStatus: Record<CaisseSessionStatus, number> = { OUVERTE: 0, COMPTEE: 0, CLOTUREE: 0 };
    for (const row of rows) byStatus[row.status] += 1;
    return {
      day,
      rows,
      totals: {
        expectedMillimes: sumMillimes(rows.map((row) => row.expectedMillimes)),
        countedMillimes: sumMillimes(rows.map((row) => row.countedMillimes ?? 0n)),
        ecartMillimes: sumMillimes(rows.map((row) => row.ecartMillimes ?? 0n)),
        byStatus,
      },
    };
  }

  /** One courier's session of a day, as it stands. */
  async session(userId: string, day: string, db: Db = this.prisma): Promise<CaisseSessionView> {
    const courier = await this.courierOf(db, userId);
    const row = await db.caisseSession.findUnique({
      where: {
        courierId_businessDate: { courierId: courier.courierId, businessDate: dateColumn(day) },
      },
      include: {
        parcels: {
          include: { parcel: { select: { code: true, seller: { select: { shopName: true } } } } },
        },
        debts: { select: { id: true, amountMillimes: true, status: true } },
      },
    });
    const closed = row?.status === CaisseSessionStatus.CLOTUREE;
    const lines: CaisseLine[] = closed
      ? row!.parcels.map((line) => ({
          parcelId: line.parcelId,
          code: line.parcel.code,
          shopName: line.parcel.seller.shopName,
          codMillimes: line.codMillimes,
          origin: line.origin,
          scanDay: day,
        }))
      : await this.deliveryLines(db, courier, day, row?.id ?? null);
    const bons = row ? await this.bonLines(db, row.id) : [];
    const deliveryMillimes = sumMillimes(lines.map((line) => line.codMillimes));
    const bonCashMillimes = expectedBonCash(bons);
    const bonsRetourEnRoute =
      courier.role === Role.RAMASSEUR && !closed
        ? await db.bonRetour.findMany({
            where: { ramasseurId: courier.courierId, status: 'EN_ROUTE' },
            select: {
              number: true,
              seller: { select: { shopName: true } },
              _count: { select: { parcels: { where: { receivedAt: null } } } },
            },
          })
        : [];
    const { courierId: _courierId, ...courierView } = courier;
    return {
      sessionId: row?.id ?? null,
      day,
      courier: courierView,
      status: caisseDayStatus(row?.status ?? null),
      expected: closed
        ? {
            deliveryMillimes: row!.expectedDeliveryMillimes,
            bonCashMillimes: row!.expectedBonCashMillimes,
            totalMillimes: row!.expectedTotalMillimes,
          }
        : {
            deliveryMillimes,
            bonCashMillimes,
            totalMillimes: deliveryMillimes + bonCashMillimes,
          },
      countedMillimes: row?.countedMillimes ?? null,
      ecartMillimes: row?.ecartMillimes ?? null,
      ecartFlagged: row?.ecartFlagged ?? false,
      ecartCheckedAt: row?.ecartCheckedAt ?? null,
      ecartNote: row?.ecartNote ?? null,
      countedAt: row?.countedAt ?? null,
      closedAt: row?.closedAt ?? null,
      lines,
      bons,
      bonsRetourEnRoute: bonsRetourEnRoute.map((bon) => ({
        number: bon.number,
        shopName: bon.seller.shopName,
        pendingLines: bon._count.parcels,
      })),
      debt: row?.debts[0] ?? null,
    };
  }

  /**
   * The Livré of his that a session expects (D-79): his accepted, not
   * cancelled Livré, the cash still with him, of the session's day or synced
   * after their own day was closed — and not already counted by another
   * session of his.
   */
  private async deliveryLines(
    db: Db,
    courier: CourierRef,
    day: string,
    sessionId: string | null,
  ): Promise<CaisseLine[]> {
    if (courier.role !== Role.LIVREUR) return [];
    const scans = await db.scan.findMany({
      where: {
        action: 'LIVRE',
        accepted: true,
        cancelledAt: null,
        actorUserId: courier.userId,
        businessDate: { lte: dateColumn(day) },
        parcel: { status: 'LIVRE', cashStatus: 'CHEZ_LE_COURSIER' },
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        businessDate: true,
        parcel: {
          select: {
            id: true,
            code: true,
            codAmountMillimes: true,
            seller: { select: { shopName: true } },
            caisseLine: { select: { caisseSessionId: true } },
          },
        },
      },
    });
    const earlierDays = [
      ...new Set(
        scans.map((scan) => documentDateKey(scan.businessDate)).filter((scanDay) => scanDay < day),
      ),
    ];
    const closedDays = new Set(
      (
        await db.caisseSession.findMany({
          where: {
            courierId: courier.courierId,
            status: 'CLOTUREE',
            businessDate: { in: earlierDays.map(dateColumn) },
          },
          select: { businessDate: true },
        })
      ).map((session) => documentDateKey(session.businessDate)),
    );

    const seen = new Set<string>();
    const lines: CaisseLine[] = [];
    for (const scan of scans) {
      const parcel = scan.parcel!;
      if (seen.has(parcel.id)) continue;
      seen.add(parcel.id);
      if (parcel.caisseLine && parcel.caisseLine.caisseSessionId !== sessionId) continue;
      const scanDay = documentDateKey(scan.businessDate);
      const origin = caisseLineOrigin({
        scanDay,
        sessionDay: day,
        scanDaySessionClosed: closedDays.has(scanDay),
      });
      if (!origin) continue;
      lines.push({
        parcelId: parcel.id,
        code: parcel.code,
        shopName: parcel.seller.shopName,
        codMillimes: parcel.codAmountMillimes,
        origin,
        scanDay,
      });
    }
    return lines.sort((a, b) => a.code.localeCompare(b.code));
  }

  private async bonLines(db: Db, sessionId: string): Promise<CaisseBonLine[]> {
    const rows = await db.caisseSessionBon.findMany({
      where: { caisseSessionId: sessionId },
      include: {
        bonVersement: {
          select: { number: true, status: true, seller: { select: { shopName: true } } },
        },
      },
    });
    return rows.map((row) => ({
      bonVersementId: row.bonVersementId,
      number: row.bonVersement.number,
      shopName: row.bonVersement.seller.shopName,
      status: row.bonVersement.status,
      takenOutMillimes: row.takenOutMillimes,
      remisMillimes: row.remisMillimes,
    }));
  }

  private async courierOf(db: Db, userId: string): Promise<CourierRef> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        courier: { select: { id: true } },
      },
    });
    if (!user?.courier || (user.role !== Role.LIVREUR && user.role !== Role.RAMASSEUR)) {
      throw refused(CaisseRefusal.PAS_UN_COURSIER, 404);
    }
    return {
      userId: user.id,
      courierId: user.courier.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  // ── Compter, Clôturer ─────────────────────────────────────

  /** Compter, or recompter until Clôturer (D-79): the attendu's lines are written now. */
  async count(
    actor: UserPrincipal,
    userId: string,
    day: string,
    countedMillimes: Millimes,
  ): Promise<CaisseSessionView> {
    return this.prisma.$transaction(async (tx) => {
      const courier = await this.courierOf(tx, userId);
      const session = await this.lockedSession(tx, courier.courierId, day);
      const refusal = countRefusal(session.status);
      if (refusal) throw refused(refusal);

      const lines = await this.deliveryLines(tx, courier, day, session.id);
      const bons = await this.bonLines(tx, session.id);
      const deliveryMillimes = sumMillimes(lines.map((line) => line.codMillimes));
      const bonCashMillimes = expectedBonCash(bons);
      const totalMillimes = deliveryMillimes + bonCashMillimes;

      await tx.caisseSessionParcel.deleteMany({ where: { caisseSessionId: session.id } });
      if (lines.length > 0) {
        await tx.caisseSessionParcel.createMany({
          data: lines.map((line) => ({
            caisseSessionId: session.id,
            parcelId: line.parcelId,
            codMillimes: line.codMillimes,
            origin: line.origin,
          })),
        });
      }
      await tx.caisseSession.update({
        where: { id: session.id },
        data: {
          status: CaisseSessionStatus.COMPTEE,
          expectedDeliveryMillimes: deliveryMillimes,
          expectedBonCashMillimes: bonCashMillimes,
          expectedTotalMillimes: totalMillimes,
          countedMillimes,
          ecartMillimes: countedMillimes - totalMillimes,
          countedAt: this.clock.now(),
          countedByUserId: actor.userId,
        },
      });
      return this.session(userId, day, tx);
    });
  }

  /**
   * Clôturer (D-79): refused if the attendu moved since Compter. Then, in one
   * transaction, each parcel's cash Au dépôt with its event, the écart made a
   * debt (livreur), a figure for HR (ramasseur) or a flag (surplus), the bons
   * not handed over back to Préparé (A-5b) and the returns not handed over
   * back at the depot (D-81).
   */
  async close(
    actor: UserPrincipal,
    userId: string,
    day: string,
    meta: RequestMeta,
  ): Promise<CaisseSessionView> {
    return this.prisma.$transaction(async (tx) => {
      const courier = await this.courierOf(tx, userId);
      const session = await this.lockedSession(tx, courier.courierId, day);
      const counted = await tx.caisseSessionParcel.findMany({
        where: { caisseSessionId: session.id },
      });
      const lines = await this.deliveryLines(tx, courier, day, session.id);
      const bons = await this.bonLines(tx, session.id);
      const currentExpected =
        sumMillimes(lines.map((line) => line.codMillimes)) + expectedBonCash(bons);
      const sameParcels =
        counted.length === lines.length &&
        lines.every((line) => counted.some((row) => row.parcelId === line.parcelId));
      // A different set of parcels is a changed attendu even when the total
      // happens to match (one parcel in, another of the same COD out): the
      // counted figure is then treated as unknown (-1, never a real total).
      const refusal = closeRefusal({
        status: session.status,
        countedExpectedMillimes:
          session.status === CaisseSessionStatus.COMPTEE && sameParcels
            ? session.expectedTotalMillimes
            : session.status === CaisseSessionStatus.COMPTEE
              ? -1n
              : null,
        currentExpectedMillimes: currentExpected,
      });
      if (refusal) throw refused(refusal);

      const now = this.clock.now();
      for (const line of counted) {
        await this.events.recordCashTransition(tx, {
          parcelId: line.parcelId,
          actor,
          transition: CashTransition.CLOTURE_CAISSE,
          metadata: { caisse: day },
        });
      }

      if (courier.role === Role.RAMASSEUR) await this.bringBack(tx, actor, session.id, courier);

      const outcome = caisseCloseOutcome({
        role: courier.role,
        expectedDeliveryMillimes: session.expectedDeliveryMillimes,
        expectedBonCashMillimes: session.expectedBonCashMillimes,
        countedMillimes: session.countedMillimes!,
      });
      await tx.caisseSession.update({
        where: { id: session.id },
        data: {
          status: CaisseSessionStatus.CLOTUREE,
          ecartMillimes: outcome.ecartMillimes,
          ecartFlagged: outcome.flagged,
          closedAt: now,
          closedByUserId: actor.userId,
        },
      });
      if (outcome.debtMillimes > 0n) {
        await tx.courierDebt.create({
          data: {
            courierId: courier.courierId,
            caisseSessionId: session.id,
            amountMillimes: outcome.debtMillimes,
            remainingMillimes: outcome.debtMillimes,
            createdAt: now,
          },
        });
      }
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.CLOTURE_CAISSE,
        entityType: 'caisse_session',
        entityId: session.id,
        after: {
          jour: day,
          attendu: outcome.expectedTotalMillimes.toString(),
          compte: session.countedMillimes!.toString(),
          ecart: outcome.ecartMillimes.toString(),
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.session(userId, day, tx);
    });
  }

  /** At a ramasseur's Clôturer: the bons he did not hand over come back (A-5b, D-81). */
  private async bringBack(
    tx: Db,
    actor: UserPrincipal,
    sessionId: string,
    courier: CourierRef,
  ): Promise<void> {
    const lines = await tx.caisseSessionBon.findMany({
      where: { caisseSessionId: sessionId },
      include: { bonVersement: true },
    });
    for (const line of lines) {
      if (line.bonVersement.status !== 'EN_ROUTE') continue;
      await tx.caisseSessionBon.update({
        where: {
          caisseSessionId_bonVersementId: {
            caisseSessionId: sessionId,
            bonVersementId: line.bonVersementId,
          },
        },
        data: { returnedMillimes: line.takenOutMillimes },
      });
      await tx.bonVersement.update({
        where: { id: line.bonVersementId },
        data: {
          status: 'PREPARE',
          ramasseurId: null,
          pickupId: null,
          plannedDate: null,
          enRouteAt: null,
        },
      });
    }

    const bonsRetour = await tx.bonRetour.findMany({
      where: { ramasseurId: courier.courierId, status: 'EN_ROUTE' },
      include: { parcels: { where: { receivedAt: null } } },
    });
    for (const bon of bonsRetour) {
      for (const line of bon.parcels) {
        if (line.itemType === 'COLIS') {
          const outcome = await this.events.apply(tx, {
            parcelId: line.parcelId,
            actor,
            request: { action: ParcelAction.RETOUR_NON_REMIS },
            context: { details: { bonRetour: bon.number } },
          });
          if (!outcome.ok) throw new Error(`Retour non remis refusé : ${outcome.message}`);
        } else {
          await tx.parcel.update({
            where: { id: line.parcelId },
            data: { exchangeItemStatus: 'RETOUR_AU_DEPOT' },
          });
        }
      }
      await tx.bonRetour.update({
        where: { id: bon.id },
        data: {
          status: 'PREPARE',
          ramasseurId: null,
          pickupId: null,
          plannedDate: null,
          enRouteAt: null,
        },
      });
    }
  }

  /** The session row, created Ouverte if needed, and locked for this transaction. */
  async lockedSession(tx: Db, courierId: string, day: string) {
    const businessDate = dateColumn(day);
    await tx.caisseSession.upsert({
      where: { courierId_businessDate: { courierId, businessDate } },
      create: { courierId, businessDate, openedAt: this.clock.now() },
      update: {},
    });
    await tx.$queryRaw`SELECT "id" FROM "caisse_sessions"
      WHERE "courierId" = ${courierId}::uuid AND "businessDate" = ${businessDate}::date FOR UPDATE`;
    return tx.caisseSession.findUniqueOrThrow({
      where: { courierId_businessDate: { courierId, businessDate } },
    });
  }

  // ── Écarts and debts ──────────────────────────────────────

  /**
   * What the admin still has to look at: surpluses to check, ramasseur
   * shortfalls for HR — his closed caisses short, and the bons corrected
   * after his caisse was closed that no surplus covered (D-88).
   */
  async ecarts() {
    const [surpluses, shortfalls, bonShortfalls] = await Promise.all([
      this.prisma.caisseSession.findMany({
        where: { status: 'CLOTUREE', ecartFlagged: true, ecartCheckedAt: null },
        orderBy: { businessDate: 'desc' },
        include: {
          courier: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, role: true } },
            },
          },
        },
      }),
      this.prisma.caisseSession.findMany({
        where: {
          status: 'CLOTUREE',
          ecartMillimes: { lt: 0 },
          courier: { user: { role: 'RAMASSEUR' } },
        },
        orderBy: { businessDate: 'desc' },
        take: 200,
        include: {
          courier: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, role: true } },
            },
          },
        },
      }),
      this.prisma.bonCorrection.findMany({
        where: { shortfallMillimes: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          bonVersement: { select: { number: true } },
          caisseSession: {
            select: {
              businessDate: true,
              courier: {
                select: { user: { select: { id: true, firstName: true, lastName: true } } },
              },
            },
          },
        },
      }),
    ]);
    const view = (row: (typeof surpluses)[number]) => ({
      sessionId: row.id,
      day: documentDateKey(row.businessDate),
      courier: {
        userId: row.courier.user.id,
        firstName: row.courier.user.firstName,
        lastName: row.courier.user.lastName,
        role: row.courier.user.role,
      },
      expectedMillimes: row.expectedTotalMillimes,
      countedMillimes: row.countedMillimes,
      ecartMillimes: row.ecartMillimes,
    });
    return {
      aVerifier: surpluses.map(view),
      ramasseurs: shortfalls.map(view),
      bonsCorriges: bonShortfalls.map((row) => ({
        correctionId: row.id,
        day: row.caisseSession ? documentDateKey(row.caisseSession.businessDate) : null,
        courier: row.caisseSession
          ? {
              userId: row.caisseSession.courier.user.id,
              firstName: row.caisseSession.courier.user.firstName,
              lastName: row.caisseSession.courier.user.lastName,
            }
          : null,
        bonNumber: row.bonVersement?.number ?? null,
        shortfallMillimes: row.shortfallMillimes,
        reason: row.reason,
        correctedAt: row.createdAt,
      })),
    };
  }

  /** Vérifier un écart positif (answer 3): the admin, with a note. */
  async checkEcart(actor: UserPrincipal, sessionId: string, note: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "caisse_sessions" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
      const session = await tx.caisseSession.findUnique({ where: { id: sessionId } });
      if (!session || session.status !== 'CLOTUREE' || !session.ecartFlagged) {
        throw refused(CaisseRefusal.ECART_NON_SIGNALE);
      }
      if (session.ecartCheckedAt) throw refused(CaisseRefusal.ECART_DEJA_VERIFIE);
      const updated = await tx.caisseSession.update({
        where: { id: sessionId },
        data: {
          ecartCheckedAt: this.clock.now(),
          ecartCheckedByUserId: actor.userId,
          ecartNote: note,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.VERIFICATION_ECART,
        entityType: 'caisse_session',
        entityId: sessionId,
        after: { ecart: session.ecartMillimes?.toString() ?? null },
        reason: note,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { sessionId, ecartCheckedAt: updated.ecartCheckedAt, ecartNote: updated.ecartNote };
    });
  }

  /** Annuler une dette (Admin rule 5): what is left of it, with a note. */
  async cancelDebt(actor: UserPrincipal, debtId: string, note: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "courier_debts" WHERE "id" = ${debtId}::uuid FOR UPDATE`;
      const debt = await tx.courierDebt.findUnique({ where: { id: debtId } });
      if (!debt) throw refused(CaisseRefusal.DETTE_INTROUVABLE, 404);
      if (debt.status !== 'EN_COURS') throw refused(CaisseRefusal.DETTE_NON_EN_COURS);
      const updated = await tx.courierDebt.update({
        where: { id: debtId },
        data: {
          status: 'ANNULEE',
          cancelledAt: this.clock.now(),
          cancelledByUserId: actor.userId,
          cancelReason: note,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.ANNULATION_DETTE,
        entityType: 'courier_debt',
        entityId: debtId,
        before: { restant: debt.remainingMillimes.toString(), statut: debt.status },
        after: { statut: updated.status },
        reason: note,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return {
        id: updated.id,
        status: updated.status,
        amountMillimes: updated.amountMillimes,
        remainingMillimes: updated.remainingMillimes,
      };
    });
  }
}
