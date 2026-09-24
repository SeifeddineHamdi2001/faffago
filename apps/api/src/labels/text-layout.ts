import bidiFactory from 'bidi-js';

/**
 * Lays out one field of a label (D-45): Arabic, French and numbers mixed in
 * one line, each field in its own direction.
 *
 * - The Unicode bidirectional algorithm (bidi-js) decides the direction of
 *   the field from its first strong letter, and the visual order of its runs.
 * - Each word is shaped on its own, in the font of its script: Arabic letters
 *   join within a word, never across a space, so nothing is lost, and the
 *   spaces between words are placed here rather than by the PDF library.
 * - Lines wrap on spaces to the width given; a word longer than the width is
 *   cut; past `maxLines` the field ends with "…". Nothing overflows the box.
 */

const bidi = bidiFactory();

export type Script = 'latin' | 'arabic';

/** The Arabic blocks, drawn with the Arabic font (as code point ranges). */
const ARABIC_BLOCKS: readonly (readonly [number, number])[] = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

function inArabicBlock(char: string): boolean {
  const code = char.codePointAt(0)!;
  return ARABIC_BLOCKS.some(([from, to]) => code >= from && code <= to);
}

/** An Arabic letter: a run holding one is shaped right to left by the font engine. */
const ARABIC_LETTER = /\p{Script=Arabic}/u;

export const ELLIPSIS = '…';
/** What a character neither font can draw becomes (an emoji, say). */
export const MISSING = '?';

export interface TextMeasure {
  /** Width of a run drawn in one font, at the field's size. */
  width(text: string, script: Script): number;
  /** Whether the font of this script has a glyph for the character. */
  covers(char: string, script: Script): boolean;
}

/**
 * One run as it is handed to the PDF: the text in the order the font engine
 * needs (logical for an Arabic run, which the engine shapes and reverses;
 * visual for everything else), its font, and where it sits on the line.
 */
export interface PlacedRun {
  text: string;
  script: Script;
  /** From the left edge of the line. */
  x: number;
  width: number;
}

export interface LaidLine {
  runs: PlacedRun[];
  width: number;
}

export interface LaidParagraph {
  rtl: boolean;
  lines: LaidLine[];
  truncated: boolean;
}

interface Word {
  start: number;
  end: number;
}

function scriptOf(char: string, measure: TextMeasure): Script | null {
  if (inArabicBlock(char) && measure.covers(char, 'arabic')) return 'arabic';
  if (measure.covers(char, 'latin')) return 'latin';
  if (measure.covers(char, 'arabic')) return 'arabic';
  return null;
}

/** Spaces collapsed, and any character neither font draws replaced. */
export function cleanText(raw: string, measure: TextMeasure): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  return Array.from(collapsed)
    .map((char) => (char === ' ' || scriptOf(char, measure) ? char : MISSING))
    .join('');
}

/** The width of a stretch of text, run by run in the font of each character. */
function widthOf(text: string, measure: TextMeasure): number {
  let total = 0;
  let run = '';
  let runScript: Script | null = null;
  for (const char of Array.from(text)) {
    const script = char === ' ' ? 'latin' : (scriptOf(char, measure) ?? 'latin');
    if (script !== runScript && run) {
      total += measure.width(run, runScript!);
      run = '';
    }
    runScript = script;
    run += char;
  }
  if (run) total += measure.width(run, runScript!);
  return total;
}

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  const pattern = /[^ ]+/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }
  return words;
}

/**
 * Breaks the text into lines of words (logical order). A word wider than the
 * line is cut between characters, as a last resort.
 */
function breakLines(text: string, width: number, measure: TextMeasure): string[] {
  const space = measure.width(' ', 'latin');
  const lines: string[] = [];
  let line = '';
  let lineWidth = 0;
  const push = () => {
    if (line) lines.push(line);
    line = '';
    lineWidth = 0;
  };
  for (const word of wordsOf(text)) {
    let rest = text.slice(word.start, word.end);
    let restWidth = widthOf(rest, measure);
    while (restWidth > width) {
      // Cut the longest head that fits on a line of its own.
      push();
      const chars = Array.from(rest);
      let cut = chars.length - 1;
      while (cut > 1 && widthOf(chars.slice(0, cut).join(''), measure) > width) cut -= 1;
      lines.push(chars.slice(0, cut).join(''));
      rest = chars.slice(cut).join('');
      restWidth = widthOf(rest, measure);
    }
    const needed = line ? lineWidth + space + restWidth : restWidth;
    if (line && needed > width) push();
    line = line ? `${line} ${rest}` : rest;
    lineWidth = line === rest ? restWidth : needed;
  }
  push();
  return lines;
}

/** The lines, cut to `maxLines` with "…" when the text is longer. */
function fitLines(
  text: string,
  width: number,
  maxLines: number,
  measure: TextMeasure,
): { lines: string[]; truncated: boolean } {
  const lines = breakLines(text, width, measure);
  if (lines.length <= maxLines) return { lines, truncated: false };
  // Drop words from the end of the kept text until it and "…" fit.
  let words = lines.slice(0, maxLines).join(' ').split(' ');
  while (words.length > 0) {
    const candidate = breakLines(`${words.join(' ')} ${ELLIPSIS}`, width, measure);
    if (candidate.length <= maxLines) return { lines: candidate, truncated: true };
    words = words.slice(0, -1);
  }
  return { lines: [ELLIPSIS], truncated: true };
}

/**
 * One line, in visual order: the runs left to right, each with the text its
 * font needs, and the gaps between words.
 */
function placeLine(
  text: string,
  start: number,
  end: number,
  levels: ReturnType<typeof bidi.getEmbeddingLevels>,
  measure: TextMeasure,
): LaidLine {
  // bidi-js returns an index for every character of the string, the line's
  // range reordered in place: keep that range only.
  const order = bidi.getReorderedIndices(text, levels, start, end - 1).slice(start, end);
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels, start, end - 1);
  const space = measure.width(' ', 'latin');
  const runs: PlacedRun[] = [];
  let x = 0;

  // Consecutive visual indices of one word, one font and one direction.
  let group: number[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const rtl = levels.levels[group[0]!]! % 2 === 1;
    const script = scriptOf(text[group[0]!]!, measure) ?? 'latin';
    const logical = [...group]
      .sort((a, b) => a - b)
      .map((i) => text[i]!)
      .join('');
    // The font engine shapes and reverses a run holding Arabic letters; any
    // other right-to-left run is handed over already in visual order.
    const runText =
      rtl && ARABIC_LETTER.test(logical)
        ? logical
        : group.map((i) => mirrored.get(i) ?? text[i]!).join('');
    const runWidth = measure.width(runText, script);
    runs.push({ text: runText, script, x, width: runWidth });
    x += runWidth;
    group = [];
  };

  for (const index of order) {
    const char = text[index]!;
    if (char === ' ') {
      flush();
      x += space;
      continue;
    }
    const previous = group.at(-1);
    if (previous !== undefined) {
      const sameLevel = levels.levels[previous] === levels.levels[index];
      const sameScript = scriptOf(text[previous]!, measure) === scriptOf(char, measure);
      const adjacent = Math.abs(previous - index) === 1;
      if (!sameLevel || !sameScript || !adjacent) flush();
    }
    group.push(index);
  }
  flush();
  return { runs, width: x };
}

/**
 * The field, laid out: its direction (from its first strong letter), and its
 * lines of placed runs, at most `maxLines`, none wider than `width`.
 */
export function layoutParagraph(
  raw: string,
  width: number,
  maxLines: number,
  measure: TextMeasure,
): LaidParagraph {
  const text = cleanText(raw, measure);
  if (!text || maxLines < 1) return { rtl: false, lines: [], truncated: text.length > 0 };
  const { lines, truncated } = fitLines(text, width, maxLines, measure);

  // The kept text, one paragraph, lines separated by single spaces.
  const kept = lines.join(' ');
  const levels = bidi.getEmbeddingLevels(kept, 'auto');
  const rtl = (levels.paragraphs[0]?.level ?? 0) % 2 === 1;

  const laid: LaidLine[] = [];
  let start = 0;
  for (const line of lines) {
    const end = start + line.length;
    laid.push(placeLine(kept, start, end, levels, measure));
    start = end + 1;
  }
  return { rtl, lines: laid, truncated };
}
