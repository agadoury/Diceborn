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
// Battle-axe: vertical haft with a single crescent blade flaring right.
function BerserkerAxe(_: FaceProps) {
  return (
    <g>
      {/* Haft */}
      <rect x="46" y="22" width="8" height="64" rx="2" />
      {/* Pommel */}
      <rect x="40" y="84" width="20" height="6" rx="2" />
      {/* Crescent blade */}
      <path d="M54 22 L82 28 Q90 38 84 54 L70 50 Q62 38 54 36 Z" />
      <path d="M54 36 L70 50 L60 50 Z" opacity="0.55" />
    </g>
  );
}
// Pelt: hide-shaped silhouette with shaggy upper edge — reads as fur trim.
function BerserkerFur(_: FaceProps) {
  return (
    <g>
      <path d="
        M18 36
        Q24 22 30 32 Q36 22 42 32 Q50 22 58 32 Q64 22 70 32 Q76 22 82 36
        L84 70
        Q72 84 60 76 Q50 86 40 76 Q28 84 16 70 Z
      " />
    </g>
  );
}
// Howl: crescent moon on the right, sound-wave arcs on the left.
function BerserkerHowl(_: FaceProps) {
  return (
    <g>
      <path d="M68 18 A30 30 0 1 0 68 82 A22 22 0 1 1 68 18 Z" />
      <path d="M28 28 Q14 50 28 72" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M16 18 Q-2 50 16 82" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.55" />
    </g>
  );
}

// ── Pyromancer ─────────────────────────────────────────────────────────────
// Ash: a curl of smoke rising past three drifting flecks.
function PyroAsh(_: FaceProps) {
  return (
    <g>
      <path d="M58 86 Q44 76 56 64 Q70 54 56 42 Q42 30 56 18" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="34" r="5" opacity="0.85" />
      <circle cx="22" cy="58" r="3.5" opacity="0.7" />
      <circle cx="32" cy="76" r="4" opacity="0.55" />
    </g>
  );
}
// Ember: classic flame teardrop with a smaller inner flame.
function PyroEmber(_: FaceProps) {
  return (
    <g>
      <path d="
        M50 12
        C58 28 70 38 70 56
        C70 74 60 86 50 86
        C40 86 30 74 30 56
        C30 44 38 38 42 30
        C42 38 46 42 50 42
        C50 30 50 22 50 12 Z
      " />
      <path d="M50 50 C44 58 46 70 50 76 C54 70 56 58 50 50 Z" fill="#1B1228" opacity="0.45" />
    </g>
  );
}
// Magma: hot drip with two darker bubbles.
function PyroMagma(_: FaceProps) {
  return (
    <g>
      <path d="M50 12 C34 38 26 58 34 74 C40 86 60 86 66 74 C74 58 66 38 50 12 Z" />
      <circle cx="44" cy="56" r="5" fill="#1B1228" opacity="0.55" />
      <circle cx="58" cy="68" r="3.5" fill="#1B1228" opacity="0.55" />
      <circle cx="52" cy="44" r="2" fill="#1B1228" opacity="0.4" />
    </g>
  );
}
// Ruin: pile of cracked stone slabs.
function PyroRuin(_: FaceProps) {
  return (
    <g>
      {/* Tall shard */}
      <path d="M30 84 L34 28 L52 22 L52 84 Z" />
      {/* Short shard */}
      <path d="M52 84 L52 46 L72 38 L74 84 Z" opacity="0.85" />
      {/* Crack on tall shard */}
      <path d="M40 30 L36 50 L44 60 L38 78" stroke="#1B1228" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Ground */}
      <rect x="20" y="84" width="64" height="4" rx="1" opacity="0.6" />
    </g>
  );
}

// ── Lightbearer ────────────────────────────────────────────────────────────
// Sword: tapered blade, crossguard, grip, pommel — straight knight's longsword.
function LightSword(_: FaceProps) {
  return (
    <g>
      {/* Blade with point */}
      <path d="M50 8 L56 60 L44 60 Z" />
      {/* Crossguard */}
      <rect x="26" y="58" width="48" height="8" rx="2" />
      {/* Grip */}
      <rect x="46" y="66" width="8" height="20" />
      {/* Pommel */}
      <circle cx="50" cy="90" r="5" />
    </g>
  );
}
// Sun: solid disc with eight tapered rays.
function LightSun(_: FaceProps) {
  return (
    <g>
      <circle cx="50" cy="50" r="18" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <path key={a} d="M48 6 L52 6 L51 22 L49 22 Z" transform={`rotate(${a} 50 50)`} />
      ))}
    </g>
  );
}
// Dawn: half-disc rising over a horizon line, with rays fanning up.
function LightDawn(_: FaceProps) {
  return (
    <g>
      {/* Sun half */}
      <path d="M22 64 A28 28 0 0 1 78 64 Z" />
      {/* Horizon line */}
      <rect x="10" y="66" width="80" height="4" rx="1" />
      {/* Rays */}
      <path d="M30 50 L24 40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M50 40 L50 26" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M70 50 L76 40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M40 44 L36 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M60 44 L64 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
    </g>
  );
}
// Zenith: heraldic eight-point star with a small pierced center.
function LightZenith(_: FaceProps) {
  return (
    <g>
      {/* Star — long primary points + shorter secondary points. */}
      <path d="
        M50 6 L56 42 L82 18 L58 44
        L94 50 L58 56 L82 82 L56 58
        L50 94 L44 58 L18 82 L42 56
        L6 50 L42 44 L18 18 L44 42 Z
      " />
      <circle cx="50" cy="50" r="6" fill="#1B1228" opacity="0.4" />
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
