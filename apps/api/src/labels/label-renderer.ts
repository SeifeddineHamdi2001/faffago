import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import { LabelFormat } from '@faffago/shared';
import type { LabelContent } from './label-content';

/**
 * Draws the labels (Vendeur 4.4): thermal 100 × 150 mm, one per page, or
 * A4 with four per sheet. The layout is one function of the label's box, so
 * both formats print the same label.
 */

const MM = 72 / 25.4;
const NAVY = '#0F1B3D';

const THERMAL_PAGE = { width: 100 * MM, height: 150 * MM };
const A4_PAGE = { width: 210 * MM, height: 297 * MM };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Symbols {
  barcode: Buffer;
  qr: Buffer;
}

async function symbolsFor(content: LabelContent): Promise<Symbols> {
  const [barcode, qr] = await Promise.all([
    bwipjs.toBuffer({
      bcid: 'code128',
      text: content.barcodeText,
      scale: 3,
      height: 14,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
    }),
    // Error correction M, bwip-js's default for QR codes.
    bwipjs.toBuffer({ bcid: 'qrcode', text: content.qrText, scale: 4 }),
  ]);
  return { barcode, qr };
}

function drawLabel(doc: PDFKit.PDFDocument, content: LabelContent, symbols: Symbols, box: Box) {
  const pad = 4 * MM;
  const x = box.x + pad;
  const width = box.width - 2 * pad;
  let y = box.y + pad;
  doc.fillColor(NAVY).strokeColor(NAVY);

  // Header: the brand and the sender.
  doc.font('Helvetica-Bold').fontSize(12).text('FAFFA GO', x, y, { width, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(`Expéditeur : ${content.shop}`, x + 28 * MM, y + 2, {
      width: width - 28 * MM,
      align: 'right',
      height: 10,
      ellipsis: true,
    });
  y += 7 * MM;
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(0.8)
    .stroke();
  y += 3 * MM;

  // The Code128, with white on both sides for the scanner (its quiet zone),
  // and the code in clear for a damaged label (Admin 4.2).
  const barcodeWidth = Math.min(width, 76 * MM);
  doc.image(symbols.barcode, x + (width - barcodeWidth) / 2, y, {
    width: barcodeWidth,
    height: 16 * MM,
  });
  y += 18 * MM;
  doc.font('Helvetica-Bold').fontSize(16).text(content.code, x, y, { width, align: 'center' });
  y += 8 * MM;

  // COD in large type, the flags, and the QR on the right.
  const qrSize = 26 * MM;
  const left = width - qrSize - 3 * MM;
  doc.image(symbols.qr, x + width - qrSize, y, { width: qrSize, height: qrSize });
  doc.font('Helvetica').fontSize(9).text('COD', x, y, { width: left });
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(content.cod, x, y + 4 * MM, { width: left });
  let flagY = y + 15 * MM;
  for (const flag of content.flags) {
    doc.font('Helvetica-Bold').fontSize(9);
    const flagWidth = doc.widthOfString(flag) + 4 * MM;
    doc
      .rect(x, flagY, flagWidth, 5 * MM)
      .lineWidth(1.2)
      .stroke();
    doc.text(flag, x + 2 * MM, flagY + 1.3 * MM, { lineBreak: false });
    flagY += 6 * MM;
  }
  y += qrSize + 3 * MM;
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(0.8)
    .stroke();
  y += 3 * MM;

  // The recipient, down to the bottom of the label.
  const bottom = box.y + box.height - pad;
  doc.font('Helvetica').fontSize(8).text('Destinataire', x, y, { width });
  y += 4 * MM;
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(content.recipientName, x, y, { width, height: 13 * MM, ellipsis: true });
  y = Math.min(doc.y, y + 13 * MM) + 1 * MM;
  doc.font('Helvetica-Bold').fontSize(15).text(content.phones, x, y, { width, lineBreak: false });
  y += 8 * MM;
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(content.place, x, y, { width, height: 10 * MM, ellipsis: true });
  y = Math.min(doc.y, y + 10 * MM) + 1.5 * MM;
  doc
    .font('Helvetica')
    .fontSize(12)
    .text(content.address, x, y, { width, height: Math.max(0, bottom - y), ellipsis: true });
}

/** One PDF holding every label, in the order given. */
export async function renderLabels(contents: LabelContent[], format: LabelFormat): Promise<Buffer> {
  const symbols = await Promise.all(contents.map(symbolsFor));
  const page = format === LabelFormat.A4 ? A4_PAGE : THERMAL_PAGE;
  const doc = new PDFDocument({
    size: [page.width, page.height],
    margin: 0,
    autoFirstPage: false,
    info: { Title: 'Étiquettes Faffa Go', Producer: 'Faffa Go', Creator: 'Faffa Go' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (format === LabelFormat.A4) {
    const cell = { width: page.width / 2, height: page.height / 2 };
    contents.forEach((content, i) => {
      const slot = i % 4;
      if (slot === 0) {
        doc.addPage();
        // Where to cut: dashed, light, never over a label.
        doc
          .save()
          .lineWidth(0.3)
          .dash(4, { space: 4 })
          .strokeColor('#8A93A8')
          .moveTo(cell.width, 0)
          .lineTo(cell.width, page.height)
          .moveTo(0, cell.height)
          .lineTo(page.width, cell.height)
          .stroke()
          .restore();
      }
      const box = {
        x: (slot % 2) * cell.width + 2.5 * MM,
        y: Math.floor(slot / 2) * cell.height + 2.5 * MM,
        width: cell.width - 5 * MM,
        height: cell.height - 5 * MM,
      };
      drawLabel(doc, content, symbols[i]!, box);
    });
  } else {
    contents.forEach((content, i) => {
      doc.addPage();
      drawLabel(doc, content, symbols[i]!, { x: 0, y: 0, ...page });
    });
  }
  doc.end();
  return done;
}
