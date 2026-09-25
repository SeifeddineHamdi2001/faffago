'use client';

import type { ContactLinks as Links } from '@faffago/shared';
import type { PublicTexts } from '@/lib/public-texts';
import { trackPartnerContact, type PartnerChannel } from './meta-pixel';

/** "+216 99 602 208" dialled as tel:+21699602208. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

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
    <ul className={variant === 'buttons' ? 'flex flex-wrap gap-3' : 'space-y-1'}>
      {shown.map((item) => (
        <li key={item.channel}>
          <a
            href={item.href}
            {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={() => trackPartnerContact(item.channel)}
            dir={item.channel === 'phone' && variant === 'list' ? 'ltr' : undefined}
            className={
              variant === 'list'
                ? 'inline-flex min-h-11 items-center text-white/90 underline-offset-4 hover:underline'
                : item.channel === 'whatsapp' || item.channel === 'phone'
                  ? 'btn-primary min-h-14 px-6 text-lg'
                  : 'btn-secondary min-h-14 px-6'
            }
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
