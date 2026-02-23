import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeftRight, AlertCircle, MoveRight, ShieldAlert, Info } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import type { MatchDay, Round } from '@/types/season'
import type { Club } from '@/types/club'
import { VENUES, CLUB_DEFAULT_VENUES } from '@/data/venues'
import { getEffectiveVenueRules, validateMatchupVenue, getMatchupRule } from '@/engine/venues/venueRuleEngine'
import { resolveVenueId } from '@/engine/venues/venueEngine'

const MATCH_DAYS: MatchDay[] = [
  'Thursday',
  'Friday',
  'Saturday-Early',
  'Saturday-Afternoon',
  'Saturday-Twilight',
  'Saturday-Night',
  'Sunday-Early',
  'Sunday-Afternoon',
  'Sunday-Twilight',
  'Monday',
]

const MATCH_DAY_LABELS: Record<MatchDay, string> = {
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday',
  Friday: 'Friday',
  'Saturday-Early': 'Saturday (Early)',
  'Saturday-Afternoon': 'Saturday (Afternoon)',
  'Saturday-Twilight': 'Saturday (Twilight)',
  'Saturday-Night': 'Saturday (Night)',
  'Sunday-Early': 'Sunday (Early)',
  'Sunday-Afternoon': 'Sunday (Afternoon)',
  'Sunday-Twilight': 'Sunday (Twilight)',
  Monday: 'Monday',
}

interface Props {
  open: boolean
  onClose: () => void
  roundIndex: number
  fixtureIndex: number
}

export function FixtureEditModal({ open, onClose, roundIndex, fixtureIndex }: Props) {
  const clubs = useGameStore((s) => s.clubs)
  const rounds = useGameStore((s) => s.season.rounds)
  const settings = useGameStore((s) => s.settings)
  const venueState = useGameStore((s) => s.venueState)
  const updateFixtureGame = useGameStore((s) => s.updateFixtureGame)
  const moveFixtureBetweenRounds = useGameStore((s) => s.moveFixtureBetweenRounds)

  const fixture = rounds[roundIndex]?.fixtures[fixtureIndex]
  const round = rounds[roundIndex]

  const [homeId, setHomeId] = useState(fixture?.homeClubId ?? '')
  const [awayId, setAwayId] = useState(fixture?.awayClubId ?? '')
  const [matchDay, setMatchDay] = useState<MatchDay | ''>(fixture?.matchDay ?? '')
  const [venueId, setVenueId] = useState<string>(
    fixture?.venueId ?? resolveVenueId(fixture?.venue ?? '') ?? '',
  )

  // Move-between-rounds state
  const [moveToRound, setMoveToRound] = useState<string>('')
  const [swapFixtureIndex, setSwapFixtureIndex] = useState<string>('')

  const [error, setError] = useState('')
  const [moveError, setMoveError] = useState('')

  const sortedClubs = useMemo(
    () => Object.values(clubs).sort((a: Club, b: Club) => a.fullName.localeCompare(b.fullName)),
    [clubs],
  )

  // All known venues sorted by name
  const allVenues = useMemo(
    () => Object.values(VENUES).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  )

  // Venue options grouped: home club's venues first, then the rest
  const venueOptions = useMemo(() => {
    const homeDefaults = CLUB_DEFAULT_VENUES[homeId]
    const primaryId = homeDefaults?.primary
    const secondaryId = homeDefaults?.secondary
    const priority = new Set([primaryId, secondaryId].filter(Boolean) as string[])
    const home = allVenues.filter((v) => priority.has(v.id))
    const other = allVenues.filter((v) => !priority.has(v.id))
    return { home, other }
  }, [allVenues, homeId])

  // Effective venue rules for live validation
  const rules = useMemo(() => getEffectiveVenueRules(settings.venueRules), [settings.venueRules])

  // Live violation check (matchup rules only — quota needs full season context)
  const liveViolations = useMemo(() => {
    if (!venueId || !homeId || !awayId) return []
    return validateMatchupVenue(homeId, awayId, venueId, roundIndex + 1, fixtureIndex, rules)
  }, [venueId, homeId, awayId, roundIndex, fixtureIndex, rules])

  // Advisory: display the matchup rule note (if any) even when there's no violation
  const matchupRule = useMemo(
    () => (homeId && awayId ? getMatchupRule(homeId, awayId, rules) : null),
    [homeId, awayId, rules],
  )

  const moveTargetRound: Round | undefined =
    moveToRound !== '' ? rounds[parseInt(moveToRound)] : undefined

  function handleSwapHomeAway() {
    const tmp = homeId
    setHomeId(awayId)
    setAwayId(tmp)
  }

  function handleSave() {
    setError('')
    if (!fixture) return
    const venueName = venueId ? (VENUES[venueId]?.name ?? '') : ''
    const result = updateFixtureGame(roundIndex, fixtureIndex, {
      homeClubId: homeId || undefined,
      awayClubId: awayId || undefined,
      matchDay: matchDay || undefined,
      venue: venueName || undefined,
    })
    if (!result.success) {
      setError(result.error ?? 'Failed to save.')
      return
    }
    onClose()
  }

  function handleMove() {
    setMoveError('')
    if (moveToRound === '' || swapFixtureIndex === '') {
      setMoveError('Select a round and a fixture to swap with.')
      return
    }
    const result = moveFixtureBetweenRounds(
      roundIndex,
      fixtureIndex,
      parseInt(moveToRound),
      parseInt(swapFixtureIndex),
    )
    if (!result.success) {
      setMoveError(result.error ?? 'Failed to move fixture.')
      return
    }
    onClose()
  }

  if (!fixture || !round) return null

  const homeClub = clubs[homeId]
  const awayClub = clubs[awayId]
  const hasErrors = liveViolations.some((v) => v.severity === 'error')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Fixture — Round {round.number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">

          {/* Teams */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Teams</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={homeId} onValueChange={setHomeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Home team" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedClubs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">Home</p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleSwapHomeAway}
                title="Swap home and away"
                className="shrink-0"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>

              <div className="flex-1">
                <Select value={awayId} onValueChange={setAwayId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Away team" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedClubs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">Away</p>
              </div>
            </div>
            {homeClub && awayClub && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: homeClub.colors.primary }}
                />
                <span>{homeClub.abbreviation}</span>
                <span>vs</span>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: awayClub.colors.primary }}
                />
                <span>{awayClub.abbreviation}</span>
              </div>
            )}
          </div>

          {/* Match day */}
          <div className="space-y-1.5">
            <Label htmlFor="matchday">Match Day</Label>
            <Select value={matchDay} onValueChange={(v) => setMatchDay(v as MatchDay)}>
              <SelectTrigger id="matchday">
                <SelectValue placeholder="Select day" />
              </SelectTrigger>
              <SelectContent>
                {MATCH_DAYS.map((d) => (
                  <SelectItem key={d} value={d}>{MATCH_DAY_LABELS[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Venue — dropdown with violation feedback */}
          <div className="space-y-1.5">
            <Label htmlFor="venue" className="flex items-center gap-1.5">
              Venue
              {hasErrors && <ShieldAlert className="h-3.5 w-3.5 text-destructive" />}
            </Label>

            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger
                id="venue"
                className={hasErrors ? 'border-destructive focus:ring-destructive' : ''}
              >
                <SelectValue placeholder="Select venue" />
              </SelectTrigger>
              <SelectContent>
                {/* Home club's venues first */}
                {venueOptions.home.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {homeClub?.abbreviation ?? 'Home'} Venues
                    </div>
                    {venueOptions.home.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        <span className="ml-1 text-muted-foreground text-[10px]">
                          ({v.city})
                        </span>
                      </SelectItem>
                    ))}
                    <div className="border-t my-1" />
                  </>
                )}
                {venueOptions.other.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                    <span className="ml-1 text-muted-foreground text-[10px]">
                      ({v.city})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Matchup rule advisory (shown even when compliant) */}
            {matchupRule && liveViolations.length === 0 && venueState && (
              <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-2.5 py-2">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 dark:text-blue-400">{matchupRule.note}</p>
              </div>
            )}

            {/* Live violations */}
            {liveViolations.map((v, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-[11px] text-destructive">{v.message}</p>
              </div>
            ))}
          </div>

          {/* Save error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Move between rounds */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Move to a Different Round
            </p>
            <p className="text-xs text-muted-foreground">
              Swap this game with a game in another round. Both clubs must not already play in the target round.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target Round</Label>
                <Select
                  value={moveToRound}
                  onValueChange={(v) => { setMoveToRound(v); setSwapFixtureIndex('') }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick round" />
                  </SelectTrigger>
                  <SelectContent>
                    {rounds.map((r, i) => {
                      if (i === roundIndex) return null
                      return (
                        <SelectItem key={i} value={String(i)}>
                          Round {r.number}
                          {r.isBye ? ' (Bye)' : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Swap With</Label>
                <Select
                  value={swapFixtureIndex}
                  onValueChange={setSwapFixtureIndex}
                  disabled={!moveTargetRound}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={moveTargetRound ? 'Pick game' : '—'} />
                  </SelectTrigger>
                  <SelectContent>
                    {moveTargetRound?.fixtures.map((f, i) => {
                      const h = clubs[f.homeClubId]?.abbreviation ?? f.homeClubId
                      const a = clubs[f.awayClubId]?.abbreviation ?? f.awayClubId
                      return (
                        <SelectItem key={i} value={String(i)}>
                          {h} vs {a}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {moveTargetRound && swapFixtureIndex !== '' && (() => {
              const swapF = moveTargetRound.fixtures[parseInt(swapFixtureIndex)]
              const hA = clubs[fixture.homeClubId]?.abbreviation ?? fixture.homeClubId
              const aA = clubs[fixture.awayClubId]?.abbreviation ?? fixture.awayClubId
              const hB = clubs[swapF?.homeClubId]?.abbreviation ?? swapF?.homeClubId
              const aB = clubs[swapF?.awayClubId]?.abbreviation ?? swapF?.awayClubId
              return (
                <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
                  <Badge variant="outline" className="text-[10px]">R{round.number}</Badge>
                  <span className="font-medium">{hA} vs {aA}</span>
                  <MoveRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Badge variant="outline" className="text-[10px]">R{moveTargetRound.number}</Badge>
                  <span className="font-medium">{hB} vs {aB}</span>
                </div>
              )
            })()}

            {moveError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {moveError}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleMove}
              disabled={moveToRound === '' || swapFixtureIndex === ''}
              className="w-full"
            >
              <MoveRight className="h-4 w-4 mr-1.5" />
              Move Game to Round {moveTargetRound?.number ?? '—'}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={hasErrors}
            title={hasErrors ? 'Fix venue violations before saving' : undefined}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
