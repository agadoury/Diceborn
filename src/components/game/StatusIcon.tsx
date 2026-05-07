/**
 * Status token glyphs — chunky inline SVGs sized 1em (so they scale with
 * the badge). Each glyph is a single rounded silhouette + accent detail.
 *
 * Universal:  burn, stun, protect, shield, regen
 * Signature:  bleeding (Barbarian), smolder (Pyromancer v7), judgment (Paladin v7)
 */

interface IconProps { className?: string; size?: number }

function Wrap({ children, size = 24, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      {children}
    </svg>
  );
}

export function IconBurn(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M12 2c1.5 3 4 4 4 8a4 4 0 1 1-8 0c0-1 .3-2 .8-2.7C9 9 10 7 10 5.5 11 6.5 12 4 12 2z"
        fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round"
      />
      <path d="M11.4 14a2 2 0 1 1-1.5 3.4" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeLinecap="round" />
    </Wrap>
  );
}

export function IconStun(p: IconProps) {
  // Lightning bolt
  return (
    <Wrap {...p}>
      <path d="M14 2 6 13h4l-2 9 10-13h-4l2-7z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
    </Wrap>
  );
}

export function IconProtect(p: IconProps) {
  // Diamond crystal
  return (
    <Wrap {...p}>
      <path d="M12 3 5 9l7 12 7-12-7-6z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M12 3 9 9l3 12 3-12-3-6z" fill="rgba(255,255,255,0.18)" />
      <path d="M5 9h14" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
    </Wrap>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M12 5 6 7v5c0 4 2.7 6.5 6 7.4V5z" fill="rgba(255,255,255,0.18)" />
    </Wrap>
  );
}

export function IconRegen(p: IconProps) {
  // Heart with leaf swirl
  return (
    <Wrap {...p}>
      <path d="M12 21S4 15 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 21 12 21z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M9 11c1 0 1.5-1 3-1s2 1 3 1" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeLinecap="round" />
    </Wrap>
  );
}

export function IconBleeding(p: IconProps) {
  // Single droplet dripping
  return (
    <Wrap {...p}>
      <path d="M12 3c2 4 5 7 5 11a5 5 0 1 1-10 0c0-4 3-7 5-11z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M9.5 14c0 1 .8 2 2 2" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
    </Wrap>
  );
}

export function IconSmolder(p: IconProps) {
  // Wisp of smoke
  return (
    <Wrap {...p}>
      <path d="M8 21c-1-2 2-3 2-5s-3-3-3-5 3-3 3-5-2-3-2-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 21c1-2-2-3-2-5s3-3 3-5-3-3-3-5 2-3 2-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </Wrap>
  );
}

export function IconJudgment(p: IconProps) {
  // Scales / hammer
  return (
    <Wrap {...p}>
      <path d="M12 3v18M5 8h14M3 14h6l-3-6zM15 14h6l-3-6z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Wrap>
  );
}

/** Lookup helper for the StatusBadge component. */
export const ICON_REGISTRY: Record<string, (p: IconProps) => React.JSX.Element> = {
  burn:     IconBurn,
  stun:     IconStun,
  protect:  IconProtect,
  shield:   IconShield,
  regen:    IconRegen,
  bleeding: IconBleeding,
  smolder:  IconSmolder,
  judgment: IconJudgment,
};
