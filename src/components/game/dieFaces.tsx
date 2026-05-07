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

// Pyromancer — FLAME: blazing teardrop.
export const FaceFlame = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M50 12 q12 18 18 28 q-2 18 -18 18 q-16 0 -18 -18 q6 -10 18 -28 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M50 22 q8 14 12 22 q-2 12 -12 12 q-10 0 -12 -12 q4 -8 12 -22 z" fill="rgba(255,255,255,0.18)" />
  </Wrap>
);
// Pyromancer — SPARK: small starburst (passive Smolder face).
export const FaceSpark = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none">
      <line x1="50" y1="22" x2="50" y2="78" />
      <line x1="22" y1="50" x2="78" y2="50" />
      <line x1="30" y1="30" x2="70" y2="70" />
      <line x1="70" y1="30" x2="30" y2="70" />
    </g>
    <circle cx="50" cy="50" r="6" fill="currentColor" />
  </Wrap>
);
// Pyromancer — STAFF: vertical staff with crystal head.
export const FaceStaff = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <line x1="50" y1="20" x2="50" y2="84" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <circle cx="50" cy="22" r="10" fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
  </Wrap>
);
// Pyromancer — INFERNO (ult): pyre with flames.
export const FaceInferno = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <circle cx="50" cy="56" r="22" fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" />
    <path d="M40 38 q6 -10 10 -16 q4 6 10 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </Wrap>
);

// Paladin — HAMMER: warhammer head + handle.
export const FaceHammer = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <rect x="20" y="22" width="60" height="22" rx="5" fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <line x1="50" y1="44" x2="50" y2="84" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
  </Wrap>
);
// Paladin — SHIELD (reuse Barbarian shield silhouette? — distinct color).
export const FacePalShield = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <path d="M50 14 L78 22 V46 q0 22 -28 38 q-28 -16 -28 -38 V22 z"
      fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M50 28 V70 M30 38 H70" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
  </Wrap>
);
// Paladin — CROSS: holy symbol.
export const FaceCross = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <rect x="42" y="14" width="16" height="68" rx="3" fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" />
    <rect x="22" y="36" width="56" height="16" rx="3" fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2.5" />
  </Wrap>
);
// Paladin — LIGHT (ult): radiant burst.
export const FaceLight = ({ className }: FaceProps) => (
  <Wrap className={className}>
    <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <line x1="50" y1="14" x2="50" y2="32" />
      <line x1="50" y1="68" x2="50" y2="86" />
      <line x1="14" y1="50" x2="32" y2="50" />
      <line x1="68" y1="50" x2="86" y2="50" />
      <line x1="24" y1="24" x2="36" y2="36" />
      <line x1="64" y1="64" x2="76" y2="76" />
      <line x1="76" y1="24" x2="64" y2="36" />
      <line x1="36" y1="64" x2="24" y2="76" />
    </g>
    <circle cx="50" cy="50" r="14" fill="currentColor" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
  </Wrap>
);

/** Lookup keyed by SymbolId. */
export const FACE_GLYPHS: Record<string, (p: FaceProps) => React.JSX.Element> = {
  // Barbarian
  "barbarian:axe":    FaceAxe,
  "barbarian:fist":   FaceFist,
  "barbarian:fury":   FaceFury,
  "barbarian:shield": FaceShield,
  "barbarian:ult":    FaceUlt,
  // Pyromancer
  "pyromancer:flame":   FaceFlame,
  "pyromancer:spark":   FaceSpark,
  "pyromancer:staff":   FaceStaff,
  "pyromancer:shield":  FaceShield,
  "pyromancer:ult":     FaceInferno,
  // Paladin
  "paladin:hammer":  FaceHammer,
  "paladin:cross":   FaceCross,
  "paladin:shield":  FacePalShield,
  "paladin:fist":    FaceFist,
  "paladin:ult":     FaceLight,
};

/** Per-symbol on-die background tint (subtle; the die body is hero-accent-tinted). */
export const FACE_TINT: Record<string, string> = {
  "barbarian:axe":    "#fde68a",
  "barbarian:fist":   "#fbbf24",
  "barbarian:fury":   "#f97316",
  "barbarian:shield": "#06b6d4",
  "barbarian:ult":    "#fef3c7",
  "pyromancer:flame":  "#fb923c",
  "pyromancer:spark":  "#fbbf24",
  "pyromancer:staff":  "#a855f7",
  "pyromancer:shield": "#06b6d4",
  "pyromancer:ult":    "#fef3c7",
  "paladin:hammer":  "#fde68a",
  "paladin:cross":   "#fef3c7",
  "paladin:shield":  "#06b6d4",
  "paladin:fist":    "#fbbf24",
  "paladin:ult":     "#fffbeb",
};
