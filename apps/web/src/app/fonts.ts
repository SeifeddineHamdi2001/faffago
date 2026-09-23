import { IBM_Plex_Sans_Arabic, Manrope, Space_Grotesk } from 'next/font/google';

/** Manrope and Space Grotesk (tech-stack 3), self-hosted by Next at build time. */
export const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
export const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' });

/** Neither has Arabic letters; paired with IBM Plex Sans Arabic (landing 5). */
export const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '600', '700'],
  variable: '--font-arabic-face',
});
