import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { layoutParagraph, type LaidParagraph, type Script, type TextMeasure } from './text-layout';

/**
 * The label fonts (D-45): Noto Sans for Latin text and numbers, Noto Sans
 * Arabic for Arabic, both under the SIL Open Font License (assets/fonts).
 * Embedded in each PDF, subset to the characters used.
 */

const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');

const FILES = {
  latin: { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  arabic: { regular: 'NotoSansArabic-Regular.ttf', bold: 'NotoSansArabic-Bold.ttf' },
} as const;

type Weight = 'regular' | 'bold';

let buffers: Record<Script, Record<Weight, Buffer>> | null = null;
let coverage: Record<Script, fontkit.Font> | null = null;

function loaded() {
  if (!buffers || !coverage) {
    const read = (name: string) => readFileSync(join(FONT_DIR, name));
    buffers = {
      latin: { regular: read(FILES.latin.regular), bold: read(FILES.latin.bold) },
      arabic: { regular: read(FILES.arabic.regular), bold: read(FILES.arabic.bold) },
    };
    coverage = {
      latin: fontkit.create(buffers.latin.regular) as fontkit.Font,
      arabic: fontkit.create(buffers.arabic.regular) as fontkit.Font,
    };
  }
  return { buffers, coverage };
}

export function fontName(script: Script, bold: boolean): string {
  return `${script}-${bold ? 'bold' : 'regular'}`;
}

/** Registers the four fonts on a document, under the names `fontName` gives. */
export function registerFonts(doc: PDFKit.PDFDocument): void {
  const { buffers: files } = loaded();
  for (const script of ['latin', 'arabic'] as const) {
    for (const weight of ['regular', 'bold'] as const) {
      doc.registerFont(fontName(script, weight === 'bold'), files[script][weight]);
    }
  }
}

/** Whether a font has a glyph for the character: nothing prints as an empty box. */
export function fontCovers(char: string, script: Script): boolean {
  return loaded().coverage[script].hasGlyphForCodePoint(char.codePointAt(0)!);
}

export function measureFor(doc: PDFKit.PDFDocument, size: number, bold: boolean): TextMeasure {
  return {
    width: (text, script) => doc.font(fontName(script, bold)).fontSize(size).widthOfString(text),
    covers: fontCovers,
  };
}

/** Line height and baseline, roomy enough for Arabic, which sits taller and deeper. */
export function lineHeightFor(size: number): number {
  return size * 1.55;
}

export interface FieldOptions {
  x: number;
  y: number;
  width: number;
  size: number;
  bold?: boolean;
  maxLines: number;
  /** `auto`: right for a right-to-left field, left otherwise. */
  align?: 'auto' | 'right' | 'center';
}

/** Lays the field out without drawing it: for tests, and to measure before drawing. */
export function layoutField(
  doc: PDFKit.PDFDocument,
  text: string,
  options: FieldOptions,
): LaidParagraph {
  return layoutParagraph(
    text,
    options.width,
    options.maxLines,
    measureFor(doc, options.size, options.bold ?? false),
  );
}

/** Draws one field of a label; returns the height it took. */
export function drawField(doc: PDFKit.PDFDocument, text: string, options: FieldOptions): number {
  const laid = layoutField(doc, text, options);
  const lineHeight = lineHeightFor(options.size);
  const bold = options.bold ?? false;
  laid.lines.forEach((line, i) => {
    const align = options.align ?? 'auto';
    const offset =
      align === 'center'
        ? (options.width - line.width) / 2
        : align === 'right' || (align === 'auto' && laid.rtl)
          ? options.width - line.width
          : 0;
    // Every run on one baseline, whatever the height of its font.
    const baseline = options.y + i * lineHeight + options.size * 1.1;
    for (const run of line.runs) {
      doc
        .font(fontName(run.script, bold))
        .fontSize(options.size)
        .text(run.text, options.x + offset + run.x, baseline, {
          lineBreak: false,
          baseline: 'alphabetic',
        });
    }
  });
  return laid.lines.length * lineHeight;
}
