import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../globals.css';
import { grotesk, manrope } from '../fonts';

/** The seller space and the back office: French only, left to right (Q4). */
export const metadata: Metadata = {
  title: 'Faffa Go',
  robots: { index: false, follow: false },
};

export default function EspaceLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${grotesk.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
