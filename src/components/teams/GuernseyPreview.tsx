import type { GuernseyPattern } from '@/types/club'

interface GuernseyPreviewProps {
  pattern: GuernseyPattern
  colors: [string, string]
  size?: number
}

function patternToSvg(pattern: GuernseyPattern, c1: string, c2: string, w: number, h: number): React.ReactNode {
  switch (pattern) {
    case 'solid':
      return <rect width={w} height={h} fill={c1} />
    case 'vertical-stripes': {
      const count = 4
      const sw = w / (count * 2)
      return (
        <>
          <rect width={w} height={h} fill={c2} />
          {Array.from({ length: count }, (_, i) => (
            <rect key={i} x={i * sw * 2} y={0} width={sw} height={h} fill={c1} />
          ))}
        </>
      )
    }
    case 'horizontal-hoops': {
      const count = 4
      const sh = h / (count * 2)
      return (
        <>
          <rect width={w} height={h} fill={c2} />
          {Array.from({ length: count }, (_, i) => (
            <rect key={i} x={0} y={i * sh * 2} width={w} height={sh} fill={c1} />
          ))}
        </>
      )
    }
    case 'v-stripe':
      return (
        <>
          <rect width={w} height={h} fill={c1} />
          <polygon points={`${w / 2},0 ${w * 0.3},${h} ${w * 0.7},${h}`} fill={c2} />
        </>
      )
    case 'chevron':
      return (
        <>
          <rect width={w} height={h} fill={c1} />
          <polygon points={`0,0 ${w},0 ${w / 2},${h * 0.4}`} fill={c2} />
        </>
      )
    case 'sash':
      return (
        <>
          <rect width={w} height={h} fill={c1} />
          <polygon points={`0,0 ${w * 0.35},0 ${w},${h} ${w * 0.65},${h}`} fill={c2} />
        </>
      )
    case 'yoke':
      return (
        <>
          <rect width={w} height={h} fill={c1} />
          <polygon points={`0,0 ${w},0 ${w},${h * 0.35} ${w / 2},${h * 0.5} 0,${h * 0.35}`} fill={c2} />
        </>
      )
    case 'halves':
      return (
        <>
          <rect width={w / 2} height={h} fill={c1} />
          <rect x={w / 2} width={w / 2} height={h} fill={c2} />
        </>
      )
  }
}

export function GuernseyPreview({ pattern, colors, size = 48 }: GuernseyPreviewProps) {
  const w = size
  const h = Math.round(size * 1.25)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded border border-border">
      {patternToSvg(pattern, colors[0], colors[1], w, h)}
    </svg>
  )
}
