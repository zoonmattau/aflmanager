import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Activity,
  Target,
  Zap,
  Layers,
  Shield,
  ArrowUpCircle,
  Star,
  Trophy,
  Award,
  Swords,
  TrendingUp,
  BarChart3,
  Shuffle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Newspaper,
} from 'lucide-react'
import { computeRoundWrap } from '@/engine/season/roundWrap'
import { getFixtureDateIso } from '@/engine/season/fixtureDateUtils'
import type { RoundWrapPlayerLeader, RoundWrapMatchStat } from '@/types/roundWrap'
import type { Club } from '@/types/club'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtScore(goals: number, behinds: number, total: number): string {
  return `${goals}.${behinds} (${total})`
}

function fmtDateRange(seasonStartDate: string, roundIdx: number, matchDays: (string | undefined)[]): string {
  const unique = [...new Set(matchDays)].map((d) =>
    getFixtureDateIso(seasonStartDate, roundIdx, d as Parameters<typeof getFixtureDateIso>[2]),
  )
  unique.sort()
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  if (unique.length === 0) return ''
  if (unique[0] === unique[unique.length - 1]) return fmt(unique[0])
  return `${fmt(unique[0])} – ${fmt(unique[unique.length - 1])}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ClubDot({ club }: { club: Club | undefined }) {
  if (!club) return null
  return (
    <span
      className="inline-block h-2 w-2 rounded-full shrink-0"
      style={{ backgroundColor: club.colors.primary }}
    />
  )
}

function PlayerLeaderCard({
  icon,
  label,
  leader,
  clubs,
}: {
  icon: React.ReactNode
  label: string
  leader: RoundWrapPlayerLeader | null
  clubs: Record<string, Club>
}) {
  const club = leader ? clubs[leader.clubId] : undefined
  return (
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="h-3.5 w-3.5 shrink-0">{icon}</span>
        {label}
      </div>
      {leader ? (
        <>
          <Link
            to={`/player/${encodeURIComponent(leader.playerId)}`}
            className="text-sm font-semibold leading-tight hover:underline hover:text-primary"
          >
            {leader.playerName}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClubDot club={club} />
            <span>{club?.abbreviation ?? leader.clubId}</span>
          </div>
          <div className="mt-auto pt-1 text-base font-bold tabular-nums">
            {label === 'Match Rating' || label === 'BOG'
              ? leader.value.toFixed(1)
              : label === 'SuperCoach' || label === 'AFL Fantasy'
                ? leader.value.toLocaleString()
                : leader.value}
            {leader.secondary && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {leader.secondary}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground italic">No data</p>
      )}
    </div>
  )
}

function TeamStatCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="h-3.5 w-3.5 shrink-0">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  )
}

function MatchScoreLine({
  stat,
  clubs,
  highlightClubId,
}: {
  stat: RoundWrapMatchStat
  clubs: Record<string, Club>
  highlightClubId?: string
}) {
  const home = clubs[stat.homeClubId]
  const away = clubs[stat.awayClubId]
  const homeWon = stat.homeScore > stat.awayScore
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <span
        className={`font-medium ${
          highlightClubId && stat.homeClubId === highlightClubId ? 'text-primary' : ''
        } ${homeWon ? '' : 'text-muted-foreground'}`}
      >
        {home?.abbreviation ?? stat.homeClubId}
      </span>
      <span className="tabular-nums font-mono text-[11px]">
        {fmtScore(stat.homeGoals, stat.homeBehinds, stat.homeScore)}
        {' – '}
        {fmtScore(stat.awayGoals, stat.awayBehinds, stat.awayScore)}
      </span>
      <span
        className={`font-medium text-right ${
          highlightClubId && stat.awayClubId === highlightClubId ? 'text-primary' : ''
        } ${homeWon ? 'text-muted-foreground' : ''}`}
      >
        {away?.abbreviation ?? stat.awayClubId}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RoundWrapModalProps {
  roundIdx: number | null
  open: boolean
  onClose: () => void
}

export function RoundWrapModal({ roundIdx, open, onClose }: RoundWrapModalProps) {
  const matchResults = useGameStore((s) => s.matchResults)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const season = useGameStore((s) => s.season)
  const settings = useGameStore((s) => s.settings)
  const playerClubId = useGameStore((s) => s.playerClubId)

  const wrapData = useMemo(() => {
    if (roundIdx === null) return null
    const round = season?.rounds?.[roundIdx]
    if (!round) return null

    const dateRange = fmtDateRange(
      settings.seasonStartDate,
      roundIdx,
      round.fixtures.map((f) => f.matchDay),
    )

    return computeRoundWrap({
      roundIdx,
      roundName: round.name,
      dateRange,
      allMatches: matchResults,
      ladder,
      players,
      clubs,
      playerClubId,
    })
  }, [roundIdx, matchResults, players, clubs, ladder, season, settings.seasonStartDate, playerClubId])

  const playerClub = clubs[playerClubId]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            {wrapData?.roundName ?? 'Round Wrap'}
            {wrapData?.dateRange && (
              <span className="text-sm font-normal text-muted-foreground">
                {wrapData.dateRange}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!wrapData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No results available for this round yet.
          </p>
        ) : (
          <div className="space-y-5">

            {/* ── Your Result ──────────────────────────────────────────── */}
            {wrapData.userMatch && (
              <div
                className={`rounded-lg border-2 p-4 ${
                  wrapData.userMatch.won
                    ? 'border-green-500/50 bg-green-500/5'
                    : wrapData.userMatch.drew
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {wrapData.userMatch.won ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : wrapData.userMatch.drew ? (
                    <MinusCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Your Result
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      wrapData.userMatch.won
                        ? 'border-green-500/50 text-green-600'
                        : wrapData.userMatch.drew
                          ? 'border-amber-500/50 text-amber-600'
                          : 'border-red-500/40 text-red-600'
                    }
                  >
                    {wrapData.userMatch.won
                      ? `Win by ${wrapData.userMatch.margin} pts`
                      : wrapData.userMatch.drew
                        ? 'Draw'
                        : `Loss by ${wrapData.userMatch.margin} pts`}
                  </Badge>
                </div>

                {/* Score line */}
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <ClubDot club={clubs[wrapData.userMatch.homeClubId]} />
                    <span
                      className={`font-bold ${
                        wrapData.userMatch.homeClubId === playerClubId ? 'text-primary' : ''
                      }`}
                    >
                      {clubs[wrapData.userMatch.homeClubId]?.abbreviation ?? wrapData.userMatch.homeClubId}
                    </span>
                  </div>
                  <div className="text-center font-mono text-base font-bold tabular-nums">
                    {fmtScore(
                      wrapData.userMatch.homeGoals,
                      wrapData.userMatch.homeBehinds,
                      wrapData.userMatch.homeScore,
                    )}
                    <span className="mx-2 text-muted-foreground font-normal">–</span>
                    {fmtScore(
                      wrapData.userMatch.awayGoals,
                      wrapData.userMatch.awayBehinds,
                      wrapData.userMatch.awayScore,
                    )}
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <span
                      className={`font-bold ${
                        wrapData.userMatch.awayClubId === playerClubId ? 'text-primary' : ''
                      }`}
                    >
                      {clubs[wrapData.userMatch.awayClubId]?.abbreviation ?? wrapData.userMatch.awayClubId}
                    </span>
                    <ClubDot club={clubs[wrapData.userMatch.awayClubId]} />
                  </div>
                </div>

                {/* Best player callout */}
                {wrapData.userMatch.bestPlayer && (
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 text-xs">
                    <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-muted-foreground">Best:</span>
                    <Link
                      to={`/player/${encodeURIComponent(wrapData.userMatch.bestPlayer.playerId)}`}
                      className="font-semibold hover:underline hover:text-primary"
                    >
                      {wrapData.userMatch.bestPlayer.playerName}
                    </Link>
                    {wrapData.userMatch.bestPlayer.secondary && (
                      <span className="text-muted-foreground">
                        — {wrapData.userMatch.bestPlayer.secondary}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Review Blurb ────────────────────────────────────────── */}
            <div className="rounded-md bg-muted/40 border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Round in Review
              </p>
              <p className="text-sm leading-relaxed italic text-foreground/80">
                {wrapData.reviewBlurb}
              </p>
            </div>

            {/* ── All Round Results ────────────────────────────────────── */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                All Results
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {wrapData.allResults.map((stat) => (
                  <div
                    key={stat.matchId}
                    className={`rounded border px-3 py-1.5 ${
                      stat.homeClubId === playerClubId || stat.awayClubId === playerClubId
                        ? 'border-primary/40 bg-primary/5'
                        : ''
                    }`}
                  >
                    <MatchScoreLine stat={stat} clubs={clubs} highlightClubId={playerClubId} />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* ── Player Awards ────────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Player Awards
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <PlayerLeaderCard
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label="Disposals"
                  leader={wrapData.disposalsLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Target className="h-3.5 w-3.5" />}
                  label="Goals"
                  leader={wrapData.goalsLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Zap className="h-3.5 w-3.5" />}
                  label="Clearances"
                  leader={wrapData.clearancesLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Marks"
                  leader={wrapData.marksLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Tackles"
                  leader={wrapData.tacklesLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
                  label="Hitouts"
                  leader={wrapData.hitoutsLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Star className="h-3.5 w-3.5" />}
                  label="BOG"
                  leader={wrapData.matchRatingLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Trophy className="h-3.5 w-3.5" />}
                  label="SuperCoach"
                  leader={wrapData.superCoachLeader}
                  clubs={clubs}
                />
                <PlayerLeaderCard
                  icon={<Award className="h-3.5 w-3.5" />}
                  label="AFL Fantasy"
                  leader={wrapData.fantasyLeader}
                  clubs={clubs}
                />
              </div>
            </div>

            <Separator />

            {/* ── Team Stats ───────────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Team Stats
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

                {/* Biggest Win */}
                <TeamStatCard icon={<Swords className="h-3.5 w-3.5" />} label="Biggest Winning Margin">
                  {wrapData.biggestWin ? (
                    <>
                      <p className="text-sm font-bold">
                        {wrapData.biggestWin.value} pts
                      </p>
                      <MatchScoreLine
                        stat={wrapData.biggestWin}
                        clubs={clubs}
                        highlightClubId={playerClubId}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No data</p>
                  )}
                </TeamStatCard>

                {/* Highest Score */}
                <TeamStatCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Highest Team Score">
                  {wrapData.highestScore ? (
                    <>
                      <p className="text-sm font-bold">{wrapData.highestScore.value} pts</p>
                      <MatchScoreLine
                        stat={wrapData.highestScore}
                        clubs={clubs}
                        highlightClubId={playerClubId}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No data</p>
                  )}
                </TeamStatCard>

                {/* Disposal Differential */}
                <TeamStatCard icon={<BarChart3 className="h-3.5 w-3.5" />} label="Best Disposal Differential">
                  {wrapData.bestDisposalDiff ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <ClubDot club={clubs[wrapData.bestDisposalDiff.dominantClubId]} />
                        <span className="text-sm font-bold">
                          {clubs[wrapData.bestDisposalDiff.dominantClubId]?.abbreviation ?? wrapData.bestDisposalDiff.dominantClubId}
                          {' '}+{wrapData.bestDisposalDiff.disposalDiff}
                        </span>
                      </div>
                      <MatchScoreLine
                        stat={wrapData.bestDisposalDiff}
                        clubs={clubs}
                        highlightClubId={playerClubId}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No data</p>
                  )}
                </TeamStatCard>

                {/* Upset of the Round */}
                <TeamStatCard icon={<Shuffle className="h-3.5 w-3.5" />} label="Upset of the Round">
                  {wrapData.upsetOfRound ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-amber-500/50 text-amber-600">
                          #{wrapData.upsetOfRound.winnerLadderPos}
                        </Badge>
                        <ClubDot club={clubs[wrapData.upsetOfRound.winnerClubId]} />
                        <span className="font-semibold">
                          {clubs[wrapData.upsetOfRound.winnerClubId]?.abbreviation ?? wrapData.upsetOfRound.winnerClubId}
                        </span>
                        <span className="text-muted-foreground">def</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                          #{wrapData.upsetOfRound.loserLadderPos}
                        </Badge>
                        <ClubDot club={clubs[wrapData.upsetOfRound.loserClubId]} />
                        <span className="font-semibold">
                          {clubs[wrapData.upsetOfRound.loserClubId]?.abbreviation ?? wrapData.upsetOfRound.loserClubId}
                        </span>
                      </div>
                      <MatchScoreLine
                        stat={wrapData.upsetOfRound}
                        clubs={clubs}
                        highlightClubId={playerClubId}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No upsets this round
                    </p>
                  )}
                </TeamStatCard>

              </div>
            </div>

          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="mt-4 flex justify-end gap-2 border-t pt-4">
          {playerClub && (
            <p className="flex-1 text-xs text-muted-foreground self-center">
              {playerClub.abbreviation} ·{' '}
              {wrapData?.userMatch
                ? wrapData.userMatch.won
                  ? 'Victory'
                  : wrapData.userMatch.drew
                    ? 'Draw'
                    : 'Defeat'
                : wrapData?.roundName}
            </p>
          )}
          <Button onClick={onClose}>
            Continue →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
