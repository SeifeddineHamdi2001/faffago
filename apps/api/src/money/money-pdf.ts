import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import {
  BON_STATUS_LABELS_FR,
  SELLER_STATUT_LABELS_FR,
  formatDT,
  formatRatePercent,
  formatTunisDay,
  tunisDayKey,
  type BonStatus,
  type Millimes,
  type SellerStatut,
} from '@faffago/shared';
import { drawField, registerFonts } from '../labels/label-fonts';

/**
 * The money documents (Vendeur 4.11, 4.12, Admin 4.10, 4.12, D-80): A4,
 * French, the fonts of the labels (D-45, Arabic names included). Built on
 * request, never stored.
 */

const MM = 72 / 25.4;
const NAVY = '#0F1B3D';
const GREY = '#4A5470';
const PAGE = { width: 210 * MM, height: 297 * MM };
const MARGIN = 15 * MM;
const WIDTH = PAGE.width - 2 * MARGIN;
const BOTTOM = PAGE.height - MARGIN;

type Doc = PDFKit.PDFDocument;

function open(): { doc: Doc; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}

/** One line of text in a box; returns the height used. */
function line(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  width: number,
  options: {
    size?: number;
    bold?: boolean;
    align?: 'auto' | 'right' | 'center';
    color?: string;
  } = {},
): number {
  doc.fillColor(options.color ?? NAVY);
  const used = drawField(doc, text, {
    x,
    y,
    width,
    size: options.size ?? 9,
    bold: options.bold ?? false,
    maxLines: 1,
    align: options.align ?? 'auto',
  });
  doc.fillColor(NAVY);
  return used;
}

function rule(doc: Doc, y: number) {
  doc
    .save()
    .lineWidth(0.5)
    .strokeColor('#C9CEDA')
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + WIDTH, y)
    .stroke()
    .restore();
}

function qrImage(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'qrcode', text, scale: 4 });
}

function day(date: Date | null): string {
  return date ? formatTunisDay(tunisDayKey(date)) : '—';
}

/** A table that continues on a new page; the header is drawn again there. */
interface Column {
  title: string;
  width: number;
  align?: 'right';
}

function table(
  doc: Doc,
  y: number,
  columns: Column[],
  rows: string[][],
  onNewPage: () => number,
): number {
  const header = (top: number) => {
    let x = MARGIN;
    for (const column of columns) {
      line(doc, column.title, x, top, column.width - 2 * MM, {
        size: 8,
        bold: true,
        color: GREY,
        align: column.align ?? 'auto',
      });
      x += column.width;
    }
    rule(doc, top + 13);
    return top + 16;
  };
  let top = header(y);
  for (const row of rows) {
    if (top + 14 > BOTTOM - 40) top = header(onNewPage());
    let x = MARGIN;
    row.forEach((cell, index) => {
      const column = columns[index]!;
      line(doc, cell, x, top, column.width - 2 * MM, { align: column.align ?? 'auto' });
      x += column.width;
    });
    top += 14;
  }
  return top;
}

/** Totals block: label on the left, amount on the right. */
function totals(
  doc: Doc,
  y: number,
  rows: { label: string; amount: string; bold?: boolean }[],
): number {
  let top = y;
  for (const row of rows) {
    line(doc, row.label, MARGIN + WIDTH / 2, top, WIDTH / 2 - 35 * MM, {
      bold: row.bold,
      size: row.bold ? 11 : 9,
    });
    line(doc, row.amount, MARGIN + WIDTH - 35 * MM, top, 35 * MM, {
      bold: row.bold,
      size: row.bold ? 11 : 9,
      align: 'right',
    });
    top += row.bold ? 18 : 14;
  }
  return top;
}

/**
 * A "Reçu par" block per side: caption, then Nom / Date lines and a
 * signature box, so a signed copy actually names and dates who received it.
 */
function signatures(doc: Doc, y: number, left: string, right: string) {
  const top = BOTTOM - 88;
  const half = WIDTH / 2 - 5 * MM;
  for (const [index, title] of [left, right].entries()) {
    const x = MARGIN + index * (half + 10 * MM);
    line(doc, title, x, top, half, { size: 8, bold: true, color: GREY });
    line(doc, 'Nom : ', x, top + 16, half, { size: 8 });
    line(doc, 'Date : ', x, top + 30, half, { size: 8 });
    line(doc, 'Signature :', x, top + 44, half, { size: 8, color: GREY });
    doc
      .save()
      .lineWidth(0.5)
      .strokeColor('#8A93A8')
      .rect(x, top + 54, half, 30)
      .stroke()
      .restore();
  }
}

// ── Bon de versement ────────────────────────────────────────

export interface BonVersementPdf {
  number: string;
  status: BonStatus;
  preparedAt: Date;
  qr: string;
  seller: { shopName: string; contactFullName: string; contactPhone: string };
  sellerStatutSnapshot: SellerStatut;
  parcels: {
    code: string;
    recipientName: string;
    deliveredAt: Date | null;
    codMillimes: Millimes;
  }[];
  charges: { label: string; parcelCode: string | null; amountMillimes: Millimes }[];
  totalCodMillimes: Millimes;
  totalFeesMillimes: Millimes;
  baseAfterFeesMillimes: Millimes;
  retenueRateBps: number;
  retenueMillimes: Millimes;
  netMillimes: Millimes;
}

const COPIES = ['Exemplaire vendeur', 'Exemplaire Faffa Go'] as const;

/** Two copies, each with its QR: the seller keeps one, the signed one comes back (Admin 4.10). */
export async function renderBonVersement(bon: BonVersementPdf): Promise<Buffer> {
  const qr = await qrImage(bon.qr);
  const { doc, done } = open();
  for (const copy of COPIES) {
    const newPage = () => {
      doc.addPage();
      line(doc, `${bon.number} · ${copy} (suite)`, MARGIN, MARGIN, WIDTH, { size: 8, color: GREY });
      return MARGIN + 18;
    };
    doc.addPage();
    let y = MARGIN;
    line(doc, 'Faffa Go', MARGIN, y, WIDTH / 2, { size: 16, bold: true });
    line(doc, copy, MARGIN + WIDTH / 2, y, WIDTH / 2 - 32 * MM, {
      size: 8,
      color: GREY,
      align: 'right',
    });
    doc.image(qr, MARGIN + WIDTH - 28 * MM, y, { width: 28 * MM });
    y += 26;
    line(doc, 'Bon de versement', MARGIN, y, WIDTH / 2, { size: 13, bold: true });
    y += 20;
    line(doc, `N° ${bon.number}`, MARGIN, y, WIDTH / 2, { bold: true });
    y += 14;
    line(
      doc,
      `Préparé le ${day(bon.preparedAt)} · ${BON_STATUS_LABELS_FR[bon.status]}`,
      MARGIN,
      y,
      WIDTH / 2,
      { color: GREY },
    );
    y += 22;
    line(doc, bon.seller.shopName, MARGIN, y, WIDTH - 32 * MM, { size: 11, bold: true });
    y += 16;
    line(
      doc,
      `Contact : ${bon.seller.contactFullName} · ${bon.seller.contactPhone} · Statut : ${SELLER_STATUT_LABELS_FR[bon.sellerStatutSnapshot]}`,
      MARGIN,
      y,
      WIDTH,
    );
    y = Math.max(y + 22, MARGIN + 30 * MM);

    y = table(
      doc,
      y,
      [
        { title: 'Colis', width: 40 * MM },
        { title: 'Destinataire', width: 70 * MM },
        { title: 'Livré le', width: 35 * MM },
        { title: 'Montant', width: WIDTH - 145 * MM, align: 'right' },
      ],
      bon.parcels.map((p) => [
        p.code,
        p.recipientName,
        day(p.deliveredAt),
        formatDT(p.codMillimes),
      ]),
      newPage,
    );
    y += 8;
    if (bon.charges.length > 0) {
      if (y + 30 > BOTTOM - 150) y = newPage();
      y = table(
        doc,
        y,
        [
          { title: 'Frais Faffa Go', width: 80 * MM },
          { title: 'Colis', width: 65 * MM },
          { title: 'Montant', width: WIDTH - 145 * MM, align: 'right' },
        ],
        bon.charges.map((c) => [c.label, c.parcelCode ?? '—', `− ${formatDT(c.amountMillimes)}`]),
        newPage,
      );
      y += 8;
    }
    if (y + 168 > BOTTOM) y = newPage();
    rule(doc, y);
    y = totals(doc, y + 6, [
      { label: `Total des colis (${bon.parcels.length})`, amount: formatDT(bon.totalCodMillimes) },
      { label: '− Frais Faffa Go', amount: `− ${formatDT(bon.totalFeesMillimes)}` },
      { label: '= Base après frais', amount: formatDT(bon.baseAfterFeesMillimes) },
      // A tax, not a Faffa Go fee: always its own line (Vendeur 2.4).
      ...(bon.retenueMillimes > 0n
        ? [
            {
              label: `− Retenue à la source ${formatRatePercent(bon.retenueRateBps)} %`,
              amount: `− ${formatDT(bon.retenueMillimes)}`,
            },
          ]
        : []),
      { label: 'Net payé en espèces', amount: formatDT(bon.netMillimes), bold: true },
    ]);
    signatures(doc, y, 'Remis par (ramasseur Faffa Go)', 'Reçu par (le contact, pour le vendeur)');
  }
  doc.end();
  return done;
}

// ── Bon de retour ───────────────────────────────────────────

export interface BonRetourPdf {
  number: string;
  status: BonStatus;
  preparedAt: Date;
  qr: string;
  seller: { shopName: string; contactFullName: string; contactPhone: string };
  lines: { code: string; recipientName: string; productDescription: string; itemType: string }[];
}

export async function renderBonRetour(bon: BonRetourPdf): Promise<Buffer> {
  const qr = await qrImage(bon.qr);
  const { doc, done } = open();
  for (const copy of COPIES) {
    const newPage = () => {
      doc.addPage();
      line(doc, `${bon.number} · ${copy} (suite)`, MARGIN, MARGIN, WIDTH, { size: 8, color: GREY });
      return MARGIN + 18;
    };
    doc.addPage();
    let y = MARGIN;
    line(doc, 'Faffa Go', MARGIN, y, WIDTH / 2, { size: 16, bold: true });
    line(doc, copy, MARGIN + WIDTH / 2, y, WIDTH / 2 - 32 * MM, {
      size: 8,
      color: GREY,
      align: 'right',
    });
    doc.image(qr, MARGIN + WIDTH - 28 * MM, y, { width: 28 * MM });
    y += 26;
    line(doc, 'Bon de retour', MARGIN, y, WIDTH / 2, { size: 13, bold: true });
    y += 20;
    line(doc, `N° ${bon.number}`, MARGIN, y, WIDTH / 2, { bold: true });
    y += 14;
    line(
      doc,
      `Préparé le ${day(bon.preparedAt)} · ${BON_STATUS_LABELS_FR[bon.status]}`,
      MARGIN,
      y,
      WIDTH / 2,
      { color: GREY },
    );
    y += 22;
    line(doc, bon.seller.shopName, MARGIN, y, WIDTH - 32 * MM, { size: 11, bold: true });
    y += 16;
    line(
      doc,
      `Contact : ${bon.seller.contactFullName} · ${bon.seller.contactPhone}`,
      MARGIN,
      y,
      WIDTH,
    );
    y = Math.max(y + 22, MARGIN + 30 * MM);
    y = table(
      doc,
      y,
      [
        { title: 'Colis', width: 40 * MM },
        { title: 'Nature', width: 35 * MM },
        { title: 'Destinataire', width: 55 * MM },
        { title: 'Article', width: WIDTH - 130 * MM },
      ],
      bon.lines.map((l) => [
        l.code,
        l.itemType === 'ARTICLE_RECUPERE' ? 'Ancien article (échange)' : 'Retour',
        l.recipientName,
        l.productDescription,
      ]),
      newPage,
    );
    if (y + 108 > BOTTOM) y = newPage();
    line(doc, `${bon.lines.length} article(s) rendu(s)`, MARGIN, y + 8, WIDTH, { bold: true });
    signatures(doc, y + 20, 'Remis par (ramasseur Faffa Go)', 'Reçu par (le contact, pour le vendeur)');
  }
  doc.end();
  return done;
}

// ── Fiche de paie ───────────────────────────────────────────

export interface PayslipPdf {
  number: string;
  livreur: { firstName: string; lastName: string };
  payPlanLabel: string;
  period: { start: string; end: string };
  rates: { rateMillimes: Millimes; count: number; totalMillimes: Millimes }[];
  grossMillimes: Millimes;
  deductions: { caisseDay: string | null; amountMillimes: Millimes }[];
  deductionsMillimes: Millimes;
  netMillimes: Millimes;
  statusLabel: string;
  parcels: { code: string; deliveredAt: Date | null; rateMillimes: Millimes }[];
}

export async function renderPayslip(slip: PayslipPdf): Promise<Buffer> {
  const { doc, done } = open();
  const newPage = () => {
    doc.addPage();
    line(doc, `${slip.number} (suite)`, MARGIN, MARGIN, WIDTH, { size: 8, color: GREY });
    return MARGIN + 18;
  };
  doc.addPage();
  let y = MARGIN;
  line(doc, 'Faffa Go', MARGIN, y, WIDTH, { size: 16, bold: true });
  y += 26;
  line(doc, 'Fiche de paie livreur', MARGIN, y, WIDTH, { size: 13, bold: true });
  y += 20;
  line(doc, `N° ${slip.number} · ${slip.statusLabel}`, MARGIN, y, WIDTH, { bold: true });
  y += 16;
  line(
    doc,
    `${slip.livreur.firstName} ${slip.livreur.lastName} · Plan ${slip.payPlanLabel}`,
    MARGIN,
    y,
    WIDTH,
  );
  y += 14;
  line(
    doc,
    `Période du ${formatTunisDay(slip.period.start)} au ${formatTunisDay(slip.period.end)}`,
    MARGIN,
    y,
    WIDTH,
  );
  y += 24;
  rule(doc, y);
  y = totals(doc, y + 6, [
    ...slip.rates.map((rate) => ({
      label: `${rate.count} colis livré(s) × ${formatDT(rate.rateMillimes)}`,
      amount: formatDT(rate.totalMillimes),
    })),
    { label: 'Brut', amount: formatDT(slip.grossMillimes) },
    ...slip.deductions.map((d) => ({
      label: d.caisseDay ? `− Dette, écart de caisse du ${formatTunisDay(d.caisseDay)}` : '− Dette',
      amount: `− ${formatDT(d.amountMillimes)}`,
    })),
    { label: 'Net à payer', amount: formatDT(slip.netMillimes), bold: true },
  ]);
  y += 10;
  table(
    doc,
    y,
    [
      { title: 'Colis', width: 50 * MM },
      { title: 'Livré le', width: 50 * MM },
      { title: 'Tarif', width: WIDTH - 100 * MM, align: 'right' },
    ],
    slip.parcels.map((p) => [p.code, day(p.deliveredAt), formatDT(p.rateMillimes)]),
    newPage,
  );
  doc.end();
  return done;
}
