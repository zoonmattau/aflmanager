import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Zap, History, MapPin } from 'lucide-react'
import {
  getEventDatesInMonth,
  getEventsForDate,
  formatDate,
  addMonths,
  getFirstOfMonth,
  getWeekday,
  getDayOfMonth,
  getMonth,
  getYear,
  getLastOfMonth,
  getMonthName,
  diffDays,
} from '@/engine/calendar/calendarEngine'
import { getFixtureDateIso } from '@/engine/season/fixtureDateUtils'
import type { GameEventType } from '@/types/calendar'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import type { WatchNavState } from '@/pages/MatchViewerPage'

const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  kicking: 'Kicking', handball: 'Handball', marking: 'Marking',
  physical: 'Physical Conditioning', contested: 'Contested Ball',
  'game-sense': 'Game Sense', offensive: 'Offensive Play',
  defensive: 'Defensive Skills', ruck: 'Ruck Craft', mental: 'Mental Strength',
  'set-pieces': 'Set Pieces', 'match-fitness': 'Match Fitness',
  recovery: 'Recovery', 'video-review': 'Video Review', rest: 'Rest',
}

const DEADLINE_EVENT_TYPES = new Set<GameEventType>([
  'contract-deadline', 'trade-deadline', 'draft', 'tribunal',
])

const EVENT_COLORS: Record<GameEventType, string> = {
  match: 'bg-blue-500',
  training: 'bg-green-500',
  'contract-deadline': 'bg-orange-500',
  'trade-deadline': 'bg-purple-500',
  draft: 'bg-yellow-500',
  'preseason-friendly': 'bg-teal-500',
  bye: 'bg-gray-400',
  milestone: 'bg-pink-500',
  'special-event': 'bg-amber-500',
  tribunal: 'bg-orange-500',
  'jumper-management': 'bg-indigo-500',
}

const EVENT_LABELS: Record<GameEventType, string> = {
  match: 'Match',
  training: 'Training',
  'contract-deadline': 'Contract',
  'trade-deadline': 'Trade',
  draft: 'Draft',
  'preseason-friendly': 'Friendly',
  bye: 'Bye',
  milestone: 'Event',
  'special-event': 'Exhibition',
  tribunal: 'Tribunal',
  'jumper-management': 'Jumpers',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function eventNavLink(type: GameEventType, _data?: Record<string, unknown>): string | null {
  if (type === 'match') return '/match'
  if (type === 'special-event') return '/calendar'
  if (type === 'contract-deadline') return '/contracts'
  if (type === 'trade-deadline') return '/trade'
  if (type === 'draft') return '/draft'
  if (type === 'tribunal') return '/tribunal'
  if (type === 'jumper-management') return '/jumper-management'
  return null
}

const UPCOMING_EXCLUDED_TYPES = new Set<GameEventType>(['training'])

// ---------------------------------------------------------------------------
// Fixture Card
// ---------------------------------------------------------------------------

interface FixtureCardProps {
  homeClubId: string
  awayClubId: string
  venue: string
  isUserMatch: boolean
  isPast: boolean
  clubs: Record<string, { name: string; abbreviation: string; colors: { primary: string } }>
  onWatch: () => void
  onQuickSim?: () => void
  onReview?: () => void
}

function FixtureCard({
  homeClubId, awayClubId, venue,
  isUserMatch, isPast, clubs,
  onWatch, onQuickSim, onReview,
}: FixtureCardProps) {
  const homeClub = clubs[homeClubId]
  const awayClub = clubs[awayClubId]
  const homeColor = homeClub?.colors.primary ?? '#6b7280'
  const awayColor = awayClub?.colors.primary ?? '#9ca3af'

  return (
    <div className={`rounded border p-2.5 space-y-1.5 ${isUserMatch ? 'border-primary/40 bg-primary/5' : 'border-border/40'}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: homeColor }} />
          <span className="text-[12px] font-semibold truncate">{homeClub?.name ?? homeClubId}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">vs</span>
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          <span className="text-[12px] font-semibold truncate">{awayClub?.name ?? awayClubId}</span>
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate flex-1">{venue}</span>
        {isUserMatch && <Badge variant="outline" className="text-[9px]">Your Match</Badge>}
      </div>
      {isPast ? (
        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 h-7" onClick={onReview ?? onWatch}>
          <History className="h-3 w-3" />
          Review
        </Button>
      ) : (
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 text-xs gap-1 h-7" onClick={onWatch}>
            <Eye className="h-3 w-3" />
            Watch
          </Button>
          {isUserMatch && onQuickSim && (
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1 h-7" onClick={onQuickSim}>
              <Zap className="h-3 w-3" />
              Quick Sim
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CalendarPage
// ---------------------------------------------------------------------------

export function CalendarPage() {
  const navigate = useNavigate()

  const calendar         = useGameStore((s) => s.calendar)
  const trainingWeekPlan = useGameStore((s) => s.trainingWeekPlan)
  const currentDate      = calendar.currentDate
  const currentRound     = useGameStore((s) => s.currentRound)
  const season           = useGameStore((s) => s.season)
  const clubs            = useGameStore((s) => s.clubs)
  const playerClubId     = useGameStore((s) => s.playerClubId ?? '')
  const matchResults     = useGameStore((s) => s.matchResults)
  const settings         = useGameStore((s) => s.settings)
  const simCurrentRound  = useGameStore((s) => s.simCurrentRound)

  const [viewDate, setViewDate]         = useState(() => getFirstOfMonth(currentDate))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [quickSimDone, setQuickSimDone] = useState(false)

  const viewYear  = getYear(viewDate)
  const viewMonth = getMonth(viewDate)

  // Training plan date → session map
  const planSessionMap = useMemo(() => {
    const map = new Map<string, { focus: TrainingFocus; intensity: string; slot: 'morning' | 'afternoon' }[]>()
    if (!trainingWeekPlan) return map
    for (const [date, daySlots] of Object.entries(trainingWeekPlan.slots)) {
      const sessions: { focus: TrainingFocus; intensity: string; slot: 'morning' | 'afternoon' }[] = []
      for (const slotKey of ['morning', 'afternoon'] as const) {
        for (const group of daySlots[slotKey].groups) {
          sessions.push({ focus: group.focus, intensity: group.intensity, slot: slotKey })
        }
      }
      if (sessions.length > 0) map.set(date, sessions)
    }
    return map
  }, [trainingWeekPlan])

  const eventDots = useMemo(() => {
    const dots = getEventDatesInMonth(calendar, viewYear, viewMonth)
    for (const dateStr of planSessionMap.keys()) {
      const d = new Date(dateStr + 'T00:00:00')
      if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
        const day = d.getDate()
        const existing = dots.get(day) ?? []
        if (!existing.includes('training')) dots.set(day, [...existing, 'training'])
      }
    }
    return dots
  }, [calendar, viewYear, viewMonth, planSessionMap])

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    const staticEvents = getEventsForDate(calendar, selectedDate)
    const planSessions = planSessionMap.get(selectedDate)
    if (!planSessions || planSessions.length === 0) return staticEvents

    const nonTraining = staticEvents.filter((e) => e.type !== 'training')
    const planEvents = planSessions.map((s, i) => ({
      id: `plan-${selectedDate}-${i}`,
      date: selectedDate,
      type: 'training' as GameEventType,
      title: `${TRAINING_FOCUS_LABELS[s.focus]} (${s.slot === 'morning' ? 'AM' : 'PM'})`,
      description: `${s.intensity.charAt(0).toUpperCase()}${s.intensity.slice(1)} intensity`,
      resolved: false as const,
      data: undefined,
    }))
    return [...nonTraining, ...planEvents]
  }, [calendar, selectedDate, planSessionMap])

  const upcoming = useMemo(
    () => calendar.events
      .filter((e) => !e.resolved && !UPCOMING_EXCLUDED_TYPES.has(e.type))
      .slice(0, 12),
    [calendar],
  )

  // Season start date (directly on settings)
  const seasonStartDate = settings.seasonStartDate ?? ''

  // Today's fixtures (current round, on currentDate)
  const todaysFixtures = useMemo(() => {
    if (!season || currentRound < 0 || !seasonStartDate) return []
    const round = season.rounds[currentRound]
    if (!round) return []
    return round.fixtures
      .map((fixture, idx) => ({
        fixture,
        idx,
        date: getFixtureDateIso(seasonStartDate, currentRound, fixture.matchDay),
      }))
      .filter(({ date }) => date === currentDate)
  }, [season, currentRound, currentDate, seasonStartDate])

  // Past fixtures on selected date
  const selectedDatePastFixtures = useMemo(() => {
    if (!selectedDate || selectedDate >= currentDate || !season || !seasonStartDate) return []
    const results: Array<{
      fixture: (typeof season.rounds)[0]['fixtures'][0]
      roundIdx: number
      idx: number
      matchId: string
    }> = []
    for (let ri = 0; ri < season.rounds.length; ri++) {
      const round = season.rounds[ri]
      if (!round) continue
      round.fixtures.forEach((fixture, idx) => {
        const date = getFixtureDateIso(seasonStartDate, ri, fixture.matchDay)
        if (date !== selectedDate) return
        const played = matchResults.find(
          (m) => m.round === ri && m.homeClubId === fixture.homeClubId && m.awayClubId === fixture.awayClubId && m.result !== null,
        )
        if (played) results.push({ fixture, roundIdx: ri, idx, matchId: played.id })
      })
    }
    return results
  }, [selectedDate, currentDate, season, seasonStartDate, matchResults])

  const calendarGrid = useMemo(() => {
    const firstDay    = getFirstOfMonth(viewDate)
    const lastDay     = getLastOfMonth(viewDate)
    const startWeekday = getWeekday(firstDay)
    const totalDays   = getDayOfMonth(lastDay)
    const cells: (number | null)[] = []
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= totalDays; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewDate])

  const prevMonth = () => setViewDate(addMonths(viewDate, -1))
  const nextMonth = () => setViewDate(addMonths(viewDate, 1))

  const makeDateStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const currentDay = getMonth(currentDate) === viewMonth && getYear(currentDate) === viewYear
    ? getDayOfMonth(currentDate)
    : null

  function buildWatchState(
    roundIdx: number,
    fixture: (typeof season.rounds)[0]['fixtures'][0],
    idx: number,
    matchId?: string,
  ): WatchNavState {
    return {
      homeClubId:   fixture.homeClubId,
      awayClubId:   fixture.awayClubId,
      venue:        fixture.venue,
      venueId:      fixture.venueId,
      round:        roundIdx,
      fixtureIndex: idx,
      isUserMatch:  fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId,
      matchId,
    }
  }

  function handleWatch(roundIdx: number, fixture: (typeof season.rounds)[0]['fixtures'][0], idx: number) {
    navigate('/watch', { state: buildWatchState(roundIdx, fixture, idx) })
  }

  function handleReview(
    roundIdx: number,
    fixture: (typeof season.rounds)[0]['fixtures'][0],
    idx: number,
    matchId: string,
  ) {
    navigate('/watch', { state: buildWatchState(roundIdx, fixture, idx, matchId) })
  }

  function handleQuickSim() {
    simCurrentRound()
    setQuickSimDone(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          View upcoming events and the season schedule
        </p>
      </div>

      {/* Today's Fixtures Banner */}
      {todaysFixtures.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Today's Fixtures</CardTitle>
              <Badge variant="outline" className="text-[10px]">{formatDate(currentDate)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaysFixtures.map(({ fixture, idx }) => (
              <FixtureCard
                key={`${fixture.homeClubId}-${fixture.awayClubId}`}
                homeClubId={fixture.homeClubId}
                awayClubId={fixture.awayClubId}
                venue={fixture.venue}
                isUserMatch={fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId}
                isPast={false}
                clubs={clubs}
                onWatch={() => handleWatch(currentRound, fixture, idx)}
                onQuickSim={
                  fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId
                    ? handleQuickSim
                    : undefined
                }
              />
            ))}
            {quickSimDone && (
              <p className="text-xs text-green-500 text-center pt-1">
                Match simulated! Check the Fixture page for results.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Month View */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">{getMonthName(viewDate)}</CardTitle>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day names */}
            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {calendarGrid.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="h-14 border-t" />
                }

                const dateStr    = makeDateStr(day)
                const dots       = eventDots.get(day) ?? []
                const isToday    = day === currentDay
                const isSelected = dateStr === selectedDate
                const isPast     = dateStr < currentDate

                return (
                  <button
                    key={day}
                    className={`h-14 border-t px-1 pt-1 text-left transition-colors hover:bg-accent/50 ${
                      isSelected ? 'bg-accent' : ''
                    } ${isPast ? 'opacity-50' : ''}`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? 'bg-primary text-primary-foreground rounded-full px-1.5 py-0.5'
                          : ''
                      }`}
                    >
                      {day}
                    </span>
                    {dots.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap">
                        {dots.map((type) => (
                          <div
                            key={type}
                            className={`h-1.5 w-1.5 rounded-full ${EVENT_COLORS[type]}`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              {Object.entries(EVENT_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${color}`} />
                  <span>{EVENT_LABELS[type as GameEventType]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {selectedDate && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{formatDate(selectedDate)}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Past match review cards */}
                {selectedDatePastFixtures.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Matches Played
                    </div>
                    {selectedDatePastFixtures.map(({ fixture, roundIdx, idx, matchId }) => (
                      <FixtureCard
                        key={matchId}
                        homeClubId={fixture.homeClubId}
                        awayClubId={fixture.awayClubId}
                        venue={fixture.venue}
                        isUserMatch={false}
                        isPast={true}
                        clubs={clubs}
                        onWatch={() => handleReview(roundIdx, fixture, idx, matchId)}
                        onReview={() => handleReview(roundIdx, fixture, idx, matchId)}
                      />
                    ))}
                  </div>
                )}

                {selectedEvents.length === 0 && selectedDatePastFixtures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events on this day.</p>
                ) : selectedEvents.length > 0 ? (
                  <div className="space-y-3">
                    {selectedEvents.map((evt) => {
                      const link = !evt.resolved ? eventNavLink(evt.type, evt.data) : null
                      return (
                        <div key={evt.id} className="flex items-start gap-2">
                          <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${EVENT_COLORS[evt.type]}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{evt.title}</p>
                            {evt.description && (
                              <p className="text-xs text-muted-foreground">{evt.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant={evt.resolved ? 'secondary' : 'outline'}
                                className="text-[10px]"
                              >
                                {evt.resolved ? 'Completed' : 'Upcoming'}
                              </Badge>
                              {link && (
                                <Link
                                  to={link}
                                  className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
                                >
                                  {evt.type === 'match' ? 'Play Match' : evt.type === 'special-event' ? 'View Event' : 'Go'}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming events.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((evt) => {
                    const isDeadline = DEADLINE_EVENT_TYPES.has(evt.type)
                    const daysUntil  = diffDays(currentDate, evt.date)
                    const urgency    = isDeadline
                      ? daysUntil <= 2 ? 'urgent' : daysUntil <= 7 ? 'warning' : null
                      : null
                    const link = eventNavLink(evt.type, evt.data)
                    return (
                      <div key={evt.id} className="flex items-start gap-2">
                        <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${EVENT_COLORS[evt.type]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate flex-1">{evt.title}</p>
                            {link && (
                              <Link
                                to={link}
                                className="text-[10px] text-primary flex items-center gap-0.5 hover:underline flex-shrink-0"
                              >
                                {evt.type === 'match' ? 'Play' : evt.type === 'special-event' ? 'View' : 'Go'}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Link>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] text-muted-foreground">{formatDate(evt.date)}</p>
                            {urgency && (
                              <span className={`text-[10px] font-semibold ${
                                urgency === 'urgent' ? 'text-red-500' : 'text-amber-500'
                              }`}>
                                {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
