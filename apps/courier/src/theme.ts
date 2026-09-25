/**
 * The brand (landing.md, Design) for a phone read in the sun: high contrast,
 * orange surfaces carry navy text — white on #FF6B35 fails WCAG AA
 * (CLAUDE.md, UI) — and every touch target is at least 56 px (Coursier 1).
 */
export const colors = {
  orange: '#FF6B35',
  orangeDark: '#B3441A',
  navy: '#1A1B2E',
  navyMuted: '#4A4B5E',
  white: '#FFFFFF',
  background: '#F8FAFC',
  border: '#D5D6DD',
  // White text on these passes WCAG AA, as on the web scan station.
  green: '#15803D',
  red: '#B91C1C',
  amberBg: '#FEF3C7',
  amberText: '#78350F',
} as const;

export const TOUCH_MIN = 56;

export const font = {
  body: 18,
  large: 22,
  huge: 34,
  small: 15,
} as const;
