import { addDays } from '@/engine/calendar/calendarEngine'
import type { MatchDay } from '@/types/season'

/** Days offset from the round's Monday anchor for each match-day slot. */
export function getMatchDayOffset(day?: MatchDay): number {
  switch (day) {
    case 'Thursday':
      return 3
    case 'Friday':
      return 4
    case 'Saturday-Early':
    case 'Saturday-Twilight':
    case 'Saturday-Night':
      return 5
    case 'Sunday-Early':
    case 'Sunday-Twilight':
      return 6
    case 'Monday':
      return 7
    default:
      return 5
  }
}

/** Find the first Monday on or after the season start date. */
export function toRoundWeekMonday(seasonStartDate: string): string {
  const d = new Date(`${seasonStartDate}T00:00:00`)
  const day = d.getDay() // 0 Sun, 1 Mon
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7
  d.setDate(d.getDate() + daysUntilMonday)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Compute the ISO date for a fixture given seasonStartDate, round index, and match day. */
export function getFixtureDateIso(seasonStartDate: string, roundIdx: number, matchDay?: MatchDay): string {
  const mondayAnchor = toRoundWeekMonday(seasonStartDate)
  const roundBaseDate = addDays(mondayAnchor, roundIdx * 7)
  return addDays(roundBaseDate, getMatchDayOffset(matchDay))
}
