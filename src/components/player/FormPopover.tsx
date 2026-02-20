import { type ReactElement, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FormDots } from '@/components/player/FormDots'
import { getPlayerRecentGames, computeL5Averages } from '@/lib/formGuide'
import { matchRatingColorClass } from '@/engine/match/matchRatings'

interface FormPopoverProps {
  playerId: string
  ratings?: number[]
  /** If true, clicking the dots opens the player profile instead of a popover. */
  linkToProfile?: boolean
}

function roundLabel(round: number, isFinal: boolean): string {
  if (isFinal) return 'Final'
  return `Rd ${round + 1}`
}

function resultBadge(won: boolean | null): ReactElement {
  if (won === true) return <span className="text-[10px] font-bold text-green-500">W</span>
  if (won === false) return <span className="text-[10px] font-bold text-red-500">L</span>
  return <span className="text-[10px] font-bold text-zinc-500">D</span>
}

export function FormPopover({ playerId, ratings, linkToProfile = false }: FormPopoverProps) {
  const matchResults = useGameStore((s) => s.matchResults)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)

  const recentGames = useMemo(
    () => getPlayerRecentGames(playerId, matchResults, 5),
    [playerId, matchResults],
  )

  const l5Avgs = useMemo(() => computeL5Averages(recentGames), [recentGames])

  const player = players[playerId]

  const trigger = (
    <button type="button" className="flex items-center gap-1 focus:outline-none">
      <FormDots ratings={ratings} />
    </button>
  )

  if (recentGames.length === 0) {
    // No game data yet — just show the dots with no popup
    return <FormDots ratings={ratings} />
  }

  const seasonStats = player?.seasonStats
  const seasonGP = seasonStats?.gamesPlayed ?? 0
  const seasonDisp = seasonGP > 0 ? (seasonStats!.disposals / seasonGP) : 0
  const seasonGoals = seasonGP > 0 ? (seasonStats!.goals / seasonGP) : 0
  const seasonRating = player?.matchRatingHistory?.length
    ? player.matchRatingHistory.reduce((a, b) => a + b, 0) / player.matchRatingHistory.length
    : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 p-3 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Last 5 Games</span>
          {linkToProfile && player && (
            <Link
              to={`/player/${encodeURIComponent(playerId)}`}
              className="text-[10px] text-muted-foreground hover:underline"
            >
              Profile →
            </Link>
          )}
        </div>

        {/* Per-game table */}
        <div className="space-y-1">
          <div className="grid grid-cols-[3rem_3rem_2rem_2.5rem_2.5rem_2.5rem_2.5rem] gap-x-1 text-[10px] text-muted-foreground font-medium px-1">
            <span>Round</span>
            <span>Opp</span>
            <span></span>
            <span className="text-right">Disp</span>
            <span className="text-right">G</span>
            <span className="text-right">Tck</span>
            <span className="text-right">Rtg</span>
          </div>
          {recentGames.map((g) => {
            const opp = clubs[g.opponentClubId]
            const rating = g.stats.matchRating
            return (
              <div
                key={g.matchId}
                className="grid grid-cols-[3rem_3rem_2rem_2.5rem_2.5rem_2.5rem_2.5rem] gap-x-1 items-center rounded px-1 py-0.5 hover:bg-muted/40"
              >
                <span className="text-muted-foreground">{roundLabel(g.round, g.isFinal)}</span>
                <span className="font-medium truncate">{opp?.abbreviation ?? '???'}</span>
                <span>{resultBadge(g.won)}</span>
                <span className="text-right tabular-nums font-mono">{g.stats.disposals}</span>
                <span className="text-right tabular-nums font-mono">{g.stats.goals}</span>
                <span className="text-right tabular-nums font-mono">{g.stats.tackles}</span>
                <span className={`text-right tabular-nums font-mono font-bold ${matchRatingColorClass(rating)}`}>
                  {rating !== undefined ? rating.toFixed(1) : '—'}
                </span>
              </div>
            )
          })}
        </div>

        {/* L5 vs Season avg */}
        <div className="border-t border-border/60 pt-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">L5 vs Season Avg</p>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Disp</p>
              <p className="font-mono font-bold">{l5Avgs.disposals.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">/ {seasonDisp.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Goals</p>
              <p className="font-mono font-bold">{l5Avgs.goals.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">/ {seasonGoals.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Rating</p>
              <p className={`font-mono font-bold ${l5Avgs.rating > 0 ? matchRatingColorClass(l5Avgs.rating) : ''}`}>
                {l5Avgs.rating > 0 ? l5Avgs.rating.toFixed(1) : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                / {seasonRating !== null ? seasonRating.toFixed(1) : '—'}
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
