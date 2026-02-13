import type { GameEvent, GameCalendar, GameEventType } from '@/types/calendar'
import type { Season } from '@/types/season'
import type { FinalsSettings } from '@/types/game'
import { getFinalsFormatById } from '@/engine/season/finalsFormats'

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
export function buildSeasonCalendar(
  year: number,
  season: Season,
  playerClubId: string,
  finalsSettings?: FinalsSettings,
  seasonStartDate?: string,
  gameStartDate?: string,
): GameCalendar {
  eventCounter = 0
  const events: GameEvent[] = []

  // Season start date: use provided or default to mid-March
  const seasonStart = seasonStartDate ?? `${year}-03-20`

  // ---- Regular season rounds ----
  for (let i = 0; i < season.rounds.length; i++) {
    const round = season.rounds[i]
    const roundDate = addDays(seasonStart, i * 7)

    // Check if the user's club is on bye this round
    const userOnBye = (round.byeClubIds ?? []).includes(playerClubId)

    if (userOnBye) {
      events.push(
        createEvent(
          roundDate,
          'bye',
          `Round ${i + 1} — BYE`,
          'Your club has a bye this round',
          { roundIndex: i },
        ),
      )
    } else {
      events.push(
        createEvent(
          roundDate,
          'match',
          `Round ${i + 1}`,
          `Regular season Round ${i + 1}`,
          { roundIndex: i },
        ),
      )
    }

    // Training sessions between matches (Tue, Thu)
    if (i < season.rounds.length - 1) {
      const tue = addDays(roundDate, 3)
      const thu = addDays(roundDate, 5)
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
  // Use gameStartDate as offseason anchor if provided (initial season),
  // otherwise derive from the season dates (subsequent seasons).
  const offseasonStart = gameStartDate ?? addDays(finalsStart, finalsWeeks * 7 + 7)

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

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date))

  return {
    events,
    currentDate: seasonStart,
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get next unresolved event. */
export function getNextEvent(calendar: GameCalendar): GameEvent | null {
  return calendar.events.find((e) => !e.resolved) ?? null
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

/** Get upcoming events (next N unresolved). */
export function getUpcomingEvents(calendar: GameCalendar, count: number = 5): GameEvent[] {
  return calendar.events.filter((e) => !e.resolved).slice(0, count)
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
