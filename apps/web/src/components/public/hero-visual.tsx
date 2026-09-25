/**
 * The courier and his motorcycle (Landing 2.2), drawn in the brand colours
 * until a real illustration or photo replaces it. It rides the way the page
 * reads, so it turns round in Arabic (Landing 5).
 */
export function HeroVisual({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 320 220"
      role="img"
      aria-label={label}
      className="h-auto w-full max-w-md rtl:-scale-x-100"
    >
      <g
        fill="none"
        stroke="#ff6b35"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      >
        <polyline points="8,110 24,126 8,142" />
        <polyline points="30,110 46,126 30,142" />
      </g>
      <line
        x1="40"
        y1="204"
        x2="310"
        y2="204"
        stroke="#ffffff"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <rect x="62" y="68" width="72" height="56" rx="8" fill="#ff6b35" />
      <polyline
        points="86,82 104,96 86,110"
        fill="none"
        stroke="#1a1b2e"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M112 132 H218 L240 166 H128 Z" fill="#ff6b35" />
      <path
        d="M84 170 L124 128 M218 128 L244 170 M216 124 L230 80 L252 78"
        fill="none"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="172" r="30" fill="none" stroke="#ffffff" strokeWidth="10" />
      <circle cx="244" cy="172" r="30" fill="none" stroke="#ffffff" strokeWidth="10" />
      <circle cx="184" cy="42" r="17" fill="#ffffff" />
      <path
        d="M182 62 L168 116 L204 124 L208 152 M178 78 L230 84"
        fill="none"
        stroke="#ffffff"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
