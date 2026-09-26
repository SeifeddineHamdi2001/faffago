import { Injectable } from '@nestjs/common';
import {
  CHARGE_TYPE_LABELS_FR,
  PAYSLIP_STATUS_LABELS_FR,
  REPORT_LABELS_FR,
  ReportKind,
  addTunisDays,
  averageMinutes,
  deliveryRateBps,
  documentDateKey,
  monthLabel,
  monthRange,
  periodLabel,
  sumMillimes,
  tunisDayKey,
  tunisDayStart,
  tunisDaysInRange,
  type ChargeType,
  type ReportCell,
  type ReportPeriod,
  type ReportTable,
} from '@faffago/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { dateColumn } from '../money/document-numbers';
import { RetenueService } from '../money/retenue.service';

/** Over two months a day-by-day table is unreadable: months instead. */
const DAILY_ROWS_MAX_DAYS = 62;

const HOUR_MS = 3_600_000;

function bounds(period: ReportPeriod) {
  return { start: tunisDayStart(period.from), end: tunisDayStart(addTunisDays(period.to, 1)) };
}

/** A figure per row key, added to as rows are read. */
class Tally<K extends string> {
  private readonly rows = new Map<string, Record<K, bigint>>();
  constructor(private readonly keys: readonly K[]) {}
  add(row: string, key: K, amount: bigint) {
    const current =
      this.rows.get(row) ??
      (Object.fromEntries(this.keys.map((k) => [k, 0n])) as Record<K, bigint>);
    current[key] += amount;
    this.rows.set(row, current);
  }
  entries() {
    return [...this.rows.entries()].sort(([a], [b]) => a.localeCompare(b));
  }
  total(key: K): bigint {
    return sumMillimes([...this.rows.values()].map((row) => row[key]));
  }
}

const money = (value: bigint): ReportCell => value.toString();

/**
 * Rapports (Admin 4.13, D-89): each report read from what the money and the
 * scans already store, never recomputed from settings. Admin only
 * (`RAPPORTS`); the controller exports them as CSV or Excel.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retenue: RetenueService,
  ) {}

  retenueReport(month: string): Promise<ReportTable> {
    return this.retenue.monthlyReport(month);
  }

  /**
   * Chiffre d'affaires, a management report (D-89): each Faffa Go fee on the
   * Tunis day it was charged, cancelled fees left out, pickup fees in their
   * own column; beside, what is already deducted on a bon and what waits.
   */
  async chiffreAffaires(period: ReportPeriod): Promise<ReportTable> {
    const { start, end } = bounds(period);
    const charges = await this.prisma.sellerCharge.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: 'ANNULEE' } },
      select: { type: true, status: true, amountMillimes: true, createdAt: true },
    });
    const daily = tunisDaysInRange(period.from, period.to) <= DAILY_ROWS_MAX_DAYS;
    const keys = [
      'LIVRAISON',
      'RETOUR',
      'CHANGEMENT_CLIENT',
      'RAMASSAGE',
      'total',
      'deduit',
      'attente',
    ] as const;
    const tally = new Tally(keys);
    for (const charge of charges) {
      const day = tunisDayKey(charge.createdAt);
      const row = daily ? day : day.slice(0, 7);
      tally.add(row, charge.type, charge.amountMillimes);
      tally.add(row, 'total', charge.amountMillimes);
      tally.add(row, charge.status === 'DEDUITE' ? 'deduit' : 'attente', charge.amountMillimes);
    }
    const columns = [
      daily
        ? { key: 'row', label: 'Jour', type: 'day' as const }
        : { key: 'row', label: 'Mois', type: 'text' as const },
      ...(['LIVRAISON', 'RETOUR', 'CHANGEMENT_CLIENT', 'RAMASSAGE'] as ChargeType[]).map(
        (type) => ({
          key: type,
          label: CHARGE_TYPE_LABELS_FR[type],
          type: 'money' as const,
        }),
      ),
      { key: 'total', label: 'Total', type: 'money' as const },
      { key: 'deduit', label: 'Déduit sur un bon', type: 'money' as const },
      { key: 'attente', label: 'En attente', type: 'money' as const },
    ];
    return {
      kind: ReportKind.CHIFFRE_AFFAIRES,
      title: REPORT_LABELS_FR.CHIFFRE_AFFAIRES,
      period: periodLabel(period),
      sections: [
        {
          title: daily ? 'Par jour' : 'Par mois',
          note: 'Rapport de gestion : chaque frais compte le jour où il est facturé ; les frais annulés sont exclus.',
          columns,
          rows: tally.entries().map(([row, values]) => ({
            row: daily ? row : monthLabel(row),
            ...Object.fromEntries(keys.map((k) => [k, money(values[k])])),
          })),
          totals: {
            row: 'Total',
            ...Object.fromEntries(keys.map((k) => [k, money(tally.total(k))])),
          },
        },
      ],
    };
  }

  /**
   * Activité (Admin 4.13): delivered and returned parcels on the day of their
   * event, the phone's for a scan, a cancelled scan taken back (D-83); the
   * delivery rate, the return rate and the time from pickup to delivery, by
   * seller, zone and livreur. A livreur's rate is his deliveries over his
   * attempts, failures included.
   */
  async activite(period: ReportPeriod): Promise<ReportTable> {
    const { start, end } = bounds(period);
    // Device time may lie a little before or after the server's: read wide, keep exact.
    const events = await this.prisma.parcelEvent.findMany({
      where: {
        type: { in: ['LIVRAISON', 'RETOUR_RECU', 'ECHEC_LIVRAISON'] },
        serverTime: {
          gte: new Date(start.getTime() - 48 * HOUR_MS),
          lt: new Date(end.getTime() + 48 * HOUR_MS),
        },
      },
      select: {
        type: true,
        parcelId: true,
        actorUserId: true,
        scanId: true,
        deviceTime: true,
        serverTime: true,
        parcel: {
          select: {
            pickedUpAt: true,
            seller: { select: { id: true, shopName: true } },
            delegation: { select: { zone: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    const scanIds = events.flatMap((e) => (e.scanId ? [e.scanId] : []));
    const cancelled = new Set(
      (
        await this.prisma.scan.findMany({
          where: { id: { in: scanIds }, cancelledAt: { not: null } },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    const kept = events.filter((e) => {
      const at = e.deviceTime ?? e.serverTime;
      return at >= start && at < end && !(e.scanId && cancelled.has(e.scanId));
    });

    interface Group {
      label: string;
      delivered: Set<string>;
      returned: Set<string>;
      failures: number;
      minutes: number[];
    }
    const group = (map: Map<string, Group>, id: string, label: string) => {
      if (!map.has(id)) {
        map.set(id, { label, delivered: new Set(), returned: new Set(), failures: 0, minutes: [] });
      }
      return map.get(id)!;
    };
    const bySeller = new Map<string, Group>();
    const byZone = new Map<string, Group>();
    const byLivreur = new Map<string, Group>();
    for (const e of kept) {
      const zone = e.parcel.delegation.zone;
      const targets = [
        group(bySeller, e.parcel.seller.id, e.parcel.seller.shopName),
        group(byZone, zone?.id ?? 'sans-zone', zone?.name ?? 'Sans zone'),
      ];
      if (e.type === 'LIVRAISON' && e.actorUserId)
        targets.push(group(byLivreur, e.actorUserId, ''));
      if (e.type === 'ECHEC_LIVRAISON') {
        if (e.actorUserId) group(byLivreur, e.actorUserId, '').failures += 1;
        continue;
      }
      for (const target of targets) {
        if (e.type === 'LIVRAISON') {
          if (!target.delivered.has(e.parcelId) && e.parcel.pickedUpAt) {
            const at = e.deviceTime ?? e.serverTime;
            target.minutes.push(
              Math.round((at.getTime() - e.parcel.pickedUpAt.getTime()) / 60_000),
            );
          }
          target.delivered.add(e.parcelId);
        } else {
          target.returned.add(e.parcelId);
        }
      }
    }
    const livreurs = await this.prisma.user.findMany({
      where: { id: { in: [...byLivreur.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const user of livreurs)
      byLivreur.get(user.id)!.label = `${user.firstName} ${user.lastName}`;

    const outcomeColumns = [
      { key: 'label', label: '', type: 'text' as const },
      { key: 'delivered', label: 'Livrés', type: 'count' as const },
      { key: 'returned', label: 'Retournés', type: 'count' as const },
      { key: 'deliveryRate', label: 'Taux de livraison', type: 'rate' as const },
      { key: 'returnRate', label: 'Taux de retour', type: 'rate' as const },
      { key: 'delay', label: 'Délai moyen ramassage → livraison', type: 'duration' as const },
    ];
    const outcomeRows = (map: Map<string, Group>) =>
      [...map.values()]
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
        .map((g) => {
          const rate = deliveryRateBps(g.delivered.size, g.returned.size);
          return {
            label: g.label,
            delivered: g.delivered.size,
            returned: g.returned.size,
            deliveryRate: rate,
            returnRate: rate === null ? null : 10_000 - rate,
            delay: averageMinutes(g.minutes),
          };
        });
    const titled = (label: string) => [
      { ...outcomeColumns[0]!, label },
      ...outcomeColumns.slice(1),
    ];
    return {
      kind: ReportKind.ACTIVITE,
      title: REPORT_LABELS_FR.ACTIVITE,
      period: periodLabel(period),
      sections: [
        { title: 'Par vendeur', columns: titled('Vendeur'), rows: outcomeRows(bySeller) },
        { title: 'Par zone', columns: titled('Zone'), rows: outcomeRows(byZone) },
        {
          title: 'Par livreur',
          note: 'Taux de réussite : livrés ÷ (livrés + échecs de livraison).',
          columns: [
            { key: 'label', label: 'Livreur', type: 'text' },
            { key: 'delivered', label: 'Livrés', type: 'count' },
            { key: 'failures', label: 'Échecs', type: 'count' },
            { key: 'successRate', label: 'Taux de réussite', type: 'rate' },
            { key: 'delay', label: 'Délai moyen ramassage → livraison', type: 'duration' },
          ],
          rows: [...byLivreur.values()]
            .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
            .map((g) => ({
              label: g.label,
              delivered: g.delivered.size,
              failures: g.failures,
              successRate: deliveryRateBps(g.delivered.size, g.failures),
              delay: averageMinutes(g.minutes),
            })),
        },
      ],
    };
  }

  /**
   * Argent (Admin 4.13, D-89): per day, the cash collected (Livré scans, the
   * phone's day), handed over (counted at Clôturer), paid to sellers (net of
   * the bons Remis) and the retenue withheld on them; then what is held now
   * and the courier debts outstanding.
   */
  async argent(period: ReportPeriod): Promise<ReportTable> {
    const { start, end } = bounds(period);
    const [scans, sessions, bons, withCouriers, atDepot, debts] = await Promise.all([
      this.prisma.scan.findMany({
        where: {
          action: 'LIVRE',
          accepted: true,
          cancelledAt: null,
          businessDate: { gte: dateColumn(period.from), lte: dateColumn(period.to) },
        },
        select: { businessDate: true, collectedMillimes: true },
      }),
      this.prisma.caisseSession.findMany({
        where: {
          status: 'CLOTUREE',
          businessDate: { gte: dateColumn(period.from), lte: dateColumn(period.to) },
        },
        select: { businessDate: true, countedMillimes: true },
      }),
      this.prisma.bonVersement.findMany({
        where: { status: { in: ['REMIS', 'ARCHIVE'] }, remisAt: { gte: start, lt: end } },
        select: { remisAt: true, netMillimes: true, retenueMillimes: true },
      }),
      this.prisma.parcel.aggregate({
        where: { status: 'LIVRE', cashStatus: 'CHEZ_LE_COURSIER' },
        _sum: { codAmountMillimes: true },
      }),
      this.prisma.parcel.aggregate({
        where: { status: 'LIVRE', cashStatus: 'AU_DEPOT' },
        _sum: { codAmountMillimes: true },
      }),
      this.prisma.courierDebt.aggregate({
        where: { status: 'EN_COURS' },
        _sum: { remainingMillimes: true },
      }),
    ]);
    const keys = ['collected', 'handedOver', 'paid', 'retenue'] as const;
    const tally = new Tally(keys);
    for (const scan of scans) {
      tally.add(documentDateKey(scan.businessDate), 'collected', scan.collectedMillimes ?? 0n);
    }
    for (const session of sessions) {
      tally.add(documentDateKey(session.businessDate), 'handedOver', session.countedMillimes ?? 0n);
    }
    for (const bon of bons) {
      tally.add(tunisDayKey(bon.remisAt!), 'paid', bon.netMillimes);
      tally.add(tunisDayKey(bon.remisAt!), 'retenue', bon.retenueMillimes);
    }
    const heldCouriers = withCouriers._sum.codAmountMillimes ?? 0n;
    const heldDepot = atDepot._sum.codAmountMillimes ?? 0n;
    return {
      kind: ReportKind.ARGENT,
      title: REPORT_LABELS_FR.ARGENT,
      period: periodLabel(period),
      sections: [
        {
          title: 'Par jour',
          columns: [
            { key: 'day', label: 'Jour', type: 'day' },
            { key: 'collected', label: 'Encaissé par les livreurs', type: 'money' },
            { key: 'handedOver', label: 'Remis à la caisse', type: 'money' },
            { key: 'paid', label: 'Payé aux vendeurs', type: 'money' },
            { key: 'retenue', label: 'Retenue à la source retenue', type: 'money' },
          ],
          rows: tally.entries().map(([day, values]) => ({
            day,
            ...Object.fromEntries(keys.map((k) => [k, money(values[k])])),
          })),
          totals: {
            day: 'Total',
            ...Object.fromEntries(keys.map((k) => [k, money(tally.total(k))])),
          },
        },
        {
          title: 'Détenu aujourd’hui',
          columns: [
            { key: 'label', label: '', type: 'text' },
            { key: 'amount', label: 'Montant', type: 'money' },
          ],
          rows: [
            { label: 'Chez les coursiers', amount: money(heldCouriers) },
            { label: 'Au dépôt, non payé aux vendeurs', amount: money(heldDepot) },
            { label: 'Total détenu', amount: money(heldCouriers + heldDepot) },
            {
              label: 'Dettes coursiers en cours',
              amount: money(debts._sum.remainingMillimes ?? 0n),
            },
          ],
        },
      ],
    };
  }

  /** Paie coursiers (Admin 4.13): the fiches whose period ends in the range. */
  async paie(period: ReportPeriod): Promise<ReportTable> {
    const slips = await this.prisma.payslip.findMany({
      where: { periodEnd: { gte: dateColumn(period.from), lte: dateColumn(period.to) } },
      orderBy: [{ periodEnd: 'asc' }, { number: 'asc' }],
      include: { courier: { select: { user: { select: { firstName: true, lastName: true } } } } },
    });
    const sum = (pick: (s: (typeof slips)[number]) => bigint) =>
      money(sumMillimes(slips.map(pick)));
    return {
      kind: ReportKind.PAIE,
      title: REPORT_LABELS_FR.PAIE,
      period: periodLabel(period),
      sections: [
        {
          title: 'Fiches de paie',
          columns: [
            { key: 'livreur', label: 'Livreur', type: 'text' },
            { key: 'number', label: 'Fiche', type: 'text' },
            { key: 'start', label: 'Du', type: 'day' },
            { key: 'end', label: 'Au', type: 'day' },
            { key: 'parcels', label: 'Colis', type: 'count' },
            { key: 'gross', label: 'Brut', type: 'money' },
            { key: 'deductions', label: 'Déductions', type: 'money' },
            { key: 'net', label: 'Net', type: 'money' },
            { key: 'status', label: 'Statut', type: 'text' },
          ],
          rows: slips.map((slip) => ({
            livreur: `${slip.courier.user.firstName} ${slip.courier.user.lastName}`,
            number: slip.number,
            start: documentDateKey(slip.periodStart),
            end: documentDateKey(slip.periodEnd),
            parcels: slip.parcelCount,
            gross: money(slip.grossMillimes),
            deductions: money(slip.deductionsMillimes),
            net: money(slip.netMillimes),
            status: PAYSLIP_STATUS_LABELS_FR[slip.status],
          })),
          totals: {
            livreur: 'Total',
            parcels: slips.reduce((n, s) => n + s.parcelCount, 0),
            gross: sum((s) => s.grossMillimes),
            deductions: sum((s) => s.deductionsMillimes),
            net: sum((s) => s.netMillimes),
          },
        },
      ],
    };
  }

  /**
   * Écarts ramasseurs (Admin 4.13), for HR: the closed caisses of the month
   * short, and the bons corrected in the month that no surplus covered (D-88).
   */
  async ecartsRamasseurs(month: string): Promise<ReportTable> {
    const range = monthRange(month);
    const { start, end } = bounds(range);
    const [sessions, corrections] = await Promise.all([
      this.prisma.caisseSession.findMany({
        where: {
          status: 'CLOTUREE',
          ecartMillimes: { lt: 0 },
          businessDate: { gte: dateColumn(range.from), lte: dateColumn(range.to) },
          courier: { user: { role: 'RAMASSEUR' } },
        },
        include: { courier: { select: { userId: true } } },
        orderBy: { businessDate: 'asc' },
      }),
      this.prisma.bonCorrection.findMany({
        where: { shortfallMillimes: { gt: 0 }, createdAt: { gte: start, lt: end } },
        include: {
          bonVersement: { select: { number: true } },
          caisseSession: { select: { businessDate: true, courier: { select: { userId: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const lines = [
      ...sessions.map((s) => ({
        userId: s.courier.userId,
        day: documentDateKey(s.businessDate),
        origin: 'Caisse clôturée',
        bon: '',
        amount: -s.ecartMillimes!,
        reason: '',
      })),
      ...corrections.map((c) => ({
        userId: c.caisseSession?.courier.userId ?? '',
        day: tunisDayKey(c.createdAt),
        origin: 'Bon corrigé après clôture',
        bon: c.bonVersement?.number ?? '',
        amount: c.shortfallMillimes,
        reason: c.reason,
      })),
    ].sort((a, b) => a.day.localeCompare(b.day));
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.userId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const name = (id: string) => {
      const user = users.find((u) => u.id === id);
      return user ? `${user.firstName} ${user.lastName}` : '—';
    };
    const perCourier = new Map<string, bigint>();
    for (const line of lines)
      perCourier.set(line.userId, (perCourier.get(line.userId) ?? 0n) + line.amount);
    return {
      kind: ReportKind.ECARTS_RAMASSEURS,
      title: REPORT_LABELS_FR.ECARTS_RAMASSEURS,
      period: monthLabel(month),
      sections: [
        {
          title: 'Par ramasseur',
          columns: [
            { key: 'name', label: 'Ramasseur', type: 'text' },
            { key: 'amount', label: 'Manque', type: 'money' },
          ],
          rows: [...perCourier.entries()]
            .map(([id, amount]) => ({ name: name(id), amount: money(amount) }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr')),
          totals: { name: 'Total', amount: money(sumMillimes(lines.map((l) => l.amount))) },
        },
        {
          title: 'Détail',
          columns: [
            { key: 'day', label: 'Jour', type: 'day' },
            { key: 'name', label: 'Ramasseur', type: 'text' },
            { key: 'origin', label: 'Origine', type: 'text' },
            { key: 'bon', label: 'Bon', type: 'text' },
            { key: 'amount', label: 'Manque', type: 'money' },
            { key: 'reason', label: 'Raison', type: 'text' },
          ],
          rows: lines.map((l) => ({
            day: l.day,
            name: name(l.userId),
            origin: l.origin,
            bon: l.bon,
            amount: money(l.amount),
            reason: l.reason,
          })),
        },
      ],
    };
  }

  /** Which report, for which period. */
  async build(
    kind: ReportKind,
    query: { period?: ReportPeriod; month?: string },
  ): Promise<ReportTable> {
    switch (kind) {
      case ReportKind.RETENUE:
        return this.retenueReport(query.month!);
      case ReportKind.ECARTS_RAMASSEURS:
        return this.ecartsRamasseurs(query.month!);
      case ReportKind.CHIFFRE_AFFAIRES:
        return this.chiffreAffaires(query.period!);
      case ReportKind.ACTIVITE:
        return this.activite(query.period!);
      case ReportKind.ARGENT:
        return this.argent(query.period!);
      case ReportKind.PAIE:
        return this.paie(query.period!);
    }
  }
}
