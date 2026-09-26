'use client';

import type { ContactLinks as Links } from '@faffago/shared';
import type { PublicTexts } from '@/lib/public-texts';
import { Icon, type IconName } from './icons';
import { trackPartnerContact, type PartnerChannel } from './meta-pixel';

/** "+216 99 602 208" dialled as tel:+21699602208. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

const ICON: Record<PartnerChannel, { name: IconName; list: string }> = {
  whatsapp: { name: 'whatsapp', list: 'text-emerald-400' },
  phone: { name: 'phone', list: 'text-orange' },
  facebook: { name: 'facebook', list: 'text-sky-400' },
  instagram: { name: 'instagram', list: 'text-pink-400' },
  tiktok: { name: 'tiktok', list: 'text-white/80' },
};

/** WhatsApp and phone lead (Landing 2.8); white on emerald-700 and navy on orange pass AA. */
const BUTTON: Record<PartnerChannel, string> = {
  whatsapp: 'bg-emerald-700 text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-600',
  phone: 'bg-orange text-navy shadow-lg shadow-orange/30 hover:brightness-105',
  facebook: 'border border-white/15 bg-white/5 text-white/90 hover:bg-white/10',
  instagram: 'border border-white/15 bg-white/5 text-white/90 hover:bg-white/10',
  tiktok: 'border border-white/15 bg-white/5 text-white/90 hover:bg-white/10',
};

/**
 * Devenir partenaire (Landing 2.8): WhatsApp, phone, Facebook, Instagram,
 * TikTok — the links of Paramètres; one left empty there is not shown.
 */
export function ContactLinks({
  links,
  texts,
  variant = 'buttons',
}: {
  links: Links;
  texts: PublicTexts['contact'];
  variant?: 'buttons' | 'list';
}) {
  const items: Array<{ channel: PartnerChannel; href: string; label: string; external: boolean }> =
    [
      { channel: 'whatsapp', href: links.whatsapp, label: texts.whatsapp, external: true },
      {
        channel: 'phone',
        href: links.phone ? telHref(links.phone) : '',
        label: variant === 'list' ? links.phone : texts.phone,
        external: false,
      },
      { channel: 'facebook', href: links.facebook, label: texts.facebook, external: true },
      { channel: 'instagram', href: links.instagram, label: texts.instagram, external: true },
      { channel: 'tiktok', href: links.tiktok, label: texts.tiktok, external: true },
    ];
  const shown = items.filter((item) => item.href !== '');
  return (
    <ul
      className={
        variant === 'buttons' ? 'flex flex-wrap items-center justify-center gap-3' : 'space-y-1'
      }
    >
      {shown.map((item) => (
        <li key={item.channel}>
          <a
            href={item.href}
            {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={() => trackPartnerContact(item.channel)}
            className={
              variant === 'list'
                ? 'inline-flex min-h-11 items-center gap-2.5 text-sm text-white/80 transition-colors hover:text-orange'
                : `inline-flex min-h-14 items-center gap-2.5 rounded-xl px-6 text-sm font-bold transition hover:-translate-y-0.5 ${BUTTON[item.channel]}`
            }
          >
            <Icon
              name={ICON[item.channel].name}
              className={`size-5 ${variant === 'list' ? ICON[item.channel].list : ''}`}
            />
            <span dir={item.channel === 'phone' && variant === 'list' ? 'ltr' : undefined}>
              {item.label}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
