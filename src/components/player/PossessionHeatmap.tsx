import type { FieldZone } from '@/types/matchTick'

interface PossessionHeatmapProps {
  zonePossessions: Partial<Record<FieldZone, number>> | undefined
  label?: string
}

const ZONE_ORDER: FieldZone[] = ['back50', 'backHalf', 'midfield', 'forwardHalf', 'forward50']
const ZONE_LABELS: Record<FieldZone, string> = {
  back50: 'B50',
  backHalf: 'BH',
  midfield: 'MID',
  forwardHalf: 'FH',
  forward50: 'F50',
}

/**
 * Portrait coordinate system (540 × 700, ellipse at 270,350 rx=265 ry=325).
 * Top = defending end (back50), bottom = attacking end (forward50).
 * These are the y-band boundaries in portrait coords — the <g> rotation
 * inside FieldSvg handles landscape transformation.
 */
const ZONE_BANDS: Record<FieldZone, { y: number; h: number }> = {
  back50:      { y:  25, h: 115 },
  backHalf:    { y: 140, h: 130 },
  midfield:    { y: 270, h: 160 },
  forwardHalf: { y: 430, h: 130 },
  forward50:   { y: 560, h: 115 },
}

export function PossessionHeatmap({ zonePossessions, label }: PossessionHeatmapProps) {
  const zones = zonePossessions ?? {}
  const counts = ZONE_ORDER.map((z) => zones[z] ?? 0)
  const total = counts.reduce((s, c) => s + c, 0)
  const maxCount = Math.max(...counts, 1)

  const clipId = 'poss-heatmap-OvalClip'
  const gradId = 'poss-heatmap-FieldGrad'

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center">
          {label}
        </p>
      )}
      <div className="relative w-full" style={{ aspectRatio: '700 / 540' }}>
        <svg
          viewBox="0 0 700 540"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
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

          {/* Landscape rotation — same transform as FieldSvg */}
          <g transform="translate(700, 0) rotate(90)">
            {/* Boundary oval */}
            <ellipse cx="270" cy="350" rx="265" ry="325" fill={`url(#${gradId})`} />
            <ellipse
              cx="270" cy="350" rx="265" ry="325"
              fill="none" stroke="#ffffff7a" strokeWidth="2.5"
            />

            {/* Centre square */}
            <rect
              x="170" y="250" width="200" height="200"
              fill="none" stroke="#ffffff20" strokeWidth="1.2"
              clipPath={`url(#${clipId})`}
            />

            {/* Centre circle */}
            <circle cx="270" cy="350" r="20" fill="none" stroke="#ffffff30" strokeWidth="1.2" />

            {/* 50m arcs */}
            <path
              d="M 92,109 A 197,197 0 0,0 448,109"
              fill="none" stroke="#ffffff35" strokeWidth="1.5"
              clipPath={`url(#${clipId})`}
            />
            <path
              d="M 92,591 A 197,197 0 0,1 448,591"
              fill="none" stroke="#ffffff35" strokeWidth="1.5"
              clipPath={`url(#${clipId})`}
            />

            {/* Zone heatmap bands — clipped to the oval */}
            {ZONE_ORDER.map((zone, i) => {
              const band = ZONE_BANDS[zone]
              const count = counts[i]
              const intensity = total > 0 ? 0.05 + (count / maxCount) * 0.50 : 0
              return (
                <rect
                  key={zone}
                  x="0"
                  y={band.y}
                  width="540"
                  height={band.h}
                  fill="#f59e0b"
                  opacity={intensity}
                  clipPath={`url(#${clipId})`}
                />
              )
            })}

            {/* Zone count labels */}
            {ZONE_ORDER.map((zone, i) => {
              const band = ZONE_BANDS[zone]
              const count = counts[i]
              const cy = band.y + band.h / 2
              return (
                <g key={`label-${zone}`}>
                  <text
                    x="270"
                    y={cy - 6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffffcc"
                    fontSize="18"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {count}
                  </text>
                  <text
                    x="270"
                    y={cy + 14}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff80"
                    fontSize="11"
                    fontFamily="sans-serif"
                  >
                    {ZONE_LABELS[zone]}
                  </text>
                </g>
              )
            })}

            {/* Boundary stroke on top of zones */}
            <ellipse
              cx="270" cy="350" rx="265" ry="325"
              fill="none" stroke="#ffffff7a" strokeWidth="2.5"
            />
          </g>
        </svg>
      </div>
      {total > 0 && (
        <p className="text-[10px] text-muted-foreground text-center tabular-nums">
          {total} total possessions
        </p>
      )}
    </div>
  )
}
