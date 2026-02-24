/**
 * PlayerLeadersMini — compact top-5-per-team leaderboard for the command center right panel.
 * Shows K, H, M, T, G, B with a green/red TOG indicator for on-ground status.
 *
 * Reads from a shared livePlayerStats map (single source of truth computed in LiveMatchView)
 * so the numbers always match the spectator stat popup.
 */

import { useMemo } from 'react'
import type { MatchContext } from '@/engine/match/simulateMatch'
import type { Player } from '@/types/player'
import type { MatchPlayerStats } from '@/types/match'

interface PlayerLeadersMiniProps {
  ctx: MatchContext | null
  homeClubId: string
  homeColor: string
  awayColor: string
  homeAbbr: string
  awayAbbr: string
  players: Record<string, Player>
  /** Pre-computed per-player stats from revealed ticks (shared with stat popup). */
  livePlayerStats: Record<string, MatchPlayerStats>
  /** How many leaders per team to show. Default 5. */
  count?: number
}

interface PlayerAccum {
  playerId: string
  kicks: number
  handballs: number
  marks: number
  tackles: number
  goals: number
  behinds: number
}

function LeaderRow({
  stat,
  player,
  teamColor,
  onGround,
}: {
  stat: PlayerAccum
  player: Player | undefined
  teamColor: string
  onGround: boolean
}) {
  const surname = player
    ? player.lastName.length > 9
      ? player.lastName.slice(0, 9) + '.'
      : player.lastName
    : '—'
  const num = player?.jerseyNumber ?? ''

  return (
    <div className="flex items-center gap-0.5 text-[10px] leading-tight py-px">
      {/* TOG indicator */}
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: onGround ? '#22c55e' : '#ef4444' }}
        title={onGround ? 'On ground' : 'On bench'}
      />
      <span className="w-3.5 text-right tabular-nums text-muted-foreground shrink-0" style={{ fontSize: 9 }}>
        {num}
      </span>
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: teamColor }}
      />
      <span className="flex-1 min-w-0 truncate font-medium">{surname}</span>
      <span className="w-3 text-right tabular-nums text-muted-foreground">{stat.kicks}</span>
      <span className="w-3 text-right tabular-nums text-muted-foreground">{stat.handballs}</span>
      <span className="w-3 text-right tabular-nums text-muted-foreground">{stat.marks}</span>
      <span className="w-3 text-right tabular-nums text-muted-foreground">{stat.tackles}</span>
      <span className={`w-3 text-right tabular-nums ${stat.goals > 0 ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}`}>
        {stat.goals || ''}
      </span>
      <span className={`w-3 text-right tabular-nums ${stat.behinds > 0 ? 'text-sky-400' : 'text-muted-foreground'}`}>
        {stat.behinds || ''}
      </span>
    </div>
  )
}

export function PlayerLeadersMini({
  ctx,
  homeClubId,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  players,
  livePlayerStats,
  count = 5,
}: PlayerLeadersMiniProps) {
  // Build set of player IDs currently on the ground from match context
  const onGroundIds = useMemo(() => {
    const ids = new Set<string>()
    if (ctx) {
      for (const p of ctx.homeActivePlayers) ids.add(p.id)
      for (const p of ctx.awayActivePlayers) ids.add(p.id)
    }
    return ids
  }, [ctx])

  // Derive sorted leaders from the shared livePlayerStats map
  const { homeLeaders, awayLeaders } = useMemo(() => {
    const homeArr: PlayerAccum[] = []
    const awayArr: PlayerAccum[] = []

    // Get all home and away player IDs from the match context
    const homePlayerIds = new Set<string>()
    const awayPlayerIds = new Set<string>()
    if (ctx) {
      for (const p of ctx.homePlayers) homePlayerIds.add(p.id)
      for (const p of ctx.awayPlayers) awayPlayerIds.add(p.id)
    }

    for (const [pid, s] of Object.entries(livePlayerStats)) {
      const accum: PlayerAccum = {
        playerId: pid,
        kicks: s.kicks,
        handballs: s.handballs,
        marks: s.marks,
        tackles: s.tackles,
        goals: s.goals,
        behinds: s.behinds,
      }
      if (accum.kicks + accum.handballs + accum.marks + accum.tackles + accum.goals + accum.behinds === 0) continue
      if (homePlayerIds.has(pid)) homeArr.push(accum)
      else if (awayPlayerIds.has(pid)) awayArr.push(accum)
    }

    const sort = (arr: PlayerAccum[]) =>
      arr
        .sort((a, b) => (b.kicks + b.handballs) - (a.kicks + a.handballs))
        .slice(0, count)

    return {
      homeLeaders: sort(homeArr),
      awayLeaders: sort(awayArr),
    }
  }, [livePlayerStats, ctx, count])

  if (homeLeaders.length === 0 && awayLeaders.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Player Leaders
        </span>
        <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground tabular-nums">
          <span className="w-3 text-right">K</span>
          <span className="w-3 text-right">H</span>
          <span className="w-3 text-right">M</span>
          <span className="w-3 text-right">T</span>
          <span className="w-3 text-right">G</span>
          <span className="w-3 text-right">B</span>
        </div>
      </div>

      {/* Home team leaders */}
      <div>
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
          style={{ color: homeColor }}
        >
          {homeAbbr}
        </div>
        {homeLeaders.map((stat) => (
          <LeaderRow
            key={stat.playerId}
            stat={stat}
            player={players[stat.playerId]}
            teamColor={homeColor}
            onGround={onGroundIds.has(stat.playerId)}
          />
        ))}
      </div>

      {/* Away team leaders */}
      <div>
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
          style={{ color: awayColor }}
        >
          {awayAbbr}
        </div>
        {awayLeaders.map((stat) => (
          <LeaderRow
            key={stat.playerId}
            stat={stat}
            player={players[stat.playerId]}
            teamColor={awayColor}
            onGround={onGroundIds.has(stat.playerId)}
          />
        ))}
      </div>
    </div>
  )
}
