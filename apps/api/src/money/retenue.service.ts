import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, RetenueCertificate } from '@prisma/client';
import {
  RETENUE_CERTIFICATES,
  RETENUE_LINE_KIND_LABELS_FR,
  RETENUE_REFUSAL_MESSAGES_FR,
  REPORT_LABELS_FR,
  ReportKind,
  RetenueRefusal,
  monthKeyOf,
  monthLabel,
  monthRange,
  retenueLines,
  retenueTotals,
  societeComplete,
  tunisDayKey,
  tunisDayStart,
  addTunisDays,
  yearKeyOf,
  type ReportTable,
  type SocieteInfo,
} from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { nextDocumentNumber } from './document-numbers';
import { renderRetenueCertificate, renderRetenueYearly } from './money-pdf';

type Db = Prisma.TransactionClient;

function refused(refusal: RetenueRefusal, status = 409) {
  return apiError(status, refusal, RETENUE_REFUSAL_MESSAGES_FR[refusal]);
}

const WITH_BON = { bonVersement: { select: { number: true, remisAt: true } } } as const;
type CertificateRow = RetenueCertificate & {
  bonVersement: { number: string; remisAt: Date | null };
};

/**
 * Retenue à la source (Vendeur 4.11, Admin 4.13, D-89): the certificate a bon
 * gets at its first Remis, Annulé when the bon is corrected (D-88); the PDF
 * per bon and the yearly summary; the monthly report for the declaration.
 * The month is the Remis's; a correction shows as a régularisation in its
 * own month, never rewriting a past one.
 */
@Injectable()
export class RetenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ── Issued and cancelled with the bon ─────────────────────

  /** At a bon's Remis, in its transaction: a certificate when it withheld something. */
  async issueAtRemis(tx: Db, bonVersementId: string, now: Date): Promise<void> {
    const bon = await tx.bonVersement.findUniqueOrThrow({
      where: { id: bonVersementId },
      include: {
        seller: {
          include: {
            pickupAddresses: {
              where: { isActive: true },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
              take: 1,
              include: {
                localite: { select: { nameFr: true } },
                delegation: { select: { nameFr: true } },
              },
            },
          },
        },
      },
    });
    if (bon.retenueMillimes <= 0n) return;
    const active = await tx.retenueCertificate.findFirst({
      where: { bonVersementId, cancelledAt: null },
    });
    if (active) return;
    const address = bon.seller.pickupAddresses[0];
    await tx.retenueCertificate.create({
      data: {
        number: await nextDocumentNumber(tx, 'CERTIFICAT_RETENUE', now),
        bonVersementId,
        sellerId: bon.sellerId,
        year: Number.parseInt(yearKeyOf(now), 10),
        baseMillimes: bon.baseAfterFeesMillimes,
        rateBps: bon.retenueRateBps,
        amountMillimes: bon.retenueMillimes,
        issuedAt: now,
        sellerName: bon.seller.contactFullName,
        shopName: bon.seller.shopName,
        // A bon prepared before D-89 may name a seller without it: the PDF
        // then prints the number recorded since.
        cinNumber: bon.seller.cinNumber ?? '',
        sellerAddress: address
          ? `${address.address}, ${address.localite.nameFr}, ${address.delegation.nameFr}`
          : '',
      },
    });
  }

  /** A bon corrected out of Remis (D-88): its certificate Annulé, kept, number never reused. */
  async cancelAtCorrection(tx: Db, bonVersementId: string, actorUserId: string, now: Date) {
    await tx.retenueCertificate.updateMany({
      where: { bonVersementId, cancelledAt: null },
      data: { cancelledAt: now, cancelledByUserId: actorUserId },
    });
  }

  // ── Reading ───────────────────────────────────────────────

  /** A seller's certificates, newest first, and the years with a summary. */
  async ofSeller(sellerId: string) {
    const rows = await this.prisma.retenueCertificate.findMany({
      where: { sellerId },
      orderBy: { issuedAt: 'desc' },
      include: WITH_BON,
    });
    const years = new Set<string>();
    for (const row of rows) {
      years.add(yearKeyOf(row.issuedAt));
      if (row.cancelledAt) years.add(yearKeyOf(row.cancelledAt));
    }
    return {
      parBon: RETENUE_CERTIFICATES.PAR_BON,
      annuel: RETENUE_CERTIFICATES.ANNUEL,
      certificates: RETENUE_CERTIFICATES.PAR_BON
        ? rows.map((row) => ({
            id: row.id,
            number: row.number,
            bonNumber: row.bonVersement.number,
            issuedAt: row.issuedAt,
            baseMillimes: row.baseMillimes,
            rateBps: row.rateBps,
            amountMillimes: row.amountMillimes,
            cancelled: row.cancelledAt !== null,
          }))
        : [],
      years: RETENUE_CERTIFICATES.ANNUEL ? [...years].sort().reverse() : [],
    };
  }

  /** One bon's certificate; for a seller, only his own (D-26). */
  async certificatePdf(id: string, sellerId?: string): Promise<{ number: string; pdf: Buffer }> {
    if (!RETENUE_CERTIFICATES.PAR_BON) throw refused(RetenueRefusal.CERTIFICAT_INTROUVABLE, 404);
    const row = await this.prisma.retenueCertificate.findUnique({
      where: { id },
      include: { ...WITH_BON, seller: { select: { cinNumber: true } } },
    });
    if (!row || (sellerId && row.sellerId !== sellerId)) {
      throw refused(RetenueRefusal.CERTIFICAT_INTROUVABLE, 404);
    }
    const societe = await this.societe();
    return {
      number: row.number,
      pdf: await renderRetenueCertificate({
        societe,
        number: row.number,
        issuedAt: row.issuedAt,
        cancelled: row.cancelledAt !== null,
        sellerName: row.sellerName,
        shopName: row.shopName,
        cinNumber: row.cinNumber || (row.seller.cinNumber ?? ''),
        sellerAddress: row.sellerAddress,
        bonNumber: row.bonVersement.number,
        bonDate: row.issuedAt,
        baseMillimes: row.baseMillimes,
        rateBps: row.rateBps,
        amountMillimes: row.amountMillimes,
      }),
    };
  }

  /** The yearly summary of one seller (D-89): the lines of the year, régularisations included. */
  async yearlyPdf(sellerId: string, year: string): Promise<Buffer> {
    if (!RETENUE_CERTIFICATES.ANNUEL) throw refused(RetenueRefusal.CERTIFICAT_INTROUVABLE, 404);
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw refused(RetenueRefusal.CERTIFICAT_INTROUVABLE, 404);
    const rows = await this.prisma.retenueCertificate.findMany({
      where: { sellerId },
      orderBy: { issuedAt: 'asc' },
      include: WITH_BON,
    });
    const lines = retenueLines(rows, year, yearKeyOf);
    if (lines.length === 0) throw refused(RetenueRefusal.CERTIFICAT_INTROUVABLE, 404);
    const societe = await this.societe();
    const last = rows.filter((row) => row.cinNumber).at(-1);
    return renderRetenueYearly({
      societe,
      year,
      sellerName: seller.contactFullName,
      shopName: seller.shopName,
      cinNumber: seller.cinNumber ?? last?.cinNumber ?? '',
      sellerAddress: rows.at(-1)?.sellerAddress ?? '',
      lines: lines.map((line) => ({
        kind: RETENUE_LINE_KIND_LABELS_FR[line.kind],
        number: line.number,
        bonNumber: line.bonVersement.number,
        at: line.at,
        baseMillimes: line.signedBaseMillimes,
        rateBps: line.rateBps,
        amountMillimes: line.signedAmountMillimes,
      })),
      totals: retenueTotals(lines),
    });
  }

  /** Paramètres › Société, required for any certificate (D-89). */
  private async societe(): Promise<SocieteInfo> {
    const { settings } = await this.settings.current(this.prisma);
    const societe = {
      raisonSociale: settings.societeRaisonSociale,
      matriculeFiscal: settings.societeMatriculeFiscal,
      adresse: settings.societeAdresse,
    };
    if (!societeComplete(societe)) throw refused(RetenueRefusal.SOCIETE_INCOMPLETE);
    return societe;
  }

  // ── The monthly report (Admin 4.13) ───────────────────────

  async monthlyReport(month: string): Promise<ReportTable> {
    // The month's certificates, and those of earlier months cancelled in it.
    const range = monthRange(month);
    const start = tunisDayStart(range.from);
    const next = tunisDayStart(addTunisDays(range.to, 1));
    const rows: CertificateRow[] = await this.prisma.retenueCertificate.findMany({
      where: {
        OR: [{ issuedAt: { gte: start, lt: next } }, { cancelledAt: { gte: start, lt: next } }],
      },
      orderBy: { issuedAt: 'asc' },
      include: WITH_BON,
    });
    const lines = retenueLines(rows, month, monthKeyOf);
    const bySeller = new Map<string, typeof lines>();
    for (const line of lines) {
      bySeller.set(line.sellerId, [...(bySeller.get(line.sellerId) ?? []), line]);
    }
    const sellers = await this.prisma.seller.findMany({
      where: { id: { in: [...bySeller.keys()] } },
      select: { id: true, shopName: true, contactFullName: true, cinNumber: true },
      orderBy: { shopName: 'asc' },
    });
    const all = retenueTotals(lines);
    return {
      kind: ReportKind.RETENUE,
      title: REPORT_LABELS_FR.RETENUE,
      period: monthLabel(month),
      sections: [
        {
          title: 'Par vendeur',
          note: 'Le mois est celui de la remise du bon. Une correction d’un mois passé apparaît en régularisation le mois où elle est faite.',
          columns: [
            { key: 'shop', label: 'Boutique', type: 'text' },
            { key: 'name', label: 'Nom', type: 'text' },
            { key: 'cin', label: 'N° CIN', type: 'text' },
            { key: 'count', label: 'Bons', type: 'count' },
            { key: 'base', label: 'Base', type: 'money' },
            { key: 'amount', label: 'Retenue', type: 'money' },
          ],
          rows: sellers.map((seller) => {
            const totals = retenueTotals(bySeller.get(seller.id)!);
            return {
              sellerId: seller.id,
              shop: seller.shopName,
              name: seller.contactFullName,
              cin: seller.cinNumber ?? '',
              count: totals.count,
              base: totals.baseMillimes.toString(),
              amount: totals.amountMillimes.toString(),
            };
          }),
          totals: {
            shop: 'Total',
            name: null,
            cin: null,
            count: all.count,
            base: all.baseMillimes.toString(),
            amount: all.amountMillimes.toString(),
          },
        },
        {
          title: 'Certificats',
          columns: [
            { key: 'day', label: 'Date', type: 'day' },
            { key: 'kind', label: 'Ligne', type: 'text' },
            { key: 'number', label: 'Certificat', type: 'text' },
            { key: 'bon', label: 'Bon', type: 'text' },
            { key: 'shop', label: 'Boutique', type: 'text' },
            { key: 'base', label: 'Base', type: 'money' },
            { key: 'amount', label: 'Retenue', type: 'money' },
          ],
          rows: lines.map((line) => ({
            certificateId: line.id,
            day: tunisDayKey(line.at),
            kind: RETENUE_LINE_KIND_LABELS_FR[line.kind],
            number: line.number,
            bon: line.bonVersement.number,
            shop: line.shopName,
            base: line.signedBaseMillimes.toString(),
            amount: line.signedAmountMillimes.toString(),
          })),
        },
      ],
    };
  }
}
