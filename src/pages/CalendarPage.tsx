import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Zap, History, MapPin } from 'lucide-react'
import {
  getEventsForDate,
  formatDate,
  addDays,
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
  physical: 'Physical', contested: 'Contested', 'game-sense': 'Game Sense',
  offensive: 'Offensive', defensive: 'Defensive', ruck: 'Ruck Craft',
  mental: 'Mental', 'set-pieces': 'Set Pieces', 'match-fitness': 'Match Fitness',
  recovery: 'Recovery', 'video-review': 'Video Review', rest: 'Rest',
}

const DEADLINE_EVENT_TYPES = new Set<GameEventType>([
  'contract-deadline', 'trade-deadline', 'draft', 'tribunal',
])

// Chip classes for non-match events shown inside calendar cells
// Blue = match-related, Purple = reserves, Green = training, Orange = admin/deadlines, Amber = special, Gray = bye
const EVENT_CHIP_CLS: Record<GameEventType, string> = {
  match:               'bg-blue-500/25 text-blue-300',
  'reserves-match':    'bg-purple-500/20 text-purple-300',
  training:            'bg-green-500/20 text-green-300',
  'preseason-friendly':'bg-blue-500/20 text-blue-300',
  bye:                 'bg-zinc-500/20 text-zinc-400',
  'contract-deadline': 'bg-orange-500/20 text-orange-300',
  'trade-deadline':    'bg-orange-500/20 text-orange-300',
  draft:               'bg-orange-500/20 text-orange-300',
  tribunal:            'bg-orange-500/20 text-orange-300',
  'jumper-management': 'bg-orange-500/20 text-orange-300',
  milestone:           'bg-amber-500/20 text-amber-300',
  'special-event':     'bg-amber-500/20 text-amber-300',
}

// Dot colors for the sidebar event list
const EVENT_COLORS: Record<GameEventType, string> = {
  match:               'bg-blue-500',
  'reserves-match':    'bg-purple-500',
  training:            'bg-green-500',
  'preseason-friendly':'bg-blue-500',
  bye:                 'bg-gray-400',
  'contract-deadline': 'bg-orange-500',
  'trade-deadline':    'bg-orange-500',
  draft:               'bg-orange-500',
  tribunal:            'bg-orange-500',
  'jumper-management': 'bg-orange-500',
  milestone:           'bg-amber-500',
  'special-event':     'bg-amber-500',
}

const EVENT_LABELS: Record<GameEventType, string> = {
  match:               'Match',
  'reserves-match':    'Reserves',
  training:            'Training',
  'contract-deadline': 'Contract Deadline',
  'trade-deadline':    'Trade Deadline',
  draft:               'Draft',
  'preseason-friendly':'Friendly',
  bye:                 'Bye',
  milestone:           'Milestone',
  'special-event':     'Special Event',
  tribunal:            'Tribunal',
  'jumper-management': 'Jumper Management',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function eventNavLink(type: GameEventType): string | null {
  if (type === 'match') return '/match'
  if (type === 'special-event') return '/calendar'
  if (type === 'contract-deadline') return '/contracts'
  if (type === 'trade-deadline') return '/trade'
  if (type === 'draft') return '/draft'
  if (type === 'tribunal') return '/tribunal'
  if (type === 'jumper-management') return '/jumper-management'
  return null
}

const UPCOMING_EXCLUDED_TYPES = new Set<GameEventType>(['training']) // calendar.events training is replaced by planSessionMap

function parseScheduledTime(t: string | undefined): number {
  if (!t) return 9999
  const m = t.match(/(\d+):(\d+)(am|pm)/i)
  if (!m) return 9999
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0
  return h * 60 + min
}

// ---------------------------------------------------------------------------
// Fixture Card
// ---------------------------------------------------------------------------

interface FixtureCardProps {
  homeClubId: string
  awayClubId: string
  venue: string
  scheduledTime?: string
  isUserMatch: boolean
  isPast: boolean
  clubs: Record<string, { name: string; abbreviation: string; colors: { primary: string } }>
  onWatch: () => void
  onQuickSim?: () => void
  onReview?: () => void
}

function FixtureCard({
  homeClubId, awayClubId, venue, scheduledTime,
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
        {scheduledTime && (
          <span className="font-mono tabular-nums shrink-0">{scheduledTime}</span>
        )}
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

  // All calendar events keyed by date
  const dayEventsMap = useMemo(() => {
    const map = new Map<string, typeof calendar.events>()
    for (const evt of calendar.events) {
      if (!map.has(evt.date)) map.set(evt.date, [])
      map.get(evt.date)!.push(evt)
    }
    return map
  }, [calendar.events])

  // All season fixtures keyed by ISO date string
  const fixturesByDate = useMemo(() => {
    type Fixture = typeof season.rounds[0]['fixtures'][0]
    const map = new Map<string, Array<{ fixture: Fixture; roundIdx: number; idx: number }>>()
    if (!season || !settings.seasonStartDate) return map
    for (let ri = 0; ri < season.rounds.length; ri++) {
      const round = season.rounds[ri]
      if (!round) continue
      for (let idx = 0; idx < round.fixtures.length; idx++) {
        const fixture = round.fixtures[idx]
        const date = getFixtureDateIso(settings.seasonStartDate, ri, fixture.matchDay)
        if (!map.has(date)) map.set(date, [])
        map.get(date)!.push({ fixture, roundIdx: ri, idx })
      }
    }
    return map
  }, [season, settings.seasonStartDate])

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

  const upcoming = useMemo(() => {
    const calEvents = calendar.events.filter((e) => !e.resolved && !UPCOMING_EXCLUDED_TYPES.has(e.type))

    // Build upcoming training entries from the weekly plan
    const trainingItems = Array.from(planSessionMap.entries())
      .filter(([date]) => date >= currentDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({
        id: `plan-training-${date}`,
        date,
        type: 'training' as GameEventType,
        title: sessions.map((s) => TRAINING_FOCUS_LABELS[s.focus]).join(' · '),
        resolved: false as const,
        data: undefined,
      }))

    return [...calEvents, ...trainingItems]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 14)
  }, [calendar, planSessionMap, currentDate])

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
    return results.sort((a, b) => parseScheduledTime(a.fixture.scheduledTime) - parseScheduledTime(b.fixture.scheduledTime))
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

  // Build the event chips shown inside each day cell
  type DayChip = { label: string; cls: string }

  function getDayChips(dateStr: string): DayChip[] {
    const chips: DayChip[] = []
    const dayFixtures = fixturesByDate.get(dateStr) ?? []
    const dayEvents   = dayEventsMap.get(dateStr) ?? []

    // --- Fixtures / round ---
    if (dayFixtures.length > 0) {
      const roundNum = dayFixtures[0].roundIdx + 1
      const userFix  = dayFixtures.find(
        (f) => f.fixture.homeClubId === playerClubId || f.fixture.awayClubId === playerClubId,
      )
      if (userFix) {
        const isHome = userFix.fixture.homeClubId === playerClubId
        const oppId  = isHome ? userFix.fixture.awayClubId : userFix.fixture.homeClubId
        const opp    = clubs[oppId]?.abbreviation ?? '???'
        chips.push({ label: `R${roundNum} vs ${opp} (${isHome ? 'H' : 'A'})`, cls: 'bg-primary/90 text-primary-foreground font-semibold' })
        const others = dayFixtures.length - 1
        if (others > 0) {
          chips.push({ label: `+${others} other games`, cls: 'bg-muted/60 text-muted-foreground' })
        }
      } else {
        chips.push({ label: `Round ${roundNum}`, cls: 'bg-blue-500/20 text-blue-300' })
        chips.push({ label: `${dayFixtures.length} games`, cls: 'bg-muted/50 text-muted-foreground' })
      }
    }

    // --- Non-match calendar events ---
    for (const evt of dayEvents) {
      if (evt.type === 'match') continue
      if (evt.type === 'training') continue // handled below
      const cls = EVENT_CHIP_CLS[evt.type]
      // Use a short label for the cell
      const label =
        evt.type === 'bye'              ? 'Bye Week' :
        evt.type === 'special-event'    ? (evt.title.length > 20 ? evt.title.slice(0, 18) + '…' : evt.title) :
        evt.type === 'milestone'        ? (evt.title.length > 20 ? evt.title.slice(0, 18) + '…' : evt.title) :
        EVENT_LABELS[evt.type]
      chips.push({ label, cls })
    }

    // --- Training: prefer plan sessions, fall back to Tue/Thu during the season ---
    const sessions = planSessionMap.get(dateStr)
    if (sessions && sessions.length > 0) {
      const focus = sessions[0].focus
      chips.push({ label: TRAINING_FOCUS_LABELS[focus], cls: EVENT_CHIP_CLS.training })
    } else if (chips.length === 0 && seasonStartDate && season) {
      // Show generic training on Tue (2) and Thu (4) within the regular season
      const dow = new Date(dateStr + 'T00:00:00').getDay()
      const isTuOrThu = dow === 2 || dow === 4
      const seasonEndDate = addDays(seasonStartDate, (season.rounds.length + 2) * 7)
      const inSeason = dateStr >= seasonStartDate && dateStr <= seasonEndDate
      if (isTuOrThu && inSeason) {
        chips.push({ label: 'Training', cls: EVENT_CHIP_CLS.training })
      }
    }

    return chips
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
                scheduledTime={fixture.scheduledTime}
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
            <div className="grid grid-cols-7 border-l border-t">
              {calendarGrid.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="min-h-[88px] border-r border-b bg-muted/10" />
                }

                const dateStr    = makeDateStr(day)
                const isToday    = day === currentDay
                const isSelected = dateStr === selectedDate
                const isPast     = dateStr < currentDate
                const chips      = getDayChips(dateStr)
                const visible    = chips.slice(0, 3)
                const overflow   = chips.length - 3

                return (
                  <button
                    key={day}
                    className={`min-h-[88px] border-r border-b px-1.5 pt-1.5 pb-1 text-left transition-colors hover:bg-accent/40 flex flex-col gap-1 ${
                      isSelected ? 'bg-accent/60' : ''
                    } ${isPast ? 'opacity-55' : ''}`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    {/* Day number */}
                    <span
                      className={`text-xs font-medium leading-none self-start ${
                        isToday
                          ? 'bg-primary text-primary-foreground rounded-full px-1.5 py-1'
                          : 'text-foreground'
                      }`}
                    >
                      {day}
                    </span>

                    {/* Event chips */}
                    <div className="flex flex-col gap-0.5 w-full">
                      {visible.map((chip, ci) => (
                        <span
                          key={ci}
                          className={`rounded px-1 py-0.5 text-[9px] leading-tight truncate block ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="text-[9px] text-muted-foreground pl-0.5">
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
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
              <CardContent className="space-y-3">
                {/* All fixtures on that date (future or past) */}
                {(() => {
                  const dayFix = [...(fixturesByDate.get(selectedDate) ?? [])].sort(
                    (a, b) => parseScheduledTime(a.fixture.scheduledTime) - parseScheduledTime(b.fixture.scheduledTime),
                  )
                  if (dayFix.length === 0) return null
                  const isPast = selectedDate < currentDate
                  return (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {isPast ? 'Matches Played' : `Round ${dayFix[0].roundIdx + 1} Fixtures`}
                      </p>
                      {isPast ? (
                        selectedDatePastFixtures.map(({ fixture, roundIdx, idx, matchId }) => (
                          <FixtureCard
                            key={matchId}
                            homeClubId={fixture.homeClubId}
                            awayClubId={fixture.awayClubId}
                            venue={fixture.venue}
                            scheduledTime={fixture.scheduledTime}
                            isUserMatch={fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId}
                            isPast={true}
                            clubs={clubs}
                            onWatch={() => handleReview(roundIdx, fixture, idx, matchId)}
                            onReview={() => handleReview(roundIdx, fixture, idx, matchId)}
                          />
                        ))
                      ) : (
                        dayFix.map(({ fixture, roundIdx, idx }) => {
                          const isUserMatch = fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId
                          return (
                            <FixtureCard
                              key={`${fixture.homeClubId}-${fixture.awayClubId}`}
                              homeClubId={fixture.homeClubId}
                              awayClubId={fixture.awayClubId}
                              venue={fixture.venue}
                              scheduledTime={fixture.scheduledTime}
                              isUserMatch={isUserMatch}
                              isPast={false}
                              clubs={clubs}
                              onWatch={() => handleWatch(roundIdx, fixture, idx)}
                              onQuickSim={isUserMatch ? handleQuickSim : undefined}
                            />
                          )
                        })
                      )}
                    </div>
                  )
                })()}

                {/* Non-match calendar events */}
                {selectedEvents.filter((e) => e.type !== 'match').length > 0 && (
                  <div className="space-y-2">
                    {selectedEvents.filter((e) => e.type !== 'match').map((evt) => {
                      const link = !evt.resolved ? eventNavLink(evt.type) : null
                      return (
                        <div key={evt.id} className="flex items-start gap-2">
                          <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${EVENT_COLORS[evt.type]}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{evt.title}</p>
                            {evt.description && (
                              <p className="text-xs text-muted-foreground">{evt.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant={evt.resolved ? 'secondary' : 'outline'} className="text-[10px]">
                                {evt.resolved ? 'Completed' : 'Upcoming'}
                              </Badge>
                              {link && (
                                <Link
                                  to={link}
                                  className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
                                >
                                  Go <ExternalLink className="h-2.5 w-2.5" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Empty state */}
                {(fixturesByDate.get(selectedDate) ?? []).length === 0 &&
                  selectedEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">No events on this day.</p>
                )}
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
                    const link = eventNavLink(evt.type)
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
