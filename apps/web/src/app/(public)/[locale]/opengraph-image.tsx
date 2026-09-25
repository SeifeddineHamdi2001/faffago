import { ImageResponse } from 'next/og';

/**
 * The preview Facebook, Instagram and WhatsApp show (Landing 6). The image
 * carries the brand only, in Latin letters: the renderer has no Arabic font,
 * and the title and description beside it come in the page's own language.
 */
export const alt = 'Faffa Go — Grand Tunis';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NAVY = '#1a1b2e';
const ORANGE = '#ff6b35';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: NAVY,
        color: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', fontSize: 150, fontWeight: 800, letterSpacing: -4 }}>
        Faffa<span style={{ color: ORANGE, marginLeft: 36 }}>Go</span>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 36 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 150,
              height: 34,
              background: i === 3 ? ORANGE : 'rgba(255,255,255,0.25)',
              clipPath: 'polygon(0 0, 85% 0, 100% 50%, 85% 100%, 0 100%, 15% 50%)',
            }}
          />
        ))}
      </div>
      <div
        style={{ display: 'flex', marginTop: 48, fontSize: 48, color: 'rgba(255,255,255,0.85)' }}
      >
        Grand Tunis · COD
      </div>
    </div>,
    size,
  );
}
