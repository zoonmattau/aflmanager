import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getOverallRating } from '@/engine/player/playerRating'
import {
  getBroadcastChannelShort,
  getBroadcastChannelColor,
  getBroadcastChannelLabel,
  getBroadcastTierLabel,
} from '@/engine/season/broadcastEngine'
import {
  MapPin,
  Clock,
  Play,
  Eye,
  X,
  AlertTriangle,
  Swords,
  Target,
  Shield,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import type { Fixture, LadderEntry, MatchDay } from '@/types/season'
import type { Club } from '@/types/club'
import type { Player, PlayerPreferredRole, PlayerCareerStats } from '@/types/player'
import type { Match } from '@/types/match'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMatchDay(day?: MatchDay): string {
  const labels: Record<string, string> = {
    Thursday: 'Thursday Night',
    Friday: 'Friday Night',
    'Saturday-Early': 'Saturday Afternoon',
    'Saturday-Twilight': 'Saturday Twilight',
    'Saturday-Night': 'Saturday Night',
    'Sunday-Early': 'Sunday Early',
    'Sunday-Twilight': 'Sunday Afternoon',
    Monday: 'Monday',
  }
  return labels[day ?? ''] ?? 'Saturday Twilight'
}

function getRoleBucket(role: PlayerPreferredRole): 'mid' | 'fwd' | 'def' | 'ruck' {
  if (role === 'ruck') return 'ruck'
  if (role === 'inside-mid' || role === 'outside-mid' || role === 'wing-runner') return 'mid'
  if (role === 'key-forward' || role === 'small-forward' || role === 'pressure-forward') return 'fwd'
  return 'def'
}

function avgStat(ps: Player[], stat: keyof PlayerCareerStats): number {
  const active = ps.filter((p) => p.seasonStats.gamesPlayed > 0)
  if (active.length === 0) return 0
  return (
    active.reduce((sum, p) => sum + (p.seasonStats[stat] as number) / p.seasonStats.gamesPlayed, 0) /
    active.length
  )
}

interface PositionGroupStats {
  midDisposals: number
  midClearances: number
  fwdGoals: number
  fwdI50: number
  defIntercepts: number
  defR50: number
  ruckHitouts: number
}

function getPositionGroupStats(players: Record<string, Player>, clubId: string): PositionGroupStats {
  const squad = Object.values(players).filter((p) => p.clubId === clubId)
  const mid = squad.filter((p) => getRoleBucket(p.preferredRole) === 'mid')
  const fwd = squad.filter((p) => getRoleBucket(p.preferredRole) === 'fwd')
  const def = squad.filter((p) => getRoleBucket(p.preferredRole) === 'def')
  const ruck = squad.filter((p) => getRoleBucket(p.preferredRole) === 'ruck')
  return {
    midDisposals: avgStat(mid, 'disposals'),
    midClearances: avgStat(mid, 'clearances'),
    fwdGoals: avgStat(fwd, 'goals'),
    fwdI50: avgStat(fwd, 'insideFifties'),
    defIntercepts: avgStat(def, 'intercepts'),
    defR50: avgStat(def, 'rebound50s'),
    ruckHitouts: avgStat(ruck, 'hitouts'),
  }
}

function getFormSummary(matchResults: Match[], clubId: string) {
  const recent = matchResults
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
  let wins = 0
  let losses = 0
  let draws = 0
  const trend: ('W' | 'L' | 'D')[] = []
  for (const m of recent) {
    if (!m.result) continue
    const isHome = m.homeClubId === clubId
    const myScore = isHome ? m.result.homeTotalScore : m.result.awayTotalScore
    const oppScore = isHome ? m.result.awayTotalScore : m.result.homeTotalScore
    if (myScore > oppScore) {
      wins++
      trend.push('W')
    } else if (myScore < oppScore) {
      losses++
      trend.push('L')
    } else {
      draws++
      trend.push('D')
    }
  }
  return { wins, losses, draws, trend, formPoints: wins * 2 + draws }
}

function getClubStrength(players: Record<string, Player>, clubId: string): number {
  const sq = Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury)
    .map((p) => getOverallRating(p))
    .sort((a, b) => b - a)
    .slice(0, 22)
  return sq.length ? sq.reduce((s, v) => s + v, 0) / sq.length : 50
}

function getH2H(matchResults: Match[], homeId: string, awayId: string): Match[] {
  return matchResults
    .filter(
      (m) =>
        m.result &&
        ((m.homeClubId === homeId && m.awayClubId === awayId) ||
          (m.homeClubId === awayId && m.awayClubId === homeId)),
    )
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
}

function buildMatchups(
  players: Record<string, Player>,
  homeClubId: string,
  awayClubId: string,
): Array<{ title: string; home: Player | null; away: Player | null }> {
  const home = Object.values(players).filter((p) => p.clubId === homeClubId && !p.injury)
  const away = Object.values(players).filter((p) => p.clubId === awayClubId && !p.injury)
  const top = (ps: Player[], bucket: 'mid' | 'fwd' | 'def' | 'ruck') =>
    ps.filter((p) => getRoleBucket(p.preferredRole) === bucket).sort((a, b) => getOverallRating(b) - getOverallRating(a))
  const fb = (ps: Player[]) => [...ps].sort((a, b) => getOverallRating(b) - getOverallRating(a))
  const hFB = fb(home)
  const aFB = fb(away)
  return [
    { title: 'Midfield Battle', home: top(home, 'mid')[0] ?? hFB[0] ?? null, away: top(away, 'mid')[0] ?? aFB[0] ?? null },
    { title: 'Forward vs Defender', home: top(home, 'fwd')[0] ?? hFB[1] ?? null, away: top(away, 'def')[0] ?? aFB[1] ?? null },
    { title: 'Ruck Contest', home: top(home, 'ruck')[0] ?? hFB[2] ?? null, away: top(away, 'ruck')[0] ?? aFB[2] ?? null },
  ]
}

function computeWinProb(args: {
  homeLadder: (LadderEntry & { rank: number }) | null
  awayLadder: (LadderEntry & { rank: number }) | null
  homeFormPoints: number
  awayFormPoints: number
  homeStrength: number
  awayStrength: number
}) {
  const pointsDiff = (args.homeLadder?.points ?? 0) - (args.awayLadder?.points ?? 0)
  const pctDiff = (args.homeLadder?.percentage ?? 100) - (args.awayLadder?.percentage ?? 100)
  const formDiff = args.homeFormPoints - args.awayFormPoints
  const strengthDiff = args.homeStrength - args.awayStrength
  const raw = 50 + pointsDiff * 0.9 + pctDiff * 0.08 + formDiff * 2.2 + strengthDiff * 0.7 + 4
  const home = Math.max(5, Math.min(95, Math.round(raw)))
  return { home, away: 100 - home }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FormDots({ trend }: { trend: ('W' | 'L' | 'D')[] }) {
  if (trend.length === 0) {
    return <span className="text-xs italic text-muted-foreground">No results yet</span>
  }
  return (
    <div className="flex gap-1">
      {trend.map((r, i) => (
        <div
          key={i}
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
            r === 'W' ? 'bg-emerald-500' : r === 'L' ? 'bg-red-500' : 'bg-amber-500'
          }`}
        >
          {r}
        </div>
      ))}
    </div>
  )
}

function ClubBadge({ club, size = 'md' }: { club: Club | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-16 w-16 text-sm' : size === 'md' ? 'h-10 w-10 text-xs' : 'h-6 w-6 text-[9px]'
  return (
    <div
      className={`${dim} inline-flex items-center justify-center rounded-full border-2 border-white/20 font-bold text-white shadow`}
      style={{
        background: `linear-gradient(135deg, ${club?.colors.primary ?? '#666'} 50%, ${club?.colors.secondary ?? '#999'} 50%)`,
      }}
    >
      {club?.abbreviation ?? '?'}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface PreMatchPreviewProps {
  fixture: Fixture
  homeClub: Club | null
  awayClub: Club | null
  clubs: Record<string, Club>
  players: Record<string, Player>
  matchResults: Match[]
  ladder: LadderEntry[]
  playerClubId: string
  onSimulate: () => void
  onPlayLive?: () => void
  onClose: () => void
}

export function PreMatchPreview({
  fixture,
  homeClub,
  awayClub,
  clubs,
  players,
  matchResults,
  ladder,
  playerClubId,
  onSimulate,
  onPlayLive,
  onClose,
}: PreMatchPreviewProps) {
  const isHome = fixture.homeClubId === playerClubId
  const myClub = isHome ? homeClub : awayClub
  const oppClub = isHome ? awayClub : homeClub
  const myClubId = isHome ? fixture.homeClubId : fixture.awayClubId
  const oppClubId = isHome ? fixture.awayClubId : fixture.homeClubId

  const ladderMap = useMemo(() => {
    const m = new Map<string, LadderEntry & { rank: number }>()
    ladder.forEach((e, i) => m.set(e.clubId, { ...e, rank: i + 1 }))
    return m
  }, [ladder])

  const data = useMemo(() => {
    const homeForm = getFormSummary(matchResults, fixture.homeClubId)
    const awayForm = getFormSummary(matchResults, fixture.awayClubId)
    const homeLadder = ladderMap.get(fixture.homeClubId) ?? null
    const awayLadder = ladderMap.get(fixture.awayClubId) ?? null
    const homeStrength = getClubStrength(players, fixture.homeClubId)
    const awayStrength = getClubStrength(players, fixture.awayClubId)
    const winProb = computeWinProb({
      homeLadder,
      awayLadder,
      homeFormPoints: homeForm.formPoints,
      awayFormPoints: awayForm.formPoints,
      homeStrength,
      awayStrength,
    })
    const h2h = getH2H(matchResults, fixture.homeClubId, fixture.awayClubId)
    const keyMatchups = buildMatchups(players, fixture.homeClubId, fixture.awayClubId)
    const homeStats = getPositionGroupStats(players, fixture.homeClubId)
    const awayStats = getPositionGroupStats(players, fixture.awayClubId)
    const homeInjured = Object.values(players).filter((p) => p.clubId === fixture.homeClubId && p.injury).length
    const awayInjured = Object.values(players).filter((p) => p.clubId === fixture.awayClubId && p.injury).length

    // Tactical edge: compare position group stats, take top 3 advantages
    const edges: Array<{ label: string; favours: 'home' | 'away'; margin: number }> = []
    if (Math.abs(homeStats.midDisposals - awayStats.midDisposals) > 0.8) {
      edges.push({
        label: 'Midfield disposals',
        favours: homeStats.midDisposals > awayStats.midDisposals ? 'home' : 'away',
        margin: Math.abs(homeStats.midDisposals - awayStats.midDisposals),
      })
    }
    if (Math.abs(homeStats.midClearances - awayStats.midClearances) > 0.2) {
      edges.push({
        label: 'Clearance dominance',
        favours: homeStats.midClearances > awayStats.midClearances ? 'home' : 'away',
        margin: Math.abs(homeStats.midClearances - awayStats.midClearances) * 8,
      })
    }
    if (Math.abs(homeStats.fwdGoals - awayStats.fwdGoals) > 0.1) {
      edges.push({
        label: 'Forward firepower',
        favours: homeStats.fwdGoals > awayStats.fwdGoals ? 'home' : 'away',
        margin: Math.abs(homeStats.fwdGoals - awayStats.fwdGoals) * 12,
      })
    }
    if (Math.abs(homeStats.defIntercepts - awayStats.defIntercepts) > 0.15) {
      edges.push({
        label: 'Defensive intercepts',
        favours: homeStats.defIntercepts > awayStats.defIntercepts ? 'home' : 'away',
        margin: Math.abs(homeStats.defIntercepts - awayStats.defIntercepts) * 6,
      })
    }
    if (Math.abs(homeStats.ruckHitouts - awayStats.ruckHitouts) > 0.5) {
      edges.push({
        label: 'Ruck advantage',
        favours: homeStats.ruckHitouts > awayStats.ruckHitouts ? 'home' : 'away',
        margin: Math.abs(homeStats.ruckHitouts - awayStats.ruckHitouts),
      })
    }
    const topEdges = edges.sort((a, b) => b.margin - a.margin).slice(0, 3)

    return {
      homeForm,
      awayForm,
      homeLadder,
      awayLadder,
      homeStrength,
      awayStrength,
      winProb,
      h2h,
      keyMatchups,
      homeStats,
      awayStats,
      homeInjured,
      awayInjured,
      topEdges,
    }
  }, [fixture, ladderMap, matchResults, players])

  const myForm = isHome ? data.homeForm : data.awayForm
  const oppForm = isHome ? data.awayForm : data.homeForm
  const myLadder = ladderMap.get(myClubId) ?? null
  const oppLadder = ladderMap.get(oppClubId) ?? null
  const myStats = isHome ? data.homeStats : data.awayStats
  const oppStats = isHome ? data.awayStats : data.homeStats
  const myInjured = isHome ? data.homeInjured : data.awayInjured
  const oppInjured = isHome ? data.awayInjured : data.homeInjured

  // H2H tally from player's perspective
  let myWins = 0
  let oppWins = 0
  let draws = 0
  for (const m of data.h2h) {
    if (!m.result) continue
    if (m.result.homeTotalScore === m.result.awayTotalScore) {
      draws++
    } else if (m.result.homeTotalScore > m.result.awayTotalScore) {
      if (m.homeClubId === myClubId) myWins++
      else oppWins++
    } else {
      if (m.awayClubId === myClubId) myWins++
      else oppWins++
    }
  }

  const cols = [
    {
      label: 'Your Club',
      club: myClub,
      form: myForm,
      ladderEntry: myLadder,
      stats: myStats,
      injured: myInjured,
      isUser: true,
    },
    {
      label: 'Opposition',
      club: oppClub,
      form: oppForm,
      ladderEntry: oppLadder,
      stats: oppStats,
      injured: oppInjured,
      isUser: false,
    },
  ]

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Swords className="h-5 w-5" />
            Match Preview
          </DialogTitle>
        </DialogHeader>

        {/* MATCH HEADER */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <ClubBadge club={homeClub} size="lg" />
              <div className="text-sm font-bold">{homeClub?.fullName ?? fixture.homeClubId}</div>
              <Badge variant="outline" className="text-[10px]">Home</Badge>
            </div>
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold text-muted-foreground">vs</div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {fixture.venue}
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtMatchDay(fixture.matchDay)}
                  {fixture.scheduledTime ? ` · ${fixture.scheduledTime}` : ''}
                </div>
                {fixture.broadcastChannel && fixture.broadcastChannel !== 'None' && (
                  <div className="flex items-center justify-center gap-1">
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getBroadcastChannelColor(fixture.broadcastChannel)}`}
                    >
                      {getBroadcastChannelShort(fixture.broadcastChannel)}
                    </span>
                    <span>
                      {getBroadcastChannelLabel(fixture.broadcastChannel)} — {getBroadcastTierLabel(fixture.broadcastTier)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <ClubBadge club={awayClub} size="lg" />
              <div className="text-sm font-bold">{awayClub?.fullName ?? fixture.awayClubId}</div>
              <Badge variant="outline" className="text-[10px]">Away</Badge>
            </div>
          </div>
        </div>

        {/* WIN PROBABILITY */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>
              {homeClub?.abbreviation} {data.winProb.home}%
            </span>
            <span className="text-xs text-muted-foreground">Win Probability</span>
            <span>
              {data.winProb.away}% {awayClub?.abbreviation}
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full">
            <div
              className="h-full"
              style={{
                width: `${data.winProb.home}%`,
                backgroundColor: homeClub?.colors.primary ?? '#3b82f6',
                transition: 'width 0.3s ease',
              }}
            />
            <div
              className="h-full"
              style={{
                width: `${data.winProb.away}%`,
                backgroundColor: awayClub?.colors.primary ?? '#ef4444',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Model factors: ladder points/percentage, recent form, squad strength, and home-ground advantage.
          </p>
        </div>

        {/* TWO-COLUMN CLUB COMPARISON */}
        <div className="grid gap-3 sm:grid-cols-2">
          {cols.map((col, colIdx) => (
            <div
              key={colIdx}
              className={`space-y-3 rounded-lg border p-3 ${col.isUser ? 'border-primary/40 bg-primary/5' : ''}`}
            >
              <div className="flex items-center gap-2">
                <ClubBadge club={col.club} size="sm" />
                <span className="text-sm font-semibold">{col.label}</span>
                {col.isUser && (
                  <Badge variant="default" className="ml-auto text-[10px]">
                    You
                  </Badge>
                )}
              </div>

              {/* Ladder position */}
              <div className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Ladder
                </div>
                {col.ladderEntry ? (
                  <div className="flex gap-3 text-xs">
                    <span className="font-semibold">#{col.ladderEntry.rank}</span>
                    <span>{col.ladderEntry.points} pts</span>
                    <span>{col.ladderEntry.percentage.toFixed(1)}%</span>
                    <span className="text-muted-foreground">
                      {col.ladderEntry.wins}W {col.ladderEntry.losses}L {col.ladderEntry.draws}D
                    </span>
                  </div>
                ) : (
                  <span className="text-xs italic text-muted-foreground">No data</span>
                )}
              </div>

              {/* Form dots */}
              <div className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Form (Last 5)
                </div>
                <FormDots trend={col.form.trend} />
                {col.form.trend.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {col.form.wins}W {col.form.losses}L {col.form.draws}D
                  </div>
                )}
              </div>

              {/* Position group season averages */}
              <div className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Season Avgs (per game)
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-muted-foreground">Mid Disposals</span>
                  <span className="font-mono">{col.stats.midDisposals.toFixed(1)}</span>
                  <span className="text-muted-foreground">Mid Clearances</span>
                  <span className="font-mono">{col.stats.midClearances.toFixed(1)}</span>
                  <span className="text-muted-foreground">Fwd Goals</span>
                  <span className="font-mono">{col.stats.fwdGoals.toFixed(1)}</span>
                  <span className="text-muted-foreground">Def Intercepts</span>
                  <span className="font-mono">{col.stats.defIntercepts.toFixed(1)}</span>
                  {col.stats.ruckHitouts > 0 && (
                    <>
                      <span className="text-muted-foreground">Ruck Hitouts</span>
                      <span className="font-mono">{col.stats.ruckHitouts.toFixed(1)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Injury report */}
              {col.injured > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {col.injured} player{col.injured !== 1 ? 's' : ''} injured
                </div>
              )}
            </div>
          ))}
        </div>

        {/* KEY MATCHUPS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4" />
            Key Matchups
          </div>
          <div className="space-y-1.5">
            {data.keyMatchups.map((m) => {
              const homeRating = m.home ? getOverallRating(m.home) : 0
              const awayRating = m.away ? getOverallRating(m.away) : 0
              const homeLeads = homeRating > awayRating
              return (
                <div
                  key={m.title}
                  className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <div className={`w-[42%] font-medium ${homeLeads ? 'text-emerald-400' : ''}`}>
                    {m.home ? `${m.home.firstName.charAt(0)}. ${m.home.lastName}` : 'TBD'}
                    {m.home && (
                      <span className="ml-1 text-muted-foreground">({homeRating})</span>
                    )}
                  </div>
                  <div className="w-[16%] text-center text-[10px] text-muted-foreground">
                    {m.title}
                  </div>
                  <div
                    className={`w-[42%] text-right font-medium ${!homeLeads && awayRating > 0 ? 'text-emerald-400' : ''}`}
                  >
                    {m.away ? `${m.away.firstName.charAt(0)}. ${m.away.lastName}` : 'TBD'}
                    {m.away && (
                      <span className="ml-1 text-muted-foreground">({awayRating})</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* TACTICAL EDGE */}
        {data.topEdges.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4" />
              Tactical Edge
            </div>
            <div className="space-y-1.5">
              {data.topEdges.map((edge) => {
                const favoursHome = edge.favours === 'home'
                const favoursUser = (isHome && favoursHome) || (!isHome && !favoursHome)
                const favouringClub = favoursHome ? homeClub : awayClub
                return (
                  <div
                    key={edge.label}
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${
                      favoursUser
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    {favoursUser ? (
                      <TrendingUp className="h-3 w-3 shrink-0 text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-3 w-3 shrink-0 text-red-400" />
                    )}
                    <span className="flex-1">{edge.label}</span>
                    <span className={`font-medium ${favoursUser ? 'text-emerald-400' : 'text-red-400'}`}>
                      {favoursUser ? 'Advantage' : 'Disadvantage'} — {favouringClub?.abbreviation}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* H2H RECORD */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" />
            Head to Head
            {data.h2h.length > 0 && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {myClub?.abbreviation} {myWins} — {draws > 0 ? `${draws}D — ` : ''}{oppWins} {oppClub?.abbreviation}
              </span>
            )}
          </div>
          {data.h2h.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No previous meetings recorded.</p>
          ) : (
            <div className="space-y-1">
              {data.h2h.map((m) => {
                if (!m.result) return null
                const hc = clubs[m.homeClubId]
                const ac = clubs[m.awayClubId]
                const homeWon = m.result.homeTotalScore > m.result.awayTotalScore
                const isDraw = m.result.homeTotalScore === m.result.awayTotalScore
                const winnerAbbr = isDraw ? 'Draw' : homeWon ? (hc?.abbreviation ?? m.homeClubId) : (ac?.abbreviation ?? m.awayClubId)
                const winnerIsMe = !isDraw && winnerAbbr === (myClub?.abbreviation ?? myClubId)
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded border px-2 py-1 text-xs"
                  >
                    <span className="w-12 text-muted-foreground">Rd {m.round + 1}</span>
                    <span className="flex-1 text-center font-mono">
                      {hc?.abbreviation} {m.result.homeTotalScore} – {m.result.awayTotalScore} {ac?.abbreviation}
                    </span>
                    <span
                      className={`w-16 text-right font-medium ${
                        winnerIsMe ? 'text-emerald-400' : isDraw ? 'text-muted-foreground' : 'text-red-400'
                      }`}
                    >
                      {winnerAbbr}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          {onPlayLive && (
            <Button variant="secondary" onClick={onPlayLive} className="gap-2">
              <Eye className="h-4 w-4" />
              Play Live
            </Button>
          )}
          <Button onClick={onSimulate} className="gap-2">
            <Play className="h-4 w-4" />
            Simulate Round
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
