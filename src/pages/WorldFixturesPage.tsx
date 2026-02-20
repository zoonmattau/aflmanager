import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from 'lucide-react'

export function WorldFixturesPage() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const season = useGameStore((s) => s.season)
  const matchResults = useGameStore((s) => s.matchResults)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentRound = useGameStore((s) => s.currentRound)

  const allRounds = useMemo(() => {
    const regular = season.rounds.map((r, i) => ({ label: `Round ${i + 1}`, index: i, isFinals: false }))
    const finals = season.finalsRounds.map((r, i) => ({ label: r.name, index: i, isFinals: true }))
    return [...regular, ...finals]
  }, [season])

  const [selectedRound, setSelectedRound] = useState<string>(String(Math.max(0, currentRound)))
  const [filterClubId, setFilterClubId] = useState<string>('all')

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

  const matchResultsMap = useMemo(() => {
    const map = new Map<string, (typeof matchResults)[0]>()
    for (const m of matchResults) {
      map.set(`${m.homeClubId}-${m.awayClubId}-${m.round}`, m)
    }
    return map
  }, [matchResults])

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
    const roundIdx = roundInfo?.isFinals ? 100 + (roundInfo?.index ?? 0) : parseInt(selectedRound)
    // Try both orderings
    for (const m of matchResults) {
      const roundMatch = roundInfo?.isFinals ? m.isFinal : !m.isFinal
      if (
        roundMatch &&
        ((m.homeClubId === f.homeClubId && m.awayClubId === f.awayClubId) ||
          (m.homeClubId === f.awayClubId && m.awayClubId === f.homeClubId))
      ) {
        if (!roundInfo?.isFinals && m.round !== roundIdx) continue
        return m
      }
    }
    return null
  }

  return (
    <div className="space-y-4">
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
        <Button variant="outline" size="sm" onClick={() => navigate('/world')}>
          ← World Hub
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={selectedRound} onValueChange={setSelectedRound}>
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

        <Select value={filterClubId} onValueChange={setFilterClubId}>
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
              {filteredFixtures.map((f, i) => {
                const home = clubs[f.homeClubId]
                const away = clubs[f.awayClubId]
                const match = getResult(f)
                const played = !!match?.result
                const h = match?.result?.homeTotalScore ?? null
                const a = match?.result?.awayTotalScore ?? null
                const homeWon = h !== null && a !== null && h > a
                const awayWon = h !== null && a !== null && a > h
                const isUserMatch =
                  f.homeClubId === playerClubId || f.awayClubId === playerClubId

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${isUserMatch ? 'bg-primary/5' : ''}`}
                  >
                    {/* Home team */}
                    <div
                      className="flex flex-1 items-center gap-2 cursor-pointer hover:text-foreground"
                      onClick={() => navigate(`/club/${f.homeClubId}`)}
                    >
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: home?.colors.primary ?? '#666' }}
                      />
                      <span
                        className={`font-medium truncate ${
                          played
                            ? homeWon
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        {home?.fullName ?? f.homeClubId}
                      </span>
                      {f.homeClubId === playerClubId && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                          You
                        </Badge>
                      )}
                    </div>

                    {/* Score or VS */}
                    <div className="flex items-center gap-1 font-mono font-bold tabular-nums min-w-[80px] justify-center">
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
                      className="flex flex-1 items-center justify-end gap-2 cursor-pointer hover:text-foreground"
                      onClick={() => navigate(`/club/${f.awayClubId}`)}
                    >
                      {f.awayClubId === playerClubId && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                          You
                        </Badge>
                      )}
                      <span
                        className={`font-medium truncate text-right ${
                          played
                            ? awayWon
                              ? 'text-foreground'
                              : 'text-muted-foreground'
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

                    {/* Venue */}
                    <div className="hidden md:block text-xs text-muted-foreground w-32 text-right shrink-0 truncate">
                      {f.venue}
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
  )
}
