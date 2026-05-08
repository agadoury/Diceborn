/**
 * Die-face symbol glyphs.
 *
 * Each glyph is rendered inside a 100×100 SVG viewBox, centered, single-color
 * (uses currentColor + fill-opacity layering). They sit on top of the rounded
 * die body in <Die />.
 *
 * Heroes register their face glyphs by extending FACE_GLYPHS + FACE_TINT
 * keyed on their declared SymbolId (e.g. "myhero:axe"). Currently empty —
 * registers will be added as new hero content arrives.
 */

interface FaceProps { className?: string }

/** Lookup keyed by SymbolId. Heroes add entries when registered. */
export const FACE_GLYPHS: Record<string, (p: FaceProps) => React.JSX.Element> = {};

/** Per-symbol on-die background tint. Heroes add entries when registered. */
export const FACE_TINT: Record<string, string> = {};
