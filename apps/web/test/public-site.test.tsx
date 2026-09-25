import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CONTACT_LINKS,
  DEFAULT_SETTINGS,
  PublicStatus,
  publicSiteInfoFrom,
  type PublicTrackingView,
} from '@faffago/shared';
import { ContactLinks } from '@/components/public/contact-links';
import { Prices, Zones } from '@/components/public/landing-sections';
import { MetaPixel } from '@/components/public/meta-pixel';
import { TrackingResult } from '@/components/public/tracking-result';
import { publicTexts } from '@/lib/public-texts';

vi.mock('next/navigation', () => ({ usePathname: () => '/fr' }));

const ZONES = [
  {
    gouvernorat: { code: 'TUN', nameFr: 'Tunis', nameAr: 'تونس' },
    delegations: [
      { code: 'TUN-BARDO', nameFr: 'Le Bardo', nameAr: 'باردو' },
      { code: 'TUN-MARSA', nameFr: 'La Marsa', nameAr: 'المرسى' },
    ],
  },
];
const INFO = publicSiteInfoFrom(DEFAULT_SETTINGS, DEFAULT_CONTACT_LINKS, ZONES);

const VIEW: PublicTrackingView = {
  code: 'FG-8K2QX7AB',
  status: PublicStatus.EN_COURS_DE_LIVRAISON,
  lastUpdateAt: '2026-09-25T13:32:00.000Z',
  shopName: 'Boutique Démo',
  delegationName: 'Le Bardo',
  codAmountMillimes: '85000',
  livreurFirstName: 'Ahmed',
  postponedTo: null,
  timeline: [
    { type: 'CREATION', at: '2026-09-24T08:00:00.000Z' },
    { type: 'RAMASSAGE', at: '2026-09-24T10:00:00.000Z' },
    { type: 'ENTREE_DEPOT', at: '2026-09-24T15:00:00.000Z' },
    { type: 'SORTIE_COURSIER', at: '2026-09-25T08:00:00.000Z' },
  ],
};

afterEach(() => {
  delete window.fbq;
});

/** Suivre mon colis (Landing 4.1, Q1–Q3): the main path of the page. */
describe('TrackingResult', () => {
  it('shows the status, the amount to prepare, the shop, the délégation and the livreur’s first name', () => {
    render(<TrackingResult view={VIEW} locale="fr" texts={publicTexts('fr').tracking} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('En cours de livraison');
    expect(screen.getByText('85,000 DT')).toBeInTheDocument();
    expect(screen.getByText('Boutique Démo')).toBeInTheDocument();
    expect(screen.getByText('Le Bardo')).toBeInTheDocument();
    expect(screen.getByText('Ahmed')).toBeInTheDocument();
    expect(screen.getByText('25/09/2026 à 14:32')).toBeInTheDocument();
  });

  it('shows picked up and at the depot as one "Chez Faffa Go" in the history (Q2)', () => {
    render(<TrackingResult view={VIEW} locale="fr" texts={publicTexts('fr').tracking} />);
    const history = screen.getByRole('region', { name: 'Historique' });
    expect(within(history).getAllByText('Chez Faffa Go')).toHaveLength(1);
  });

  it('shows the day the customer chose when he postponed (D-9)', () => {
    render(
      <TrackingResult
        view={{
          ...VIEW,
          status: PublicStatus.LIVRAISON_REPORTEE_CLIENT,
          livreurFirstName: null,
          postponedTo: '2026-10-01',
        }}
        locale="fr"
        texts={publicTexts('fr').tracking}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Livraison reportée — 01/10/2026',
    );
  });

  it('drops the amount once the parcel is delivered', () => {
    render(
      <TrackingResult
        view={{ ...VIEW, status: PublicStatus.LIVRE, livreurFirstName: null }}
        locale="fr"
        texts={publicTexts('fr').tracking}
      />,
    );
    expect(screen.queryByText('85,000 DT')).toBeNull();
  });

  it('reads in Arabic', () => {
    render(<TrackingResult view={VIEW} locale="ar" texts={publicTexts('ar').tracking} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('قيد التوصيل');
  });
});

/** Tarifs and Zones couvertes (Landing 3, 2.6): every figure from Paramètres. */
describe('the landing page', () => {
  it('prices every service from Paramètres', () => {
    render(<Prices locale="fr" texts={publicTexts('fr')} info={INFO} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: /Livraison \(Grand Tunis\)/ })).toHaveTextContent(
      '5,500 DT',
    );
    expect(within(table).getByRole('row', { name: /Retour/ })).toHaveTextContent('2,000 DT');
    expect(within(table).getByRole('row', { name: /Relance/ })).toHaveTextContent('Gratuite');
    expect(within(table).getByRole('row', { name: /Changer de client/ })).toHaveTextContent(
      '1,000 DT',
    );
    expect(within(table).getByRole('row', { name: /Ramassage/ })).toHaveTextContent(
      'Gratuit dès 5 colis · 2,000 DT en dessous de 5 colis',
    );
    expect(screen.getByText(/retenue à la source de 3 %/)).toBeInTheDocument();
  });

  it('follows a new price the moment Paramètres has it', () => {
    const info = publicSiteInfoFrom(
      { ...DEFAULT_SETTINGS, deliveryFeeMillimes: 7000n },
      DEFAULT_CONTACT_LINKS,
      ZONES,
    );
    render(<Prices locale="fr" texts={publicTexts('fr')} info={info} />);
    expect(screen.getByText('7,000 DT')).toBeInTheDocument();
  });

  it('says the prices are unavailable rather than showing none', () => {
    render(<Prices locale="fr" texts={publicTexts('fr')} info={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('momentanément indisponibles');
  });

  it('lists the délégations served by gouvernorat, in the page’s language', () => {
    render(<Zones locale="ar" texts={publicTexts('ar')} info={INFO} />);
    expect(screen.getByRole('heading', { name: 'تونس' })).toBeInTheDocument();
    expect(screen.getByText('المرسى')).toBeInTheDocument();
    expect(screen.getByText('باردو')).toBeInTheDocument();
  });
});

/** Devenir partenaire and Meta Pixel (Landing 2.8, 6). */
describe('contact links and Meta Pixel', () => {
  it('shows only the links Paramètres fills in', () => {
    render(
      <ContactLinks
        links={{ ...DEFAULT_CONTACT_LINKS, tiktok: '' }}
        texts={publicTexts('fr').contact}
      />,
    );
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/21699602208',
    );
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
      'href',
      'tel:+21699602208',
    );
    expect(screen.queryByRole('link', { name: 'TikTok' })).toBeNull();
  });

  it('reports a WhatsApp click to Meta Pixel as a Contact', async () => {
    const user = userEvent.setup();
    const fbq = vi.fn();
    window.fbq = fbq;
    render(<ContactLinks links={DEFAULT_CONTACT_LINKS} texts={publicTexts('fr').contact} />);
    const whatsapp = screen.getByRole('link', { name: 'WhatsApp' });
    whatsapp.addEventListener('click', (event) => event.preventDefault());
    await user.click(whatsapp);
    expect(fbq).toHaveBeenCalledWith('track', 'Contact', { channel: 'whatsapp' });
  });

  it('loads nothing while Paramètres has no pixel id (off by default)', () => {
    const { container } = render(<MetaPixel pixelId="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
