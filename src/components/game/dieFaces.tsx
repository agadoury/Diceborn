/**
 * Die-face symbol glyphs.
 *
 * Each glyph emits raw SVG primitives (no wrapping <svg>) drawn against a
 * 100x100 viewBox using `currentColor`, so the parent's `color` style sets
 * the tint. They render in two places:
 *   - <Die />: inside an existing <svg> wrapped in a translate+scale <g>.
 *   - AbilityLadder ComboStrip: inside an inline <span> — the strip wraps
 *     the glyph in its own <svg viewBox="0 0 100 100"> at render time.
 *
 * Add a new hero by extending FACE_GLYPHS + FACE_TINT keyed on its declared
 * SymbolId (e.g. "myhero:axe").
 */

interface FaceProps { className?: string }

// ── Berserker ──────────────────────────────────────────────────────────────
function BerserkerAxe(_: FaceProps) {
  return (
    <g>
      <path d="M50 12 L54 84 L46 84 Z" />
      <path d="M50 24 C28 24 18 38 18 50 C28 50 38 46 50 36 Z" />
      <path d="M50 24 C72 24 82 38 82 50 C72 50 62 46 50 36 Z" />
    </g>
  );
}
function BerserkerFur(_: FaceProps) {
  return (
    <g>
      <path d="M20 76 L30 40 L40 70 L50 32 L60 70 L70 40 L80 76 Z" />
      <path d="M28 80 Q38 70 48 80 Q58 70 68 80 Q78 70 80 84 L20 84 Q22 70 28 80 Z" opacity="0.55" />
    </g>
  );
}
function BerserkerHowl(_: FaceProps) {
  return (
    <g>
      <path d="M30 38 L52 28 L52 72 L30 62 Z" />
      <path d="M62 30 Q78 50 62 70" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M70 22 Q92 50 70 78" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

// ── Pyromancer ─────────────────────────────────────────────────────────────
function PyroAsh(_: FaceProps) {
  return (
    <g>
      <circle cx="34" cy="28" r="6" />
      <circle cx="58" cy="44" r="5" opacity="0.85" />
      <circle cx="40" cy="60" r="4" opacity="0.7" />
      <circle cx="68" cy="74" r="6" />
      <circle cx="22" cy="78" r="3.5" opacity="0.6" />
    </g>
  );
}
function PyroEmber(_: FaceProps) {
  return (
    <g>
      <path d="M50 14 C40 32 60 40 50 56 C42 50 36 42 38 32 C30 44 28 60 40 74 C50 80 64 76 70 64 C76 50 64 38 60 24 C56 32 54 22 50 14 Z" />
    </g>
  );
}
function PyroMagma(_: FaceProps) {
  return (
    <g>
      <path d="M50 12 C36 36 28 56 36 72 C42 84 60 84 66 72 C74 56 64 36 50 12 Z" />
      <circle cx="46" cy="52" r="4" fill="#1B1228" opacity="0.55" />
      <circle cx="56" cy="64" r="3" fill="#1B1228" opacity="0.55" />
    </g>
  );
}
function PyroRuin(_: FaceProps) {
  return (
    <g>
      <path d="M22 20 L78 20 L70 50 L82 80 L18 80 L30 50 Z" opacity="0.85" />
      <path d="M40 22 L52 50 L46 80" stroke="#1B1228" strokeWidth="4" fill="none" />
      <path d="M62 22 L54 52 L66 80" stroke="#1B1228" strokeWidth="4" fill="none" />
    </g>
  );
}

// ── Lightbearer ────────────────────────────────────────────────────────────
function LightSword(_: FaceProps) {
  return (
    <g>
      <path d="M50 10 L56 64 L44 64 Z" />
      <rect x="30" y="60" width="40" height="6" />
      <rect x="46" y="66" width="8" height="20" />
      <rect x="40" y="84" width="20" height="4" />
    </g>
  );
}
function LightSun(_: FaceProps) {
  return (
    <g>
      <circle cx="50" cy="50" r="18" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <rect key={a} x="48" y="6" width="4" height="14" transform={`rotate(${a} 50 50)`} />
      ))}
    </g>
  );
}
function LightDawn(_: FaceProps) {
  return (
    <g>
      <path d="M14 70 A36 36 0 0 1 86 70 Z" />
      <rect x="10" y="74" width="80" height="3" />
      <path d="M30 60 L36 50 M50 50 L50 38 M70 60 L64 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8" />
    </g>
  );
}
function LightZenith(_: FaceProps) {
  return (
    <g>
      <path d="M50 8 L58 42 L92 50 L58 58 L50 92 L42 58 L8 50 L42 42 Z" />
      <circle cx="50" cy="50" r="8" fill="#1B1228" opacity="0.35" />
    </g>
  );
}

/** Lookup keyed by SymbolId. */
export const FACE_GLYPHS: Record<string, (p: FaceProps) => React.JSX.Element> = {
  "berserker:axe":  BerserkerAxe,
  "berserker:fur":  BerserkerFur,
  "berserker:howl": BerserkerHowl,

  "pyromancer:ash":   PyroAsh,
  "pyromancer:ember": PyroEmber,
  "pyromancer:magma": PyroMagma,
  "pyromancer:ruin":  PyroRuin,

  "lightbearer:sword":  LightSword,
  "lightbearer:sun":    LightSun,
  "lightbearer:dawn":   LightDawn,
  "lightbearer:zenith": LightZenith,
};

/** Per-symbol glyph color. Picked to read on the parchment-tinted die body
 *  while staying within each hero's palette. */
export const FACE_TINT: Record<string, string> = {
  "berserker:axe":  "#3a4f6b",   // dark frost-steel
  "berserker:fur":  "#7a5a36",   // tan pelt
  "berserker:howl": "#3a78a8",   // deep frost-blue

  "pyromancer:ash":   "#3f3a44",  // soot grey
  "pyromancer:ember": "#b45309",  // ember gold
  "pyromancer:magma": "#9a3412",  // molten orange-red
  "pyromancer:ruin":  "#7f1d1d",  // ruin crimson

  "lightbearer:sword":  "#854d0e", // gilded steel
  "lightbearer:sun":    "#b45309", // amber sunburst
  "lightbearer:dawn":   "#9a6306", // dawn glow
  "lightbearer:zenith": "#713f12", // crowned gold
};
