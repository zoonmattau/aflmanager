import { useEffect, useRef, useState } from 'react'
import type { FieldZone, MatchTick, PossessionType } from '@/types/matchTick'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POSSESSION_LABEL: Partial<Record<PossessionType, string>> = {
  kick: 'Kick',
  handball: 'Handball',
  mark: 'Mark',
  tackle: 'Tackle',
  clearance: 'Clearance',
  contest: 'Contest',
  'free-for': 'Free',
  goal: 'GOAL',
  behind: 'Behind',
  spoil: 'Spoil',
  'out-of-bounds': 'Out of Bounds',
  'ball-up': 'Ball-up',
  'out-on-full': 'Out on Full',
}

const ZONE_LABELS: Record<string, string> = {
  back50: 'B50',
  backHalf: 'BHF',
  midfield: 'MID',
  forwardHalf: 'FHF',
  forward50: 'F50',
}

const ZONE_ORDER: FieldZone[] = ['back50', 'backHalf', 'midfield', 'forwardHalf', 'forward50']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PossessionChainViewProps {
  ticks: MatchTick[]
  currentIndex: number
  homeClubId: string
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
  /** When true, suppress outer border/rounding (parent provides container). */
  noBorder?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PossessionChainView({
  ticks,
  currentIndex,
  homeClubId,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  noBorder = false,
}: PossessionChainViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track a completed chain snapshot for the flash-then-fade animation
  const [flashChain, setFlashChain] = useState<{
    links: MatchTick[]
    teamColor: string
    outcome: 'goal' | 'behind'
  } | null>(null)
  const [flashVisible, setFlashVisible] = useState(false)
  const lastFlashTickRef = useRef<number>(-1)

  // ----- Derive current chain -----
  const latestTick = currentIndex > 0 ? ticks[currentIndex - 1] : null
  const currentChainId = latestTick?.chainId ?? -1

  // All revealed ticks belonging to the current chain
  const allChainTicks = currentIndex > 0
    ? ticks.slice(0, currentIndex).filter(t => t.chainId === currentChainId)
    : []

  // Possession links (exclude score/injury ticks from the card row)
  const possessionLinks = allChainTicks.filter(
    t => t.possessionType !== 'goal' &&
         t.possessionType !== 'behind' &&
         t.possessionType !== 'injury' &&
         t.possessionType !== 'interchange',
  )

  const outcome: 'building' | 'goal' | 'behind' =
    latestTick?.possessionType === 'goal' ? 'goal' :
    latestTick?.possessionType === 'behind' ? 'behind' :
    'building'

  const teamId = latestTick?.clubId ?? ''
  const teamColor = teamId === homeClubId ? homeColor : awayColor
  const teamAbbr = teamId === homeClubId ? homeAbbr : awayAbbr

  // ----- Flash animation on goal / behind -----
  useEffect(() => {
    if (!latestTick) return
    const tickIdx = latestTick.tickIndex
    if (tickIdx === lastFlashTickRef.current) return

    if (latestTick.possessionType === 'goal' || latestTick.possessionType === 'behind') {
      lastFlashTickRef.current = tickIdx
      // Snapshot the possession links for the flash display
      const snapshotLinks = ticks
        .slice(0, currentIndex)
        .filter(t => t.chainId === currentChainId &&
          t.possessionType !== 'goal' &&
          t.possessionType !== 'behind' &&
          t.possessionType !== 'injury')
      setFlashChain({
        links: snapshotLinks,
        teamColor,
        outcome: latestTick.possessionType as 'goal' | 'behind',
      })
      setFlashVisible(true)
      const t = setTimeout(() => setFlashVisible(false), 2200)
      const t2 = setTimeout(() => setFlashChain(null), 2700)
      return () => { clearTimeout(t); clearTimeout(t2) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTick?.tickIndex])

  // ----- Auto-scroll chain links to newest -----
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [currentIndex])

  // ----- Determine what to render -----
  const showFlash = flashChain !== null
  const displayLinks = showFlash ? flashChain!.links : possessionLinks
  const displayColor = showFlash ? flashChain!.teamColor : teamColor
  const displayOutcome = showFlash ? flashChain!.outcome : outcome
  const displayAbbr = showFlash
    ? (flashChain!.teamColor === homeColor ? homeAbbr : awayAbbr)
    : teamAbbr

  // Zones visited by the displayed chain
  const visitedZones = new Set(displayLinks.map(l => l.zone))

  // Flash outcome color
  const outcomeColor =
    displayOutcome === 'goal' ? '#22c55e' :
    displayOutcome === 'behind' ? '#f97316' :
    displayColor

  const containerBorder =
    displayOutcome === 'goal' ? 'border-green-500/70' :
    displayOutcome === 'behind' ? 'border-orange-500/70' :
    'border-border'

  // When flashing, dim the whole container to fade out
  const containerOpacity = showFlash && !flashVisible ? 'opacity-0' : 'opacity-100'

  // ----- Empty state -----
  if (currentIndex === 0) {
    return (
      <div className={`${noBorder ? '' : 'rounded-md border'} bg-card px-3 py-2 min-h-[5.5rem] flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground">Waiting for first possession…</span>
      </div>
    )
  }

  return (
    <div
      className={`${noBorder ? '' : 'rounded-md border'} bg-card p-2 space-y-1.5 min-h-[5.5rem] transition-all duration-500 ${containerBorder} ${containerOpacity}`}
      style={
        displayOutcome === 'goal'
          ? { backgroundColor: 'rgba(34,197,94,0.06)' }
          : displayOutcome === 'behind'
            ? { backgroundColor: 'rgba(249,115,22,0.06)' }
            : undefined
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: displayColor }}
          />
          <span className="text-[11px] font-bold">{displayAbbr}</span>
          <span className="text-[10px] text-muted-foreground">possession chain</span>
          {displayLinks.length > 0 && (
            <span
              className="inline-flex items-center rounded px-1 py-0 text-[9px] font-bold"
              style={{ backgroundColor: `${displayColor}33`, color: displayColor }}
            >
              {displayLinks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Zone pills */}
          {ZONE_ORDER.map((zone) => (
            <span
              key={zone}
              className="rounded px-1 py-0.5 text-[8px] font-medium transition-colors duration-300"
              style={
                visitedZones.has(zone)
                  ? { backgroundColor: `${displayColor}55`, color: displayColor }
                  : {}
              }
            >
              {!visitedZones.has(zone) && (
                <span className="text-muted-foreground/40">{ZONE_LABELS[zone]}</span>
              )}
              {visitedZones.has(zone) && ZONE_LABELS[zone]}
            </span>
          ))}

          {/* Outcome badge */}
          {displayOutcome === 'goal' && (
            <span className="ml-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
              GOAL!
            </span>
          )}
          {displayOutcome === 'behind' && (
            <span className="ml-1 rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">
              BEHIND
            </span>
          )}
          {displayOutcome === 'building' && displayLinks.length > 0 && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground animate-pulse">
              ●
            </span>
          )}
        </div>
      </div>

      {/* Chain link row */}
      {displayLinks.length === 0 ? (
        <div className="text-[10px] text-muted-foreground italic px-1">
          {latestTick?.possessionType === 'goal'
            ? 'Scored direct — no buildup chain.'
            : latestTick?.possessionType === 'behind'
              ? 'Behind — no buildup chain.'
              : latestTick?.possessionType === 'injury'
                ? 'Injury stoppage — play resuming…'
                : latestTick?.possessionType === 'clearance'
                  ? 'Chain starting from clearance…'
                  : latestTick?.possessionType === 'ball-up'
                    ? 'Ball-up — play resuming…'
                    : latestTick?.possessionType === 'out-of-bounds'
                      ? 'Throw-in — play resuming…'
                      : 'Possession building…'}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex flex-row items-center gap-0 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: 'none' }}
        >
          {displayLinks.map((link, idx) => {
            const isLast = idx === displayLinks.length - 1
            const cardBg = displayOutcome !== 'building' && isLast
              ? (displayOutcome === 'goal' ? 'rgba(34,197,94,0.25)' : 'rgba(249,115,22,0.2)')
              : `${outcomeColor}1a`
            const cardBorder = displayOutcome !== 'building' && isLast
              ? (displayOutcome === 'goal' ? '#22c55e' : '#f97316')
              : displayColor

            const displayName = link.playerName
              ? link.playerName.length > 14 ? link.playerName.slice(0, 13) + '.' : link.playerName
              : '—'

            return (
              <div key={`${link.tickIndex}-${idx}`} className="flex items-center flex-shrink-0">
                {/* Link card */}
                <div
                  className="flex-shrink-0 flex flex-col items-start justify-between rounded border-2 px-1.5 py-1 transition-colors duration-300"
                  style={{
                    width: 72,
                    height: 52,
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                  }}
                >
                  <span
                    className="text-[9px] font-bold leading-tight truncate w-full"
                    style={{ color: outcomeColor }}
                  >
                    {displayName}
                  </span>
                  <div>
                    <span className="block text-[8px] text-muted-foreground leading-none">
                      {POSSESSION_LABEL[link.possessionType] ?? link.possessionType}
                    </span>
                    <span className="block text-[7px] text-muted-foreground/60 leading-none">
                      {ZONE_LABELS[link.zone] ?? link.zone}
                    </span>
                  </div>
                </div>

                {/* Arrow connector (not after last) */}
                {!isLast && (
                  <span className="flex-shrink-0 text-muted-foreground/50 text-[10px] px-0.5 select-none">
                    →
                  </span>
                )}
              </div>
            )
          })}

          {/* Outcome terminal node */}
          {displayOutcome === 'goal' && (
            <div className="flex items-center flex-shrink-0">
              <span className="flex-shrink-0 text-muted-foreground/50 text-[10px] px-0.5 select-none">→</span>
              <div
                className="flex-shrink-0 flex items-center justify-center rounded border-2 border-green-500 text-green-400 font-bold text-[9px]"
                style={{ width: 52, height: 52, backgroundColor: 'rgba(34,197,94,0.15)' }}
              >
                GOAL!<br />6 pts
              </div>
            </div>
          )}
          {displayOutcome === 'behind' && (
            <div className="flex items-center flex-shrink-0">
              <span className="flex-shrink-0 text-muted-foreground/50 text-[10px] px-0.5 select-none">→</span>
              <div
                className="flex-shrink-0 flex items-center justify-center rounded border-2 border-orange-500 text-orange-400 font-bold text-[9px]"
                style={{ width: 52, height: 52, backgroundColor: 'rgba(249,115,22,0.12)' }}
              >
                BEHIND<br />1 pt
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
