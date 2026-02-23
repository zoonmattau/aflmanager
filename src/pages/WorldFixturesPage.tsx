import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar, MapPin, Clock, Pencil, PencilOff, BarChart3 } from 'lucide-react'
import { PostMatchBoxScore } from '@/components/match/PostMatchBoxScore'
import { FixtureEditModal } from '@/components/fixtures/FixtureEditModal'
import { VenueAuditPanel } from '@/components/fixtures/VenueAuditPanel'
import type { Match, QuarterScore } from '@/types/match'

function cumulativeScore(scores: QuarterScore[], upTo: number) {
  return scores.slice(0, upTo + 1).reduce((sum, q) => sum + q.total, 0)
}

function FormDots({ form }: { form: string[] }) {
  if (form.length === 0) return <span className="text-xs text-muted-foreground">–</span>
  return (
    <div className="flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          className={`text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-sm ${
            r === 'W' ? 'bg-emerald-500/20 text-emerald-500' :
            r === 'L' ? 'bg-red-500/20 text-red-500' :
            'bg-yellow-500/20 text-yellow-500'
          }`}
        >
          {r}
        </span>
      ))}
    </div>
  )
}

export function WorldFixturesPage() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const season = useGameStore((s) => s.season)
  const matchResults = useGameStore((s) => s.matchResults)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentRound = useGameStore((s) => s.currentRound)
  const ladder = useGameStore((s) => s.ladder)
  const venueState = useGameStore((s) => s.venueState)

  const [statsMatch, setStatsMatch] = useState<Match | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [editTarget, setEditTarget] = useState<{ roundIndex: number; fixtureIndex: number } | null>(null)
  const [selectedFixtureKey, setSelectedFixtureKey] = useState<string | null>(null)

  const canEdit = currentRound === 0 && !matchResults.some((m) => m.result !== null)

  const allRounds = useMemo(() => {
    const regular = season.rounds.map((_r, i) => ({ label: `Round ${i + 1}`, index: i, isFinals: false }))
    const finals = season.finalsRounds.map((r, i) => ({ label: r.name, index: i, isFinals: true }))
    return [...regular, ...finals]
  }, [season])

  const [selectedRound, setSelectedRound] = useState<string>(String(Math.max(0, currentRound)))
  const [filterClubId, setFilterClubId] = useState<string>('all')

  function handleRoundChange(val: string) {
    setSelectedRound(val)
    setSelectedFixtureKey(null)
  }

  function handleFilterChange(val: string) {
    setFilterClubId(val)
    setSelectedFixtureKey(null)
  }

  const roundInfo = useMemo(() => {
    const idx = parseInt(selectedRound)
    return allRounds[idx] ?? allRounds[0]
  }, [selectedRound, allRounds])

  const fixtures = useMemo(() => {
    if (!roundInfo) return []
    if (!roundInfo.isFinals) {
      return season.rounds[roundInfo.index]?.fixtures ?? []
    }
    return season.finalsRounds[roundInfo.index]?.fixtures ?? []
  }, [roundInfo, season])

  const byeClubs = useMemo(() => {
    if (!roundInfo || roundInfo.isFinals) return []
    return season.rounds[roundInfo.index]?.byeClubIds ?? []
  }, [roundInfo, season])

  const filteredFixtures = useMemo(() => {
    if (filterClubId === 'all') return fixtures
    return fixtures.filter(
      (f) => f.homeClubId === filterClubId || f.awayClubId === filterClubId,
    )
  }, [fixtures, filterClubId])

  const sortedClubs = useMemo(
    () => Object.values(clubs).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [clubs],
  )

  function getResult(f: (typeof fixtures)[0]) {
    for (const m of matchResults) {
      const roundMatch = roundInfo?.isFinals ? m.isFinal : !m.isFinal
      if (
        roundMatch &&
        ((m.homeClubId === f.homeClubId && m.awayClubId === f.awayClubId) ||
          (m.homeClubId === f.awayClubId && m.awayClubId === f.homeClubId))
      ) {
        if (!roundInfo?.isFinals && m.round !== parseInt(selectedRound)) continue
        return m
      }
    }
    return null
  }

  function getRecentForm(clubId: string, n = 5) {
    return matchResults
      .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
      .slice(-n)
      .map((m) => {
        const isHome = m.homeClubId === clubId
        const f = isHome ? m.result!.homeTotalScore : m.result!.awayTotalScore
        const a = isHome ? m.result!.awayTotalScore : m.result!.homeTotalScore
        return f > a ? 'W' : f < a ? 'L' : 'D'
      })
  }

  const realRoundIndex = roundInfo && !roundInfo.isFinals ? roundInfo.index : -1

  const selectedFixture = useMemo(() => {
    if (!selectedFixtureKey) return null
    return filteredFixtures.find((f) => `${f.homeClubId}-${f.awayClubId}` === selectedFixtureKey) ?? null
  }, [selectedFixtureKey, filteredFixtures])

  const selectedMatch = selectedFixture ? getResult(selectedFixture) : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Fixtures
          </h1>
          <p className="text-sm text-muted-foreground">
            {allRounds.length} rounds this season
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && venueState && (
            <Button
              variant={showAudit ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAudit((v) => !v)}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Venue Audit
            </Button>
          )}
          {canEdit && (
            <Button
              variant={editMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditMode((m) => !m)}
            >
              {editMode ? (
                <><PencilOff className="h-3.5 w-3.5 mr-1.5" />Done Editing</>
              ) : (
                <><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit Fixture</>
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/world')}>
            ← World Hub
          </Button>
        </div>
      </div>

      {editMode && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          Edit mode — click the pencil on any fixture to change teams, day, time, venue, or move it to another round.
        </div>
      )}

      {showAudit && venueState && (
        <VenueAuditPanel onClose={() => setShowAudit(false)} />
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_420px] gap-4 items-start">

        {/* LEFT: Fixture list */}
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={selectedRound} onValueChange={handleRoundChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select round" />
              </SelectTrigger>
              <SelectContent>
                {allRounds.map((r, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterClubId} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by club" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clubs</SelectItem>
                {sortedClubs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fixture card */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {roundInfo?.label ?? 'Round'}
                {roundInfo?.isFinals && (
                  <Badge variant="secondary">Finals</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredFixtures.length === 0 && byeClubs.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  No fixtures for this round.
                </div>
              ) : (
                <div className="divide-y">
                  {filteredFixtures.map((f, displayIndex) => {
                    const fixtureKey = `${f.homeClubId}-${f.awayClubId}`
                    const isSelected = selectedFixtureKey === fixtureKey

                    const realFixtureIndex = filterClubId === 'all'
                      ? displayIndex
                      : fixtures.findIndex((fx) => fx.homeClubId === f.homeClubId && fx.awayClubId === f.awayClubId)

                    const home = clubs[f.homeClubId]
                    const away = clubs[f.awayClubId]
                    const match = getResult(f)
                    const played = !!match?.result
                    const h = match?.result?.homeTotalScore ?? null
                    const a = match?.result?.awayTotalScore ?? null
                    const homeWon = h !== null && a !== null && h > a
                    const awayWon = h !== null && a !== null && a > h
                    return (
                      <div
                        key={displayIndex}
                        className={[
                          'flex items-center gap-3 px-4 py-3 text-sm cursor-pointer transition-colors',
                          isSelected ? 'bg-accent' : 'hover:bg-muted/50',
                        ].join(' ')}
                        onClick={() => setSelectedFixtureKey(isSelected ? null : fixtureKey)}
                      >
                        {/* Edit button */}
                        {editMode && !roundInfo?.isFinals && realRoundIndex >= 0 && (
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            title="Edit this fixture"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditTarget({ roundIndex: realRoundIndex, fixtureIndex: realFixtureIndex })
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Home team */}
                        <div
                          className="flex flex-1 items-center gap-2"
                          onClick={(e) => { e.stopPropagation(); navigate(`/club/${f.homeClubId}`) }}
                        >
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: home?.colors.primary ?? '#666' }}
                          />
                          <span
                            className={`font-medium truncate cursor-pointer hover:underline ${
                              played
                                ? homeWon ? 'text-foreground' : 'text-muted-foreground'
                                : 'text-foreground'
                            }`}
                          >
                            {home?.fullName ?? f.homeClubId}
                          </span>
                        </div>

                        {/* Score or VS */}
                        <div className="flex items-center gap-1 font-mono font-bold tabular-nums min-w-[72px] justify-center">
                          {played ? (
                            <>
                              <span className={homeWon ? '' : 'text-muted-foreground'}>{h}</span>
                              <span className="text-muted-foreground text-xs font-normal">–</span>
                              <span className={awayWon ? '' : 'text-muted-foreground'}>{a}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs font-normal">vs</span>
                          )}
                        </div>

                        {/* Away team */}
                        <div
                          className="flex flex-1 items-center justify-end gap-2"
                          onClick={(e) => { e.stopPropagation(); navigate(`/club/${f.awayClubId}`) }}
                        >
                          <span
                            className={`font-medium truncate text-right cursor-pointer hover:underline ${
                              played
                                ? awayWon ? 'text-foreground' : 'text-muted-foreground'
                                : 'text-foreground'
                            }`}
                          >
                            {away?.fullName ?? f.awayClubId}
                          </span>
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: away?.colors.primary ?? '#666' }}
                          />
                        </div>

                        {/* Venue + time (md+) */}
                        <div className="hidden md:flex flex-col items-end gap-0.5 w-32 shrink-0">
                          {f.matchDay && (
                            <span className="text-[10px] text-muted-foreground">{f.matchDay.replace('-', ' ')}</span>
                          )}
                          {f.scheduledTime && (
                            <span className="text-[10px] text-muted-foreground">{f.scheduledTime}</span>
                          )}
                          <span className="text-xs text-muted-foreground truncate max-w-full">{f.venue}</span>
                        </div>
                      </div>
                    )
                  })}

                  {/* Bye clubs */}
                  {byeClubs.filter((id) => filterClubId === 'all' || id === filterClubId).map((clubId) => {
                    const club = clubs[clubId]
                    return (
                      <div
                        key={clubId}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground"
                      >
                        {editMode && <div className="w-3.5 shrink-0" />}
                        <div
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                        />
                        <span>{club?.fullName ?? clubId}</span>
                        <Badge variant="outline" className="text-[10px]">BYE</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Sticky panels */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">

          {/* Match info / preview panel */}
          <Card>
            {!selectedFixture ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm gap-2">
                <BarChart3 className="h-8 w-8 opacity-30" />
                <p>Select a match to view details</p>
              </CardContent>
            ) : selectedMatch?.result ? (
              // ── Played match result ──
              <div>
                <CardHeader className="py-3 pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-wide">
                    {roundInfo?.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  {/* Score */}
                  {(() => {
                    const r = selectedMatch.result!
                    const home = clubs[selectedMatch.homeClubId]
                    const away = clubs[selectedMatch.awayClubId]
                    const homeWon = r.homeTotalScore > r.awayTotalScore
                    const awayWon = r.awayTotalScore > r.homeTotalScore
                    const quarters = r.homeScores.length

                    return (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: home?.colors.primary ?? '#666' }} />
                              <span className={`text-sm font-semibold truncate ${homeWon ? '' : 'text-muted-foreground'}`}>
                                {home?.abbreviation ?? selectedMatch.homeClubId}
                              </span>
                            </div>
                            <div className={`text-2xl font-bold tabular-nums mt-0.5 ${homeWon ? '' : 'text-muted-foreground'}`}>
                              {r.homeTotalScore}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground font-medium shrink-0">FINAL</div>
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`text-sm font-semibold truncate ${awayWon ? '' : 'text-muted-foreground'}`}>
                                {away?.abbreviation ?? selectedMatch.awayClubId}
                              </span>
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: away?.colors.primary ?? '#666' }} />
                            </div>
                            <div className={`text-2xl font-bold tabular-nums mt-0.5 ${awayWon ? '' : 'text-muted-foreground'}`}>
                              {r.awayTotalScore}
                            </div>
                          </div>
                        </div>

                        {/* Quarter by quarter */}
                        {quarters > 0 && (
                          <div className="rounded-md border overflow-hidden">
                            <table className="w-full text-xs tabular-nums">
                              <thead>
                                <tr className="border-b bg-muted/40">
                                  <th className="py-1.5 pl-3 text-left text-muted-foreground font-normal"></th>
                                  {r.homeScores.map((_, qi) => (
                                    <th key={qi} className="py-1.5 text-center text-muted-foreground font-normal">Q{qi + 1}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr className={homeWon ? 'font-semibold' : 'text-muted-foreground'}>
                                  <td className="py-1.5 pl-3">
                                    <div className="flex items-center gap-1">
                                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: home?.colors.primary ?? '#666' }} />
                                      {home?.abbreviation}
                                    </div>
                                  </td>
                                  {r.homeScores.map((_, qi) => (
                                    <td key={qi} className="py-1.5 text-center">
                                      {cumulativeScore(r.homeScores, qi)}
                                    </td>
                                  ))}
                                </tr>
                                <tr className={awayWon ? 'font-semibold' : 'text-muted-foreground'}>
                                  <td className="py-1.5 pl-3">
                                    <div className="flex items-center gap-1">
                                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: away?.colors.primary ?? '#666' }} />
                                      {away?.abbreviation}
                                    </div>
                                  </td>
                                  {r.awayScores.map((_, qi) => (
                                    <td key={qi} className="py-1.5 text-center">
                                      {cumulativeScore(r.awayScores, qi)}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Top performers */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Best on ground</p>
                          {(['home', 'away'] as const).map((side) => {
                            const sideStats = (side === 'home' ? r.homePlayerStats : r.awayPlayerStats)
                              .filter((s) => s.participated)
                              .sort((a, b) => b.aflFantasyPoints - a.aflFantasyPoints)
                              .slice(0, 3)
                            const sideClub = side === 'home' ? home : away
                            return (
                              <div key={side}>
                                <div className="flex items-center gap-1 mb-1">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: sideClub?.colors.primary ?? '#666' }} />
                                  <span className="text-xs text-muted-foreground">{sideClub?.abbreviation}</span>
                                </div>
                                {sideStats.map((s) => {
                                  const p = players[s.playerId]
                                  return (
                                    <div key={s.playerId} className="flex items-center justify-between text-xs py-0.5">
                                      <button
                                        type="button"
                                        className="text-left hover:underline truncate"
                                        onClick={() => navigate(`/player/${s.playerId}`)}
                                      >
                                        {p ? `${p.firstName[0]}. ${p.lastName}` : s.playerId}
                                      </button>
                                      <span className="text-muted-foreground shrink-0 ml-2">
                                        {s.disposals}d {s.goals > 0 ? `${s.goals}g ` : ''}{s.aflFantasyPoints}pts
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setStatsMatch(selectedMatch)}
                        >
                          <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                          Full Box Score
                        </Button>
                      </>
                    )
                  })()}
                </CardContent>
              </div>
            ) : (
              // ── Unplayed match preview ──
              <div>
                <CardHeader className="py-3 pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-normal uppercase tracking-wide">
                    {roundInfo?.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  {(() => {
                    const home = clubs[selectedFixture.homeClubId]
                    const away = clubs[selectedFixture.awayClubId]
                    const homeLadder = ladder.find((e) => e.clubId === selectedFixture.homeClubId)
                    const awayLadder = ladder.find((e) => e.clubId === selectedFixture.awayClubId)
                    const homeRank = homeLadder ? ladder.indexOf(homeLadder) + 1 : null
                    const awayRank = awayLadder ? ladder.indexOf(awayLadder) + 1 : null
                    const homeForm = getRecentForm(selectedFixture.homeClubId)
                    const awayForm = getRecentForm(selectedFixture.awayClubId)

                    return (
                      <>
                        {/* Matchup */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 text-center">
                            <div
                              className="h-10 w-10 rounded-full mx-auto mb-1.5"
                              style={{ backgroundColor: home?.colors.primary ?? '#666' }}
                            />
                            <p className="text-sm font-semibold leading-tight">{home?.abbreviation}</p>
                            <p className="text-xs text-muted-foreground">{home?.fullName}</p>
                          </div>
                          <div className="text-muted-foreground text-xs font-medium shrink-0">vs</div>
                          <div className="flex-1 text-center">
                            <div
                              className="h-10 w-10 rounded-full mx-auto mb-1.5"
                              style={{ backgroundColor: away?.colors.primary ?? '#666' }}
                            />
                            <p className="text-sm font-semibold leading-tight">{away?.abbreviation}</p>
                            <p className="text-xs text-muted-foreground">{away?.fullName}</p>
                          </div>
                        </div>

                        {/* Venue + time */}
                        {(selectedFixture.venue || selectedFixture.scheduledTime || selectedFixture.matchDay) && (
                          <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                            {selectedFixture.venue && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {selectedFixture.venue}
                              </div>
                            )}
                            {(selectedFixture.matchDay || selectedFixture.scheduledTime) && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 shrink-0" />
                                {[selectedFixture.matchDay?.replace('-', ' '), selectedFixture.scheduledTime].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Stats comparison */}
                        <div className="space-y-1.5 text-xs">
                          <div className="grid grid-cols-3 items-center gap-1 text-muted-foreground text-[10px] uppercase tracking-wide font-medium mb-1">
                            <span className="text-left">{home?.abbreviation}</span>
                            <span className="text-center"></span>
                            <span className="text-right">{away?.abbreviation}</span>
                          </div>
                          {[
                            { label: 'Ladder', home: homeRank ? `#${homeRank}` : '–', away: awayRank ? `#${awayRank}` : '–' },
                            { label: 'Record', home: homeLadder ? `${homeLadder.wins}-${homeLadder.losses}` : '–', away: awayLadder ? `${awayLadder.wins}-${awayLadder.losses}` : '–' },
                            { label: 'Pts', home: homeLadder ? String(homeLadder.points) : '–', away: awayLadder ? String(awayLadder.points) : '–' },
                            { label: '%', home: homeLadder ? homeLadder.percentage.toFixed(1) : '–', away: awayLadder ? awayLadder.percentage.toFixed(1) : '–' },
                          ].map(({ label, home: hv, away: av }) => (
                            <div key={label} className="grid grid-cols-3 items-center gap-1">
                              <span className="font-semibold tabular-nums">{hv}</span>
                              <span className="text-center text-muted-foreground text-[10px]">{label}</span>
                              <span className="text-right font-semibold tabular-nums">{av}</span>
                            </div>
                          ))}
                        </div>

                        {/* Form */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Recent form</p>
                          <div className="flex items-center justify-between">
                            <FormDots form={homeForm} />
                            <FormDots form={[...awayForm].reverse()} />
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </CardContent>
              </div>
            )}
          </Card>

          {/* Compact live ladder */}
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Live Ladder
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-80">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="pl-3 pr-1 py-1.5 text-left text-muted-foreground font-normal w-6">#</th>
                      <th className="py-1.5 text-left text-muted-foreground font-normal">Club</th>
                      <th className="py-1.5 text-center text-muted-foreground font-normal w-8">W</th>
                      <th className="py-1.5 text-center text-muted-foreground font-normal w-8">L</th>
                      <th className="py-1.5 text-center text-muted-foreground font-normal w-10">Pts</th>
                      <th className="pr-3 py-1.5 text-right text-muted-foreground font-normal w-14">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {ladder.map((entry, i) => {
                      const club = clubs[entry.clubId]
                      const isPlayer = entry.clubId === playerClubId
                      // Highlight selected fixture teams
                      const isInSelectedFixture = selectedFixture &&
                        (entry.clubId === selectedFixture.homeClubId || entry.clubId === selectedFixture.awayClubId)
                      return (
                        <tr
                          key={entry.clubId}
                          className={[
                            isPlayer ? 'bg-accent font-semibold' : '',
                            isInSelectedFixture && !isPlayer ? 'bg-muted/60' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <td className="pl-3 pr-1 py-1 text-muted-foreground">{i + 1}</td>
                          <td className="py-1">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                              />
                              <span className="truncate">{club?.abbreviation ?? entry.clubId}</span>
                              {isPlayer && (
                                <span className="text-[9px] bg-secondary text-secondary-foreground px-1 rounded leading-4">You</span>
                              )}
                            </div>
                          </td>
                          <td className="py-1 text-center text-muted-foreground">{entry.wins}</td>
                          <td className="py-1 text-center text-muted-foreground">{entry.losses}</td>
                          <td className="py-1 text-center font-bold">{entry.points}</td>
                          <td className="pr-3 py-1 text-right text-muted-foreground">{entry.percentage.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full box score dialog */}
      <Dialog open={!!statsMatch} onOpenChange={(open) => { if (!open) setStatsMatch(null) }}>
        <DialogContent className="max-w-4xl w-full p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>
              {statsMatch
                ? `${clubs[statsMatch.homeClubId]?.abbreviation ?? '?'} vs ${clubs[statsMatch.awayClubId]?.abbreviation ?? '?'} — Box Score`
                : 'Box Score'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[80vh] px-6 pb-6">
            {statsMatch && (
              <PostMatchBoxScore
                match={statsMatch}
                clubs={clubs}
                players={players}
                playerClubId={playerClubId ?? ''}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Fixture edit modal */}
      {editTarget && (
        <FixtureEditModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          roundIndex={editTarget.roundIndex}
          fixtureIndex={editTarget.fixtureIndex}
        />
      )}
    </div>
  )
}
