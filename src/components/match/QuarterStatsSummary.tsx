import { Badge } from '@/components/ui/badge'
import type { MatchPlayerStats, QuarterScore } from '@/types/match'
import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuarterSnapshot {
  home: MatchPlayerStats[]
  away: MatchPlayerStats[]
}

// ---------------------------------------------------------------------------
// Per-quarter delta computation
// ---------------------------------------------------------------------------

function computeDelta(
  current: MatchPlayerStats[],
  prev: MatchPlayerStats[] | undefined,
): MatchPlayerStats[] {
  if (!prev) return current.map((s) => ({ ...s }))
  const prevMap = new Map(prev.map((s) => [s.playerId, s]))
  return current.map((s) => {
    const p = prevMap.get(s.playerId)
    if (!p) return { ...s }
    return {
      ...s,
      disposals:             Math.max(0, s.disposals - p.disposals),
      kicks:                 Math.max(0, s.kicks - p.kicks),
      handballs:             Math.max(0, s.handballs - p.handballs),
      marks:                 Math.max(0, s.marks - p.marks),
      tackles:               Math.max(0, s.tackles - p.tackles),
      goals:                 Math.max(0, s.goals - p.goals),
      behinds:               Math.max(0, s.behinds - p.behinds),
      hitouts:               Math.max(0, s.hitouts - p.hitouts),
      clearances:            Math.max(0, s.clearances - p.clearances),
      insideFifties:         Math.max(0, s.insideFifties - p.insideFifties),
      contestedPossessions:  Math.max(0, s.contestedPossessions - p.contestedPossessions),
    }
  })
}

// ---------------------------------------------------------------------------
// Single player row
// ---------------------------------------------------------------------------

function PlayerRow({ stats, player, rank }: { stats: MatchPlayerStats; player: Player | undefined; rank: number }) {
  const name = player ? `${player.firstName[0]}. ${player.lastName}` : '—'
  const pos  = player?.position.primary ?? '?'
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground w-4 shrink-0">{rank}.</span>
      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{pos}</Badge>
      <span className="flex-1 min-w-0 truncate font-medium">{name}</span>
      <span className="tabular-nums text-muted-foreground shrink-0 w-6 text-right">{stats.disposals}</span>
      <span className={`tabular-nums shrink-0 w-4 text-right ${stats.goals > 0 ? 'text-orange-500 font-semibold' : 'text-muted-foreground/40'}`}>{stats.goals}</span>
      <span className="tabular-nums text-muted-foreground shrink-0 w-4 text-right">{stats.marks}</span>
      <span className="tabular-nums text-muted-foreground shrink-0 w-4 text-right">{stats.tackles}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface QuarterStatsSummaryProps {
  snapshots:      QuarterSnapshot[]
  quarterNumber:  number           // 1-4
  players:        Record<string, Player>
  homeClubId:     string
  awayClubId:     string
  homeColor:      string
  awayColor:      string
  homeAbbr:       string
  awayAbbr:       string
  homeQScore?:    QuarterScore
  awayQScore?:    QuarterScore
}

export function QuarterStatsSummary({
  snapshots,
  quarterNumber,
  players,
  homeColor, awayColor,
  homeAbbr, awayAbbr,
  homeQScore, awayQScore,
}: QuarterStatsSummaryProps) {
  const currentSnap = snapshots[quarterNumber - 1]
  const prevSnap    = quarterNumber > 1 ? snapshots[quarterNumber - 2] : undefined

  if (!currentSnap) return null

  const homeDeltas = computeDelta(currentSnap.home, prevSnap?.home)
    .filter((s) => s.disposals > 0 || s.goals > 0)
    .sort((a, b) => b.disposals - a.disposals)
    .slice(0, 4)

  const awayDeltas = computeDelta(currentSnap.away, prevSnap?.away)
    .filter((s) => s.disposals > 0 || s.goals > 0)
    .sort((a, b) => b.disposals - a.disposals)
    .slice(0, 4)

  const hTotal = homeQScore?.total ?? 0
  const aTotal = awayQScore?.total ?? 0
  const qWinner =
    hTotal > aTotal ? `${homeAbbr} won Q${quarterNumber} by ${hTotal - aTotal}`
    : aTotal > hTotal ? `${awayAbbr} won Q${quarterNumber} by ${aTotal - hTotal}`
    : `Q${quarterNumber} dead heat`

  return (
    <div className="space-y-2 rounded-md border border-border/50 p-3 bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Q{quarterNumber} Player Stats
        </span>
        {homeQScore && awayQScore && (
          <span className="text-xs text-muted-foreground">{qWinner}</span>
        )}
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Home */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: homeColor }} />
              <span className="text-xs font-medium">{homeAbbr}</span>
            </div>
            {homeQScore && (
              <span className="text-xs text-muted-foreground font-mono">
                {homeQScore.goals}.{homeQScore.behinds} ({homeQScore.total})
              </span>
            )}
          </div>
          {homeDeltas.length === 0
            ? <p className="text-xs text-muted-foreground/40">No data</p>
            : <>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50 uppercase tracking-wide pr-0.5">
                  <span className="w-4 shrink-0" />
                  <span className="w-4 shrink-0" />
                  <span className="flex-1" />
                  <span className="w-6 text-right">D</span>
                  <span className="w-4 text-right">G</span>
                  <span className="w-4 text-right">M</span>
                  <span className="w-4 text-right">T</span>
                </div>
                {homeDeltas.map((s, i) => (
                  <PlayerRow key={s.playerId} stats={s} player={players[s.playerId]} rank={i + 1} />
                ))}
              </>}
        </div>

        {/* Away */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
              <span className="text-xs font-medium">{awayAbbr}</span>
            </div>
            {awayQScore && (
              <span className="text-xs text-muted-foreground font-mono">
                {awayQScore.goals}.{awayQScore.behinds} ({awayQScore.total})
              </span>
            )}
          </div>
          {awayDeltas.length === 0
            ? <p className="text-xs text-muted-foreground/40">No data</p>
            : <>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50 uppercase tracking-wide pr-0.5">
                  <span className="w-4 shrink-0" />
                  <span className="w-4 shrink-0" />
                  <span className="flex-1" />
                  <span className="w-6 text-right">D</span>
                  <span className="w-4 text-right">G</span>
                  <span className="w-4 text-right">M</span>
                  <span className="w-4 text-right">T</span>
                </div>
                {awayDeltas.map((s, i) => (
                  <PlayerRow key={s.playerId} stats={s} player={players[s.playerId]} rank={i + 1} />
                ))}
              </>}
        </div>
      </div>
    </div>
  )
}
