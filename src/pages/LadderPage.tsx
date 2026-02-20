import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCareerLeaders } from '@/engine/history/historyEngine'
import { getBrownlowLeaderboard, getColemanLeaderboard } from '@/engine/awards/awardsEngine'
import { getEffectiveFinalsFormat, hasTopFourDoubleChanceAdvantage, getFinalsZones } from '@/engine/season/finalsFormats'
import { labelLadderQualification, computeQualificationRules } from '@/engine/season/finalsQualification'
import type { PlayerCareerStats } from '@/types/player'
import { Trophy, Medal, Star, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'

const LEADER_STATS: { key: keyof PlayerCareerStats; label: string }[] = [
  { key: 'gamesPlayed', label: 'Games' },
  { key: 'aflFantasyPoints', label: 'AFL Fantasy' },
  { key: 'superCoachPoints', label: 'SuperCoach' },
  { key: 'goals', label: 'Goals' },
  { key: 'disposals', label: 'Disposals' },
  { key: 'marks', label: 'Marks' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'hitouts', label: 'Hitouts' },
  { key: 'intercepts', label: 'Intercepts' },
  { key: 'scoreInvolvements', label: 'Score Involvements' },
]

const CLUB_LOGO_EXTENSIONS = ['svg', 'png', 'webp', 'jpg']

function ClubMark({
  club,
  className = 'h-4 w-4',
}: {
  club: { id: string; colors?: { primary: string } } | undefined
  className?: string
}) {
  const [logoIdx, setLogoIdx] = useState(0)

  if (!club) {
    return <div className={`${className} rounded-full bg-zinc-600`} />
  }

  if (logoIdx < CLUB_LOGO_EXTENSIONS.length) {
    const ext = CLUB_LOGO_EXTENSIONS[logoIdx]
    return (
      <img
        src={`/club-logos/${club.id}.${ext}`}
        alt=""
        className={`${className} rounded-sm object-contain`}
        loading="lazy"
        onError={() => setLogoIdx((idx) => idx + 1)}
      />
    )
  }

  return (
    <div
      className={`${className} rounded-full`}
      style={{ backgroundColor: club.colors?.primary ?? '#666' }}
    />
  )
}

function CareerLeadersTable({
  stat,
  label,
  players,
  clubs,
}: {
  stat: keyof PlayerCareerStats
  label: string
  players: Record<string, import('@/types/player').Player>
  clubs: Record<string, { name: string; abbreviation: string }>
}) {
  const leaders = useMemo(() => getCareerLeaders(players, stat, 10), [players, stat])

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Career {label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">{label}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaders.map((entry, i) => (
              <TableRow key={entry.playerId}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <div>
                    <Link
                      to={`/player/${entry.playerId}`}
                      className="font-medium hover:underline"
                    >
                      {entry.playerName}
                    </Link>
                    {players[entry.playerId] && (
                      <PlayerStarRating
                        stars={getPlayerStarRating(players[entry.playerId])}
                        player={players[entry.playerId]}
                        className="scale-[0.75] origin-left"
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.clubId === 'retired'
                    ? 'Retired'
                    : (clubs[entry.clubId]?.abbreviation ?? entry.clubId)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">{entry.value}</TableCell>
              </TableRow>
            ))}
            {leaders.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                  No data yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function LadderPage() {
  const ladder = useGameStore((s) => s.ladder)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const matchResults = useGameStore((s) => s.matchResults)
  const powerRankings = useGameStore((s) => s.powerRankings)
  const history = useGameStore((s) => s.history)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)
  const brownlowTracker = useGameStore((s) => s.brownlowTracker)
  const brownlowRevealed = useGameStore((s) => s.brownlowRevealed)
  const brownlowNight = useGameStore((s) => s.settings.realism.brownlowNight)
  const settings = useGameStore((s) => s.settings)
  const phase = useGameStore((s) => s.phase)
  const awards = useGameStore((s) => s.awards)
  const navigate = useNavigate()

  const brownlowLeaders = useMemo(
    () => getBrownlowLeaderboard(brownlowTracker, 20),
    [brownlowTracker],
  )
  const colemanLeaders = useMemo(
    () => getColemanLeaderboard(players, 10),
    [players],
  )
  const currentAwards = useMemo(
    () => awards.find((a) => a.year === currentYear) ?? null,
    [awards, currentYear],
  )
  const seasonLeaders = useMemo(() => {
    const pool = Object.values(players).filter((p) => p.seasonStats.gamesPlayed > 0)
    const by = (key: keyof PlayerCareerStats) =>
      [...pool]
        .sort((a, b) => b.seasonStats[key] - a.seasonStats[key])
        .slice(0, 5)
        .map((p) => ({
          playerId: p.id,
          name: `${p.firstName} ${p.lastName}`,
          clubId: p.clubId,
          value: p.seasonStats[key],
        }))
    return {
      goals: by('goals'),
      disposals: by('disposals'),
      marks: by('marks'),
      tackles: by('tackles'),
      hitouts: by('hitouts'),
      aflFantasyPoints: by('aflFantasyPoints'),
      superCoachPoints: by('superCoachPoints'),
    }
  }, [players])

  const seasonAnalytics = useMemo(() => {
    const regularSeasonRounds = season.rounds.length
    const regularMatchesPlayed = matchResults.filter((m) => !m.isFinal && m.result)
    const gamesPlayed = regularMatchesPlayed.length
    const roundsPlayed = new Set(regularMatchesPlayed.map((m) => m.round)).size

    const totalPoints = regularMatchesPlayed.reduce(
      (sum, m) => sum + (m.result?.homeTotalScore ?? 0) + (m.result?.awayTotalScore ?? 0),
      0,
    )
    const totalMargin = regularMatchesPlayed.reduce(
      (sum, m) => sum + Math.abs((m.result?.homeTotalScore ?? 0) - (m.result?.awayTotalScore ?? 0)),
      0,
    )
    let homeWins = 0
    let awayWins = 0
    let draws = 0
    for (const m of regularMatchesPlayed) {
      const home = m.result?.homeTotalScore ?? 0
      const away = m.result?.awayTotalScore ?? 0
      if (home > away) homeWins++
      else if (away > home) awayWins++
      else draws++
    }

    const sortedByPercentage = [...ladder].sort((a, b) => b.percentage - a.percentage)
    const sortedByFor = [...ladder].sort((a, b) => b.pointsFor - a.pointsFor)
    const sortedByAgainst = [...ladder].sort((a, b) => a.pointsAgainst - b.pointsAgainst)
    const sortedByWins = [...ladder].sort((a, b) => b.wins - a.wins)

    return {
      regularSeasonRounds,
      roundsPlayed,
      gamesPlayed,
      avgTotalScore: gamesPlayed > 0 ? totalPoints / gamesPlayed : 0,
      avgMargin: gamesPlayed > 0 ? totalMargin / gamesPlayed : 0,
      homeWinRate: gamesPlayed > 0 ? (homeWins / gamesPlayed) * 100 : 0,
      awayWinRate: gamesPlayed > 0 ? (awayWins / gamesPlayed) * 100 : 0,
      drawRate: gamesPlayed > 0 ? (draws / gamesPlayed) * 100 : 0,
      topPercentage: sortedByPercentage[0] ?? null,
      topScoring: sortedByFor[0] ?? null,
      bestDefence: sortedByAgainst[0] ?? null,
      mostWins: sortedByWins[0] ?? null,
    }
  }, [ladder, matchResults, season.rounds.length])

  const leagueConfig = useGameStore((s) => s.leagueConfig)

  const effectiveFormat = useMemo(
    () => getEffectiveFinalsFormat(
      settings.finals.finalsFormat,
      settings.finals.finalsQualifyingTeams,
      settings.finals.customFinalsFormat,
    ),
    [settings.finals],
  )

  const finalsQualifyingTeams = useMemo(() => {
    const count = effectiveFormat.qualifyingTeams
    return Math.max(0, Math.min(ladder.length, count))
  }, [effectiveFormat, ladder.length])

  const hasTop4FinalsAdvantage = useMemo(
    () => hasTopFourDoubleChanceAdvantage(effectiveFormat),
    [effectiveFormat],
  )

  const finalsZones = useMemo(() => getFinalsZones(effectiveFormat), [effectiveFormat])

  const rankToZone = useMemo(() => {
    const map = new Map<number, number>()
    for (const zone of finalsZones) {
      for (const rank of zone.ranks) {
        map.set(rank, zone.zoneIndex)
      }
    }
    return map
  }, [finalsZones])

  const qualificationSlots = useMemo(
    () => labelLadderQualification(ladder, leagueConfig, finalsQualifyingTeams, hasTop4FinalsAdvantage),
    [ladder, leagueConfig, finalsQualifyingTeams, hasTop4FinalsAdvantage],
  )

  const qualificationRules = useMemo(() => {
    const model = leagueConfig.competitionModel ?? 'single-table'
    if (model === 'single-table') return null
    return computeQualificationRules(leagueConfig, finalsQualifyingTeams, hasTop4FinalsAdvantage)
  }, [leagueConfig, finalsQualifyingTeams, hasTop4FinalsAdvantage])

  const latestPowerSnapshot = useMemo(
    () => (powerRankings.length > 0 ? powerRankings[powerRankings.length - 1] : null),
    [powerRankings],
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{currentYear} AFL Ladder</h1>

      <Tabs defaultValue="ladder">
        <TabsList>
          <TabsTrigger value="ladder">Ladder</TabsTrigger>
          <TabsTrigger value="season">Season</TabsTrigger>
          <TabsTrigger value="awards">Awards</TabsTrigger>
          <TabsTrigger value="league-history">League History</TabsTrigger>
        </TabsList>

        <TabsContent value="ladder">
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-center">P</TableHead>
                      <TableHead className="text-center">W</TableHead>
                      <TableHead className="text-center">D</TableHead>
                      <TableHead className="text-center">L</TableHead>
                      <TableHead className="text-center">Pts</TableHead>
                      <TableHead className="text-right">For</TableHead>
                      <TableHead className="text-right">Agst</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ladder.map((entry, i) => {
                      const club = clubs[entry.clubId]
                      const isPlayer = entry.clubId === playerClubId
                      const slot = qualificationSlots[i]
                      const rank1 = i + 1 // 1-indexed
                      const rowZone = rank1 <= finalsQualifyingTeams ? rankToZone.get(rank1) : undefined
                      const nextZone = (rank1 + 1) <= finalsQualifyingTeams ? rankToZone.get(rank1 + 1) : undefined
                      const isZoneTransition = rowZone !== undefined && nextZone !== undefined && rowZone !== nextZone
                      const isFinalsCutLine = finalsQualifyingTeams > 0 && i === finalsQualifyingTeams - 1
                      const zoneBg = rowZone === 0
                        ? 'bg-cyan-500/12'
                        : rowZone === 1
                          ? 'bg-emerald-500/6'
                          : rowZone === 2
                            ? 'bg-amber-500/10'
                            : ''
                      const cutLineClass = isZoneTransition
                        ? (rowZone === 0
                          ? 'border-b-2 border-dashed border-cyan-500/50'
                          : 'border-b-2 border-dashed border-emerald-500/40')
                        : isFinalsCutLine
                          ? 'border-b-2 border-dashed border-emerald-500/40'
                          : ''
                      return (
                        <TableRow
                          key={entry.clubId}
                          className={[zoneBg, isPlayer ? 'bg-accent font-semibold' : '', cutLineClass].filter(Boolean).join(' ')}
                        >
                          <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ClubMark club={club} className="h-4 w-4 flex-shrink-0" />
                              <span>{club?.name}</span>
                              {isPlayer && (
                                <Badge variant="secondary" className="text-xs">You</Badge>
                              )}
                              {slot && slot.type !== 'none' && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 leading-4 ${
                                    slot.type === 'double-chance'
                                      ? 'border-cyan-500/60 text-cyan-400'
                                      : slot.type === 'wildcard'
                                        ? 'border-amber-500/60 text-amber-400'
                                        : 'border-emerald-500/60 text-emerald-400'
                                  }`}
                                >
                                  {slot.badge}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{entry.played}</TableCell>
                          <TableCell className="text-center">{entry.wins}</TableCell>
                          <TableCell className="text-center">{entry.draws}</TableCell>
                          <TableCell className="text-center">{entry.losses}</TableCell>
                          <TableCell className="text-center font-bold">{entry.points}</TableCell>
                          <TableCell className="text-right">{entry.pointsFor}</TableCell>
                          <TableCell className="text-right">{entry.pointsAgainst}</TableCell>
                          <TableCell className="text-right">{entry.percentage.toFixed(1)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <div className="border-t px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {finalsZones.map((zone) => {
                      const swatchClass = zone.zoneIndex === 0
                        ? 'bg-cyan-500/60'
                        : zone.zoneIndex === 1
                          ? 'bg-emerald-500/50'
                          : 'bg-amber-500/60'
                      const r = zone.ranks
                      const rRange = r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : `${r[0]}`
                      const label = zone.firstWeek === Infinity
                        ? `Top ${r[r.length - 1]} (bye)`
                        : !zone.isElimination
                          ? `Qualifying Finals (${rRange})`
                          : finalsZones.length > 2 && zone.zoneIndex === finalsZones.length - 1
                            ? `Wildcard Weekend (${rRange})`
                            : `Finals zone (${rRange})`
                      return (
                        <span key={zone.zoneIndex} className="inline-flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-sm ${swatchClass}`} />
                          {label}
                        </span>
                      )
                    })}
                    {qualificationSlots.some((s) => s.type === 'wildcard') && (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1 py-0 leading-4 border-amber-500/60 text-amber-400">WC</Badge>
                        Wildcard
                      </span>
                    )}
                    {finalsQualifyingTeams > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-0.5 w-3 rounded bg-emerald-500/70" />
                        Finals cut line
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Qualification Rules (for conferences/divisions) */}
            {qualificationRules && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Finals Qualification Rules</CardTitle>
                  <CardDescription>
                    How the {finalsQualifyingTeams} finals spots are allocated across {qualificationRules.model === 'conferences' ? 'conferences' : 'divisions'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {qualificationRules.groups.map((group) => (
                      <div
                        key={group.groupName}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <span className="text-sm font-medium">{group.groupName}</span>
                        <span className="text-sm text-muted-foreground">
                          Top {group.autoSpots} auto-qualify
                        </span>
                      </div>
                    ))}
                  </div>
                  {qualificationRules.wildcardSpots > 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                      <p className="text-sm">
                        <span className="font-medium text-amber-500">{qualificationRules.wildcardSpots} Wildcard</span>{' '}
                        spot{qualificationRules.wildcardSpots > 1 ? 's' : ''} awarded to the
                        best remaining team{qualificationRules.wildcardSpots > 1 ? 's' : ''} across
                        all {qualificationRules.model === 'conferences' ? 'conferences' : 'divisions'}.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Tie-broken by ladder points, then percentage, then points for.
                      </p>
                    </div>
                  )}
                  {qualificationRules.hasDoubleChance && (
                    <p className="text-xs text-muted-foreground">
                      Top 4 teams overall receive a double-chance (non-elimination first week) regardless of group.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Weekly Power Rankings</CardTitle>
                <CardDescription>
                  Separate from ladder. Blends form, injuries/suspensions, strength of schedule, and travel burden.
                  {latestPowerSnapshot ? ` Updated: round marker ${latestPowerSnapshot.round}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Form</TableHead>
                      <TableHead className="text-right">Inj</TableHead>
                      <TableHead className="text-right">Sched</TableHead>
                      <TableHead className="text-right">Travel</TableHead>
                      <TableHead className="text-right">Move</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestPowerSnapshot?.entries.length ? latestPowerSnapshot.entries.map((entry) => {
                      const club = clubs[entry.clubId]
                      const isPlayer = entry.clubId === playerClubId
                      return (
                        <TableRow key={`power-${entry.clubId}`} className={isPlayer ? 'bg-accent font-semibold' : ''}>
                          <TableCell className="text-center text-muted-foreground">{entry.rank}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ClubMark club={club} className="h-4 w-4 flex-shrink-0" />
                              <span>{club?.name ?? entry.clubId}</span>
                              {isPlayer && <Badge variant="secondary" className="text-xs">You</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{entry.score.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{entry.formScore.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{entry.injuryScore.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{entry.fixtureDifficulty.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{entry.travelLoad.toFixed(1)}</TableCell>
                          <TableCell className={`text-right font-mono ${entry.movement > 0 ? 'text-emerald-600' : entry.movement < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {entry.movement > 0 ? `+${entry.movement}` : entry.movement}
                          </TableCell>
                        </TableRow>
                      )
                    }) : (
                      <TableRow>
                        <TableCell colSpan={8} className="py-4 text-center text-muted-foreground">
                          No power ranking data yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="season" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Season Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Rounds Played</span><span className="font-semibold">{seasonAnalytics.roundsPlayed} / {seasonAnalytics.regularSeasonRounds}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Games Played</span><span className="font-semibold">{seasonAnalytics.gamesPlayed}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Scoring Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Avg Total Score</span><span className="font-semibold">{seasonAnalytics.avgTotalScore.toFixed(1)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Avg Margin</span><span className="font-semibold">{seasonAnalytics.avgMargin.toFixed(1)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Result Split</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Home Win Rate</span><span className="font-semibold">{seasonAnalytics.homeWinRate.toFixed(1)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Away Win Rate</span><span className="font-semibold">{seasonAnalytics.awayWinRate.toFixed(1)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Draw Rate</span><span className="font-semibold">{seasonAnalytics.drawRate.toFixed(1)}%</span></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">League Analytics</CardTitle>
              <CardDescription>Current season team-level leaders</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="text-muted-foreground">Top Percentage</span>
                <span className="font-semibold">
                  {seasonAnalytics.topPercentage ? `${clubs[seasonAnalytics.topPercentage.clubId]?.abbreviation ?? seasonAnalytics.topPercentage.clubId} (${seasonAnalytics.topPercentage.percentage.toFixed(1)}%)` : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="text-muted-foreground">Most Wins</span>
                <span className="font-semibold">
                  {seasonAnalytics.mostWins ? `${clubs[seasonAnalytics.mostWins.clubId]?.abbreviation ?? seasonAnalytics.mostWins.clubId} (${seasonAnalytics.mostWins.wins})` : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="text-muted-foreground">Highest Points For</span>
                <span className="font-semibold">
                  {seasonAnalytics.topScoring ? `${clubs[seasonAnalytics.topScoring.clubId]?.abbreviation ?? seasonAnalytics.topScoring.clubId} (${seasonAnalytics.topScoring.pointsFor})` : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="text-muted-foreground">Best Defence (Least Against)</span>
                <span className="font-semibold">
                  {seasonAnalytics.bestDefence ? `${clubs[seasonAnalytics.bestDefence.clubId]?.abbreviation ?? seasonAnalytics.bestDefence.clubId} (${seasonAnalytics.bestDefence.pointsAgainst})` : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Season Stat Leaders</CardTitle>
              <CardDescription>Totals to date</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-7">
              {(
                [
                  ['Goals', seasonLeaders.goals],
                  ['Disposals', seasonLeaders.disposals],
                  ['Marks', seasonLeaders.marks],
                  ['Tackles', seasonLeaders.tackles],
                  ['Hitouts', seasonLeaders.hitouts],
                  ['AFL Fantasy', seasonLeaders.aflFantasyPoints],
                  ['SuperCoach', seasonLeaders.superCoachPoints],
                ] as const
              ).map(([label, rows]) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data yet.</p>
                  ) : (
                    rows.map((r, idx) => (
                      <div key={`${label}-${r.playerId}`} className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <Link to={`/player/${r.playerId}`} className="truncate hover:underline">
                            {idx + 1}. {r.name}
                          </Link>
                          {players[r.playerId] && (
                            <PlayerStarRating
                              stars={getPlayerStarRating(players[r.playerId])}
                              player={players[r.playerId]}
                              className="scale-[0.75] origin-left"
                            />
                          )}
                        </div>
                        <span className="font-mono font-semibold">{r.value}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="awards" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Brownlow Leaderboard */}
            {brownlowNight && !brownlowRevealed ? (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Medal className="h-4 w-4 text-yellow-500" />
                    Brownlow Medal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <Lock className="h-8 w-8 text-zinc-500" />
                    <p className="font-medium text-foreground">Votes are sealed</p>
                    <p className="text-sm text-muted-foreground">
                      The Brownlow Medal count will be held on the Monday before the Grand Final.
                    </p>
                    {(phase === 'finals' || phase === 'post-season') ? (
                      <Button
                        onClick={() => navigate('/brownlow-night')}
                        className="mt-2"
                      >
                        <Medal className="mr-2 h-4 w-4" />
                        Watch Brownlow Night
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Available during finals</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Medal className="h-4 w-4 text-yellow-500" />
                    Brownlow Medal
                  </CardTitle>
                  <CardDescription>3-2-1 votes per match</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Player</TableHead>
                        <TableHead>Club</TableHead>
                        <TableHead className="text-right">Votes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brownlowLeaders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                            No votes yet — play some rounds first.
                          </TableCell>
                        </TableRow>
                      ) : (
                        brownlowLeaders.map((entry, i) => {
                          const p = players[entry.playerId]
                          return (
                            <TableRow key={entry.playerId}>
                              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                              <TableCell>
                                <div>
                                  <Link
                                    to={`/player/${entry.playerId}`}
                                    className="font-medium hover:underline"
                                  >
                                    {p ? `${p.firstName} ${p.lastName}` : entry.playerId}
                                  </Link>
                                  {p && (
                                    <PlayerStarRating
                                      stars={getPlayerStarRating(p)}
                                      player={p}
                                      className="scale-[0.75] origin-left"
                                    />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {p ? (clubs[p.clubId]?.abbreviation ?? p.clubId) : ''}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold">
                                {entry.votes}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Coleman Leaderboard */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Coleman Medal
                </CardTitle>
                <CardDescription>Leading goalkicker</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-right">Goals</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {colemanLeaders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          No goals yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      colemanLeaders.map((entry, i) => {
                        const p = players[entry.playerId]
                        return (
                          <TableRow key={entry.playerId}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <div>
                                <Link
                                  to={`/player/${entry.playerId}`}
                                  className="font-medium hover:underline"
                                >
                                  {p ? `${p.firstName} ${p.lastName}` : entry.playerId}
                                </Link>
                                {p && (
                                  <PlayerStarRating
                                    stars={getPlayerStarRating(p)}
                                    player={p}
                                    className="scale-[0.75] origin-left"
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p ? (clubs[p.clubId]?.abbreviation ?? p.clubId) : ''}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {entry.goals}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* All-Australian & Other Awards (shown if season awards computed) */}
          {currentAwards && (
            <div className="space-y-4">
              {currentAwards.risingStar && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Rising Star
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const p = players[currentAwards.risingStar!.playerId]
                      return p ? (
                        <div>
                          <Link
                            to={`/player/${p.id}`}
                            className="font-medium hover:underline"
                          >
                            {p.firstName} {p.lastName} ({clubs[p.clubId]?.abbreviation})
                          </Link>
                          <PlayerStarRating stars={getPlayerStarRating(p)} player={p} className="scale-[0.75] origin-left" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}

              {currentAwards.allAustralian.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      All-Australian Team
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {currentAwards.allAustralian.map((pid) => {
                        const p = players[pid]
                        return p ? (
                          <Link key={pid} to={`/player/${pid}`}>
                            <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                              {p.firstName[0]}. {p.lastName} ({clubs[p.clubId]?.abbreviation})
                            </Badge>
                          </Link>
                        ) : null
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="league-history" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">League History</CardTitle>
              <CardDescription>Previous season premiers and grand final results</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Premier</TableHead>
                    <TableHead>Runner-Up</TableHead>
                    <TableHead className="text-right">GF Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.seasons.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                        No completed seasons yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...history.seasons].sort((a, b) => b.year - a.year).map((s) => (
                      <TableRow key={s.year}>
                        <TableCell>{s.year}</TableCell>
                        <TableCell>{clubs[s.premierClubId]?.name ?? s.premierClubId}</TableCell>
                        <TableCell>{clubs[s.runnerUpClubId]?.name ?? s.runnerUpClubId}</TableCell>
                        <TableCell className="text-right font-mono">{s.grandFinalScore.home} - {s.grandFinalScore.away}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            All-time career leaders across every player in the league.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LEADER_STATS.map(({ key, label }) => (
              <CareerLeadersTable
                key={key}
                stat={key}
                label={label}
                players={players}
                clubs={clubs}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
