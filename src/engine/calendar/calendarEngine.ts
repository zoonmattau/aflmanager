import type { GameEvent, GameCalendar, GameEventType } from '@/types/calendar'
import type { Season } from '@/types/season'
import type { FinalsSettings } from '@/types/game'
import type { SpecialEventsState } from '@/types/specialEvents'
import type { StateLeagueId, StateLeague, StateLeagueAffiliationSettings } from '@/types/stateLeague'
import { getFinalsFormatById } from '@/engine/season/finalsFormats'
import { getEventDefinition } from '@/engine/specialEvents/eventDefinitions'
import { resolveStateLeagueAffiliation, ensureStateLeagueFixtures } from '@/engine/stateLeague/stateLeagueEngine'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Format a local Date as YYYY-MM-DD without UTC conversion. */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toLocalDateStr(d)
}

export function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatDateLong(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function getMonthName(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  })
}

export function getWeekday(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay() // 0=Sun, 6=Sat
}

export function getYear(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getFullYear()
}

export function getMonth(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getMonth() // 0-based
}

export function getDayOfMonth(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDate()
}

export function getFirstOfMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(1)
  return toLocalDateStr(d)
}

export function getLastOfMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + 1, 0)
  return toLocalDateStr(d)
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return toLocalDateStr(d)
}

// ---------------------------------------------------------------------------
// Game start date helpers
// ---------------------------------------------------------------------------

/** Return the last Saturday in September for a given year (YYYY-MM-DD). */
export function getLastSaturdayOfSeptember(year: number): string {
  const d = new Date(year, 8, 30, 0, 0, 0) // Sept 30 (month is 0-based)
  while (d.getDay() !== 6) {
    d.setDate(d.getDate() - 1)
  }
  return toLocalDateStr(d)
}

/**
 * Compute the default game start date: the day after the Grand Final of the
 * previous season (last Saturday of September in startingYear - 1).
 */
export function computeDefaultGameStartDate(startingYear: number): string {
  return addDays(getLastSaturdayOfSeptember(startingYear - 1), 1)
}

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

let eventCounter = 0

function createEvent(
  date: string,
  type: GameEventType,
  title: string,
  description?: string,
  data?: Record<string, unknown>,
): GameEvent {
  return {
    id: `evt-${++eventCounter}-${date}`,
    date,
    type,
    title,
    description,
    data,
    resolved: false,
  }
}

/**
 * Build a full season calendar with all events mapped to dates.
 * Rounds start in mid-March and run weekly through August.
 * Finals run September. Offseason October-December.
 */
/** Match-day offset from Monday anchor (mirrors fixtureDateUtils to avoid circular import). */
function matchDayOffset(matchDay?: string): number {
  switch (matchDay) {
    case 'Thursday': return 3
    case 'Friday': return 4
    case 'Saturday-Early':
    case 'Saturday-Afternoon':
    case 'Saturday-Twilight':
    case 'Saturday-Night': return 5
    case 'Sunday-Early':
    case 'Sunday-Afternoon':
    case 'Sunday-Twilight': return 6
    case 'Monday': return 7
    default: return 5 // default Saturday
  }
}

/** First Monday on-or-after a date (mirrors fixtureDateUtils to avoid circular import). */
function toMondayAnchor(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = d.getDay() // 0 Sun, 1 Mon
  const daysToMonday = day === 1 ? 0 : (8 - day) % 7
  d.setDate(d.getDate() + daysToMonday)
  return toLocalDateStr(d)
}

export function buildSeasonCalendar(
  year: number,
  season: Season,
  playerClubId: string,
  finalsSettings?: FinalsSettings,
  seasonStartDate?: string,
  _gameStartDate?: string,
  clubs?: Record<string, { abbreviation: string; fullName?: string }>,
): GameCalendar {
  eventCounter = 0
  const events: GameEvent[] = []

  // Season start date: use provided or default to mid-March
  const seasonStart = seasonStartDate ?? `${year}-03-20`

  // Snap to Monday anchor — all round dates are computed from here, matching
  // the getFixtureDateIso formula used by Dashboard and MatchDayPage.
  const mondayAnchor = toMondayAnchor(seasonStart)

  // ---- Regular season rounds ----
  for (let i = 0; i < season.rounds.length; i++) {
    const round = season.rounds[i]

    // Find the user's fixture to get the actual matchDay
    const userFixture = round.fixtures.find(
      (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
    )
    const roundDate = addDays(mondayAnchor, i * 7 + matchDayOffset(userFixture?.matchDay))

    // Check if the user's club is on bye this round
    const userOnBye = (round.byeClubIds ?? []).includes(playerClubId)

    if (userOnBye) {
      // Bye: place on the Monday of the bye week (no match day)
      const byeDate = addDays(mondayAnchor, i * 7)
      events.push(
        createEvent(
          byeDate,
          'bye',
          `Round ${i + 1} — BYE`,
          'Your club has a bye this round',
          { roundIndex: i },
        ),
      )
    } else {
      // Build opponent-aware title
      const opponentId = userFixture
        ? (userFixture.homeClubId === playerClubId ? userFixture.awayClubId : userFixture.homeClubId)
        : null
      const opponentAbbr = opponentId ? (clubs?.[opponentId]?.abbreviation ?? opponentId) : null
      const isHome = userFixture?.homeClubId === playerClubId
      const blockbusterName = userFixture?.blockbusterName
      const matchTitle = opponentAbbr
        ? `Round ${i + 1} vs ${opponentAbbr}`
        : `Round ${i + 1}`
      const matchDesc = blockbusterName
        ? `${blockbusterName} · ${isHome ? 'Home' : 'Away'}`
        : `Round ${i + 1} · ${isHome ? 'Home' : 'Away'}${opponentAbbr ? ` vs ${clubs?.[opponentId!]?.fullName ?? opponentAbbr}` : ''}`
      events.push(
        createEvent(
          roundDate,
          'match',
          matchTitle,
          matchDesc,
          { roundIndex: i, opponentId, isHome },
        ),
      )
    }

    // Training sessions mid-week (Tue and Thu of the following week)
    if (i < season.rounds.length - 1) {
      const nextMonday = addDays(mondayAnchor, (i + 1) * 7)
      const tue = addDays(nextMonday, 1)
      const thu = addDays(nextMonday, 3)
      events.push(
        createEvent(tue, 'training', 'Training Session', 'Mid-week training'),
        createEvent(thu, 'training', 'Training Session', 'Pre-match training'),
      )
    }
  }

  // ---- Finals ----
  const finalsFormat = getFinalsFormatById(finalsSettings?.finalsFormat ?? 'afl-top-8', finalsSettings?.customFinalsFormat)
  const finalsWeeks = finalsFormat.weeks.length
  const finalsStart = addDays(seasonStart, season.rounds.length * 7)
  for (let w = 0; w < finalsWeeks; w++) {
    const weekLabel = finalsFormat.weeks[w]?.label ?? `Finals Week ${w + 1}`
    events.push(
      createEvent(
        addDays(finalsStart, w * 7),
        'match',
        `Finals Week ${w + 1}: ${weekLabel}`,
        weekLabel,
        { finalsWeek: w + 1 },
      ),
    )
  }

  // ---- Offseason events ----
  // Always anchor offseason events to the end of this season's finals.
  const offseasonStart = addDays(finalsStart, finalsWeeks * 7 + 7)

  events.push(
    createEvent(
      addDays(offseasonStart, 0),
      'milestone',
      'Season Awards Night',
      'Brownlow Medal, Coleman Medal, and All-Australian announcements',
    ),
    createEvent(
      addDays(offseasonStart, 14),
      'trade-deadline',
      'Trade Period Opens',
      'Clubs can trade players and draft picks',
    ),
    createEvent(
      addDays(offseasonStart, 28),
      'trade-deadline',
      'Trade Period Closes',
      'Final day for trades',
    ),
    createEvent(
      addDays(offseasonStart, 35),
      'contract-deadline',
      'Free Agency Period',
      'Restricted and unrestricted free agents can negotiate',
    ),
    createEvent(
      addDays(offseasonStart, 49),
      'draft',
      'National Draft',
      'Annual player draft',
    ),
    createEvent(
      addDays(offseasonStart, 56),
      'milestone',
      'Pre-Season Begins',
      'Clubs return for pre-season training',
    ),
  )

  // ---- Jumper management deadline ----
  // Placed the day before the user's Round 1 event (match or bye).
  if (season.rounds.length > 0) {
    const round0 = season.rounds[0]
    const userOnBye = (round0.byeClubIds ?? []).includes(playerClubId)
    const userFixture0 = round0.fixtures.find(
      (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
    )
    const round1EventDate = userOnBye
      ? addDays(mondayAnchor, 0) // Monday of bye week
      : addDays(mondayAnchor, matchDayOffset(userFixture0?.matchDay))
    events.push(
      createEvent(
        addDays(round1EventDate, -1),
        'jumper-management',
        'Confirm Jumper Numbers',
        'Set squad jumper numbers before the season opener',
      ),
    )
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date))

  return {
    events,
    currentDate: seasonStart,
  }
}

// ---------------------------------------------------------------------------
// Special event injection
// ---------------------------------------------------------------------------

/**
 * Inject special event instances into an existing calendar.
 * Each scheduled event becomes a 'special-event' GameEvent.
 */
export function injectSpecialEvents(
  calendar: GameCalendar,
  specialEvents: SpecialEventsState,
): void {
  // Build a set of existing special-event IDs to avoid duplicates if called
  // multiple times on the same calendar (e.g. after save/load).
  const existingIds = new Set(calendar.events.map((e) => e.id))

  for (const instance of specialEvents.events) {
    if (instance.status === 'cancelled') continue
    const eventId = `evt-spe-${instance.id}`
    if (existingIds.has(eventId)) continue

    const def = getEventDefinition(instance.eventId)
    const eventName = def?.name ?? instance.eventId
    const seriesLabel =
      instance.seriesTotal > 1
        ? ` (Match ${instance.matchNumber} of ${instance.seriesTotal})`
        : ''

    calendar.events.push({
      id: eventId,
      date: instance.scheduledDate,
      type: 'special-event',
      title: `${instance.teamA.name} vs ${instance.teamB.name}`,
      description: `${eventName}${seriesLabel}`,
      data: { specialEventId: instance.id, eventType: instance.eventId },
      resolved: instance.status === 'completed',
    })
  }

  // Re-sort by date
  calendar.events.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Reserves event injection
// ---------------------------------------------------------------------------

/**
 * Inject reserves (state league) match events into an existing calendar.
 * Reserves rounds are 1:1 with AFL rounds; each reserves match falls on the
 * Saturday of that round's week.
 */
export function injectReservesEvents(
  calendar: GameCalendar,
  stateLeagues: Record<StateLeagueId, StateLeague> | null,
  playerClubId: string,
  seasonStartDate: string,
  totalRounds: number,
  affiliationSettings?: StateLeagueAffiliationSettings,
): void {
  const affiliation = resolveStateLeagueAffiliation(stateLeagues, playerClubId, affiliationSettings)
  if (!affiliation) return

  const league = ensureStateLeagueFixtures(affiliation.league)
  const mondayAnchor = toMondayAnchor(seasonStartDate)

  // Remove any stale reserves-match events before re-injecting
  calendar.events = calendar.events.filter((e) => e.type !== 'reserves-match')

  for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
    const roundNumber = roundIdx + 1
    const round = league.season.rounds.find((r) => r.number === roundNumber)
    if (!round) continue

    const fixture = round.results.find(
      (m) => m.homeClubId === affiliation.club.id || m.awayClubId === affiliation.club.id,
    )
    if (!fixture) continue // bye round for this club

    const isHome = fixture.homeClubId === affiliation.club.id
    const opponentId = isHome ? fixture.awayClubId : fixture.homeClubId
    const opponent = league.clubs.find((c) => c.id === opponentId)
    const opponentAbbr = opponent?.abbreviation ?? opponentId

    // Reserves matches fall on the Saturday (offset 5) of the round week
    const date = addDays(mondayAnchor, roundIdx * 7 + 5)

    calendar.events.push(
      createEvent(
        date,
        'reserves-match',
        `Res. Rd ${roundNumber} vs ${opponentAbbr}`,
        `${league.name} Round ${roundNumber} · ${isHome ? 'Home' : 'Away'}`,
        { roundNumber, reservesLeagueId: affiliation.leagueId },
      ),
    )
  }

  calendar.events.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get next unresolved event on or after currentDate. */
export function getNextEvent(calendar: GameCalendar): GameEvent | null {
  return calendar.events.find((e) => !e.resolved && e.date >= calendar.currentDate) ?? null
}

/** Get all events for a specific date. */
export function getEventsForDate(calendar: GameCalendar, date: string): GameEvent[] {
  return calendar.events.filter((e) => e.date === date)
}

/** Get events in a date range [startDate, endDate]. */
export function getEventsInRange(
  calendar: GameCalendar,
  startDate: string,
  endDate: string,
): GameEvent[] {
  return calendar.events.filter((e) => e.date >= startDate && e.date <= endDate)
}

/** Get upcoming events (next N unresolved on or after currentDate). */
export function getUpcomingEvents(calendar: GameCalendar, count: number = 5): GameEvent[] {
  return calendar.events.filter((e) => !e.resolved && e.date >= calendar.currentDate).slice(0, count)
}

// ---------------------------------------------------------------------------
// Deadline countdown helpers
// ---------------------------------------------------------------------------

export type DeadlineUrgency = 'urgent' | 'warning' | 'normal'

export interface DeadlineCountdown {
  eventId: string
  type: GameEventType
  title: string
  date: string
  daysUntil: number
  urgency: DeadlineUrgency
  linkTo: string
}

const DEADLINE_EVENT_TYPES = new Set<GameEventType>([
  'contract-deadline', 'trade-deadline', 'draft', 'tribunal', 'jumper-management',
])

const DEADLINE_LINKS: Partial<Record<GameEventType, string>> = {
  'contract-deadline': '/contracts',
  'trade-deadline': '/trade',
  'draft': '/draft',
  'tribunal': '/squad',
  'jumper-management': '/jumper-management',
}

/**
 * Extract upcoming deadline-type events from an event list, annotated with
 * days-until and urgency classification. Accepts a raw event array so callers
 * can pass effectiveEvents (calendar + injected milestone events).
 */
export function getDeadlineCountdowns(
  events: GameEvent[],
  currentDate: string,
  limit = 5,
): DeadlineCountdown[] {
  return events
    .filter((e) => !e.resolved && DEADLINE_EVENT_TYPES.has(e.type) && e.date >= currentDate)
    .slice(0, limit)
    .map((e) => {
      const daysUntil = diffDays(currentDate, e.date)
      return {
        eventId: e.id,
        type: e.type,
        title: e.title,
        date: e.date,
        daysUntil,
        urgency: daysUntil <= 2 ? 'urgent' : daysUntil <= 7 ? 'warning' : 'normal',
        linkTo: DEADLINE_LINKS[e.type] ?? '/',
      }
    })
}

/** Mark all events up to and including a date as resolved. */
export function resolveEventsUpTo(calendar: GameCalendar, date: string): GameEvent[] {
  const resolved: GameEvent[] = []
  for (const event of calendar.events) {
    if (event.resolved) continue
    if (event.date <= date) {
      event.resolved = true
      resolved.push(event)
    }
  }
  calendar.currentDate = date
  return resolved
}

/** Get all unique dates with events in a given month (for calendar dots). */
export function getEventDatesInMonth(
  calendar: GameCalendar,
  year: number,
  month: number, // 0-based
): Map<number, GameEventType[]> {
  const result = new Map<number, GameEventType[]>()
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`

  for (const event of calendar.events) {
    if (event.date.startsWith(prefix)) {
      const day = getDayOfMonth(event.date)
      const types = result.get(day) ?? []
      if (!types.includes(event.type)) types.push(event.type)
      result.set(day, types)
    }
  }

  return result
}
