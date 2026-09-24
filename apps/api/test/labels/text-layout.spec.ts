import PDFDocument from 'pdfkit';
import { fontCovers, layoutField, registerFonts } from '../../src/labels/label-fonts';
import { ELLIPSIS, MISSING, type LaidParagraph } from '../../src/labels/text-layout';

/**
 * Arabic, French and numbers on a label (D-45), laid out with the real
 * fonts: each field in its own direction, runs in visual order, words shaped
 * in the font of their script, lines within the width, never a "?".
 */

const MM = 72 / 25.4;
const WIDTH = 92 * MM;

let doc: PDFKit.PDFDocument;
beforeAll(() => {
  doc = new PDFDocument({ size: [100 * MM, 150 * MM], margin: 0, autoFirstPage: false });
  registerFonts(doc);
});

function layout(text: string, maxLines = 3, size = 12, bold = false): LaidParagraph {
  return layoutField(doc, text, { x: 0, y: 0, width: WIDTH, size, bold, maxLines });
}

/** Every run's text, left to right, line by line. */
function visual(paragraph: LaidParagraph): string[][] {
  return paragraph.lines.map((line) => line.runs.map((run) => run.text));
}

/** No "?", and every character of every run has a glyph in the run's font. */
function expectFullyDrawn(paragraph: LaidParagraph): void {
  for (const line of paragraph.lines) {
    for (const run of line.runs) {
      expect(run.text).not.toContain(MISSING);
      for (const char of Array.from(run.text)) {
        expect([char, fontCovers(char, run.script)]).toEqual([char, true]);
      }
    }
  }
}

describe('a pure Arabic name', () => {
  const name = 'أمينة بن صالح';

  it('is right to left, one line, every word in the Arabic font', () => {
    const laid = layout(name, 2, 15, true);
    expect(laid.rtl).toBe(true);
    expect(laid.lines).toHaveLength(1);
    expect(laid.lines[0]!.runs.every((run) => run.script === 'arabic')).toBe(true);
    expectFullyDrawn(laid);
  });

  it('puts the first word on the right: visual order is the reverse of reading order', () => {
    // Each word is handed to the font engine in reading order; it shapes it
    // and draws it right to left. The words themselves are placed here.
    expect(visual(layout(name))).toEqual([['صالح', 'بن', 'أمينة']]);
  });

  it('leaves a space between the words', () => {
    const [line] = layout(name).lines;
    const [first, second] = line!.runs;
    expect(second!.x).toBeGreaterThan(first!.x + first!.width);
  });
});

describe('a mixed address: Arabic, French and numbers in one line', () => {
  const address = 'حي النصر، rue 12, imm. B';

  it('takes the direction of its first letter: right to left', () => {
    expect(layout(address).rtl).toBe(true);
  });

  it('keeps the French part in reading order, on the left of the Arabic', () => {
    expect(visual(layout(address))).toEqual([['rue', '12,', 'imm.', 'B', 'النصر،', 'حي']]);
  });

  it('draws the Arabic words, the Arabic comma included, in the Arabic font', () => {
    const runs = layout(address).lines[0]!.runs;
    expect(runs.map((run) => run.script)).toEqual([
      'latin',
      'latin',
      'latin',
      'latin',
      'arabic',
      'arabic',
    ]);
    expectFullyDrawn(layout(address));
  });

  it('keeps a French address with an Arabic word left to right', () => {
    const laid = layout('12 rue de Marseille, حي النصر');
    expect(laid.rtl).toBe(false);
    expect(visual(laid)).toEqual([['12', 'rue', 'de', 'Marseille,', 'النصر', 'حي']]);
  });
});

describe('an Arabic landmark', () => {
  it('is its own right-to-left field', () => {
    const laid = layout('قرب الجامع الكبير', 2, 11);
    expect(laid.rtl).toBe(true);
    expect(visual(laid)).toEqual([['الكبير', 'الجامع', 'قرب']]);
    expectFullyDrawn(laid);
  });

  it('mirrors a bracket inside Arabic text', () => {
    const laid = layout('قرب (الجامع)', 2, 11);
    expect(laid.lines[0]!.runs.map((run) => run.text).join('')).toContain(')');
    expectFullyDrawn(laid);
  });
});

describe('a long Arabic address', () => {
  const long = Array(12).fill('شارع الحبيب بورقيبة عمارة الياسمين الطابق الثاني').join(' ');

  it('wraps into lines that each fit the label', () => {
    const laid = layout(long, 20);
    expect(laid.lines.length).toBeGreaterThan(3);
    expect(laid.truncated).toBe(false);
    for (const line of laid.lines) expect(line.width).toBeLessThanOrEqual(WIDTH);
    expectFullyDrawn(laid);
  });

  it('never runs past its lines: it ends with "…"', () => {
    const laid = layout(long, 3);
    expect(laid.lines).toHaveLength(3);
    expect(laid.truncated).toBe(true);
    const texts = laid.lines.flatMap((line) => line.runs.map((run) => run.text));
    expect(texts).toContain(ELLIPSIS);
    for (const line of laid.lines) expect(line.width).toBeLessThanOrEqual(WIDTH);
  });

  it('cuts a word wider than the label rather than overflow', () => {
    const laid = layout('ا'.repeat(400), 5);
    for (const line of laid.lines) expect(line.width).toBeLessThanOrEqual(WIDTH);
  });
});

describe('what no font can draw', () => {
  it('prints "?" only for a character neither font has, such as an emoji', () => {
    const laid = layout('Amira 😀');
    expect(visual(laid)).toEqual([['Amira', MISSING]]);
  });

  it('draws French accents and typography in full', () => {
    expectFullyDrawn(layout('Béji — l’Aouina « 2e étage » n° 12…'));
  });
});
