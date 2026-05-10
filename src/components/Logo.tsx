/**
 * PACT OF HEROES wordmark — bold display lettering with a small d20
 * standing in for the "O" of "OF". Inline SVG, no external assets,
 * recolorable via currentColor.
 *
 * The d20 has its own gradient so it pops against the wordmark; the
 * rest of the type uses currentColor so callers can theme it.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 960 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pact of Heroes"
    >
      <defs>
        <linearGradient id="logo-d20" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="logo-text" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fbe9c2" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* Wordmark. We render "PACT" + (gap) + "F HEROES" and slot a d20 into
          the gap; visually the d20 reads as the "O" of "OF". */}
      <text
        x="50%"
        y="106"
        textAnchor="middle"
        fontFamily="Cinzel, Georgia, serif"
        fontWeight={900}
        fontSize="76"
        fill="url(#logo-text)"
        letterSpacing="4"
      >
        PACT
        <tspan dx="92">F HEROES</tspan>
      </text>

      {/* d20 sitting in the "O" gap of "OF". Centered within the gap
          relative to the wordmark above. */}
      <g transform="translate(368 78)">
        <polygon
          points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22"
          fill="url(#logo-d20)"
          stroke="#f59e0b"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {/* Inner shadow facet */}
        <polygon
          points="0,-44 0,44 -38,22 -38,-22"
          fill="rgba(0,0,0,0.22)"
        />
        {/* Inner highlight facet */}
        <polygon
          points="0,-44 38,-22 0,0"
          fill="rgba(255,255,255,0.18)"
        />
        <text
          x="0" y="8"
          textAnchor="middle"
          fontFamily="Cinzel, Georgia, serif"
          fontWeight={900}
          fontSize="32"
          fill="#fde68a"
        >
          20
        </text>
      </g>
    </svg>
  );
}
