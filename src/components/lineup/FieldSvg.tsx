// ---------------------------------------------------------------------------
// FieldSvg — Accurate AFL ground SVG shared between FootballField and
// MatchupFieldPreview.
//
// ViewBox: 0 0 540 700
// Scale:   ~3.93 px/m (530px ÷ 135m width, 650px ÷ 165m height)
// Aspect:  27 / 35  (540 ÷ 700)
// ---------------------------------------------------------------------------

export interface FieldSvgProps {
  /** Prefix for SVG <defs> IDs to avoid collisions when multiple fields
   *  are rendered on the same page (e.g. "lineup", "matchup"). */
  idPrefix: string
  /** Render the field rotated 90° CW (landscape). ViewBox becomes 700×540. */
  landscape?: boolean
}

export function FieldSvg({ idPrefix, landscape = false }: FieldSvgProps) {
  const gradId = `${idPrefix}FieldGrad`
  const clipId = `${idPrefix}OvalClip`

  return (
    <svg
      viewBox={landscape ? '0 0 700 540' : '0 0 540 700'}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#194b2e" />
          <stop offset="45%" stopColor="#1f6c3d" />
          <stop offset="100%" stopColor="#174729" />
        </linearGradient>
        <clipPath id={clipId}>
          <ellipse cx="270" cy="350" rx="265" ry="325" />
        </clipPath>
      </defs>

      {/* Content optionally rotated 90° CW for landscape: (x,y) → (700-y, x) */}
      <g transform={landscape ? 'translate(700, 0) rotate(90)' : undefined}>
        {/* Boundary oval */}
        <ellipse cx="270" cy="350" rx="265" ry="325" fill={`url(#${gradId})`} />
        <ellipse
          cx="270" cy="350" rx="265" ry="325"
          fill="none" stroke="#ffffff7a" strokeWidth="2.5"
        />

        {/* Centre line (diameter of outer centre circle only) */}
        <line
          x1="250" y1="350" x2="290" y2="350"
          stroke="#ffffff2f" strokeWidth="1.3"
          clipPath={`url(#${clipId})`}
        />

        {/* Centre square — 50m × 50m = 200px × 200px */}
        <rect
          x="170" y="250" width="200" height="200"
          fill="none" stroke="#ffffff45" strokeWidth="1.6"
          clipPath={`url(#${clipId})`}
        />

        {/* Outer centre circle — 10m diameter = r≈20px */}
        <circle
          cx="270" cy="350" r="20"
          fill="none" stroke="#ffffff55" strokeWidth="1.6"
        />

        {/* Inner centre circle — 3m diameter = r≈6px */}
        <circle
          cx="270" cy="350" r="6"
          fill="none" stroke="#ffffff2e" strokeWidth="1.2"
        />

        {/* 50m arcs */}
        <path
          d="M 92,109 A 197,197 0 0,0 448,109"
          fill="none" stroke="#ffffff70" strokeWidth="1.9"
          clipPath={`url(#${clipId})`}
        />
        <path
          d="M 92,591 A 197,197 0 0,1 448,591"
          fill="none" stroke="#ffffff70" strokeWidth="1.9"
          clipPath={`url(#${clipId})`}
        />

        {/* Top goal square */}
        <rect
          x="257.2" y="25" width="25.6" height="35.4"
          fill="none" stroke="#ffffff3a" strokeWidth="1.4"
          clipPath={`url(#${clipId})`}
        />

        {/* Bottom goal square */}
        <rect
          x="257.2" y="639.6" width="25.6" height="35.4"
          fill="none" stroke="#ffffff3a" strokeWidth="1.4"
          clipPath={`url(#${clipId})`}
        />

        {/* Top goal posts */}
        <line x1="257.2" y1="25" x2="257.2" y2="12" stroke="#ffffff95" strokeWidth="2.4" />
        <line x1="282.8" y1="25" x2="282.8" y2="12" stroke="#ffffff95" strokeWidth="2.4" />
        {/* Top behind posts */}
        <line x1="231.6" y1="25" x2="231.6" y2="12" stroke="#ffffff6a" strokeWidth="2.1" />
        <line x1="308.4" y1="25" x2="308.4" y2="12" stroke="#ffffff6a" strokeWidth="2.1" />

        {/* Bottom goal posts */}
        <line x1="257.2" y1="675" x2="257.2" y2="688" stroke="#ffffff95" strokeWidth="2.4" />
        <line x1="282.8" y1="675" x2="282.8" y2="688" stroke="#ffffff95" strokeWidth="2.4" />
        {/* Bottom behind posts */}
        <line x1="231.6" y1="675" x2="231.6" y2="688" stroke="#ffffff6a" strokeWidth="2.1" />
        <line x1="308.4" y1="675" x2="308.4" y2="688" stroke="#ffffff6a" strokeWidth="2.1" />

        {/* Wing interchange ticks */}
        <line x1="3" y1="321" x2="12" y2="321" stroke="#ffffff40" strokeWidth="1.2" />
        <line x1="3" y1="379" x2="12" y2="379" stroke="#ffffff40" strokeWidth="1.2" />
        <line x1="528" y1="321" x2="537" y2="321" stroke="#ffffff40" strokeWidth="1.2" />
        <line x1="528" y1="379" x2="537" y2="379" stroke="#ffffff40" strokeWidth="1.2" />
      </g>
    </svg>
  )
}
