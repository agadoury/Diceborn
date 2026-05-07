/**
 * Die-face symbol glyphs.
 *
 * Each glyph is rendered inside a 100×100 SVG viewBox, centered, single-color
 * (uses currentColor + fill-opacity layering). They sit on top of the rounded
 * die body in <Die />.
 *
 * For MVP we only need the Barbarian symbols. v7 adds more.
 */

interface FaceProps { className?: string }
function Wrap({ children, className }: FaceProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={className} aria-hidden>
      {children}
    </svg>
  );
}

// Barbarian — AXE: cleaver-style head with shaft.
export const FaceAxe = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M50 18 L78 30 Q86 45 78 62 L60 64 L60 84 L40 84 L40 64 L22 62 Q14 45 22 30 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M50 28 L72 36 Q78 46 72 56 L50 50 z" fill="rgba(255,255,255,0.18)" />
  </Wrap>
);

// Barbarian — FIST: closed hand silhouette.
export const FaceFist = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M30 38 q0-12 12-12 t12 12 v6 q12-2 14 8 t-2 22 q-4 12-22 12 t-22-12 q-2-12 2-22 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M36 40 q4-6 8-4 M48 40 q4-6 8-4 M30 50 q4-2 8 0" stroke="rgba(0,0,0,0.35)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Wrap>
);

// Barbarian — FURY: stylised flame burst.
export const FaceFury = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M50 14 q8 18 18 26 q-4 14 -18 14 q-14 0 -18 -14 q10 -8 18 -26 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M50 24 q4 12 10 18 q-2 8 -10 8 q-8 0 -10 -8 q6 -6 10 -18 z" fill="rgba(255,255,255,0.18)" />
    <path d="M50 60 q-6 10 -8 18 M50 60 q6 10 8 18" stroke="rgba(0,0,0,0.35)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Wrap>
);

// Barbarian — SHIELD: kite shield silhouette.
export const FaceShield = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M50 14 L78 22 V46 q0 22 -28 38 q-28 -16 -28 -38 V22 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M50 18 L74 24 V44 q0 18 -24 32 V18 z" fill="rgba(255,255,255,0.16)" />
    <path d="M50 28 V70 M30 38 H70" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
  </Wrap>
);

// Barbarian — ULT (Roar): warrior's open-mouth howl, stylised as a starburst.
export const FaceUlt = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M50 12 L60 36 L86 36 L66 52 L74 78 L50 62 L26 78 L34 52 L14 36 L40 36 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="50" cy="48" r="8" fill="rgba(0,0,0,0.18)" />
  </Wrap>
);

/** Lookup keyed by SymbolId. */
export const FACE_GLYPHS: Record<string, (p: FaceProps) => React.JSX.Element> = {
  "barbarian:axe":    FaceAxe,
  "barbarian:fist":   FaceFist,
  "barbarian:fury":   FaceFury,
  "barbarian:shield": FaceShield,
  "barbarian:ult":    FaceUlt,
};

/** Per-symbol on-die background tint (subtle; the die body is hero-accent-tinted). */
export const FACE_TINT: Record<string, string> = {
  "barbarian:axe":    "#fde68a",   // ember-gold for the protagonist symbol
  "barbarian:fist":   "#fbbf24",
  "barbarian:fury":   "#f97316",
  "barbarian:shield": "#06b6d4",
  "barbarian:ult":    "#fef3c7",
};
