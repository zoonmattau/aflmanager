import type { Player } from '@/types/player'
import type {
  SpecialEventsSettings,
  SpecialEventsState,
  SpecialEventInstance,
  OriginConfig,
} from '@/types/specialEvents'
import type { SeededRNG } from '@/engine/core/rng'
import { SPECIAL_EVENT_DEFINITIONS } from './eventDefinitions'
import { selectEventTeams, generateOriginFixtures } from './teamComposition'
import { addDays } from '@/engine/calendar/calendarEngine'

// Day offsets from a Saturday-based round start
const MATCH_DAY_OFFSETS: Record<string, number> = {
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
}

/**
 * Schedule all enabled special events for a season.
 */
export function scheduleSpecialEvents(
  settings: SpecialEventsSettings,
  year: number,
  seasonStartDate: string,
  totalRounds: number,
  players: Record<string, Player>,
  rng: SeededRNG,
  byeRounds?: number[],
): SpecialEventsState {
  const events: SpecialEventInstance[] = []

  if (!settings.enabled) {
    return { events, seriesResults: {}, originStandings: [] }
  }

  // Track offsets so events don't collide
  let preseasonOffset = 0
  let midSeasonSlot = 0
  let postSeasonOffset = 0

  // Available bye rounds for mid-season placement
  const availableByes = byeRounds && byeRounds.length > 0
    ? [...byeRounds]
    : [Math.floor(totalRounds / 3), Math.floor(totalRounds * 2 / 3)]

  const originConfig = settings.originConfig

  for (const def of SPECIAL_EVENT_DEFINITIONS) {
    if (!settings.events[def.id]) continue

    // For State of Origin, use the config-driven approach
    if (def.id === 'state-of-origin') {
      const originEvents = scheduleOriginEvents(
        originConfig,
        settings,
        year,
        seasonStartDate,
        totalRounds,
        players,
        rng,
        availableByes,
      )
      events.push(...originEvents)
      continue
    }

    for (let m = 0; m < def.matchCount; m++) {
      let scheduledDate: string

      switch (def.timing) {
        case 'preseason': {
          const daysBefore = 14 + preseasonOffset * 7
          scheduledDate = addDays(seasonStartDate, -daysBefore)
          preseasonOffset++
          break
        }
        case 'mid-season': {
          const byeIdx = midSeasonSlot % availableByes.length
          const roundNum = availableByes[byeIdx]!
          scheduledDate = addDays(seasonStartDate, roundNum * 7 + 3)
          midSeasonSlot++
          break
        }
        case 'post-season': {
          const finalsEndOffset = totalRounds * 7 + 35
          scheduledDate = addDays(seasonStartDate, finalsEndOffset + postSeasonOffset * 7)
          postSeasonOffset++
          break
        }
      }

      const venue = def.defaultVenues[m % def.defaultVenues.length]!
      const { teamA, teamB } = selectEventTeams(def, players, rng, m, settings.originEligibility)

      events.push({
        id: `spe-${def.id}-${year}-${m + 1}`,
        eventId: def.id,
        year,
        scheduledDate,
        venue,
        teamA,
        teamB,
        result: null,
        status: 'scheduled',
        matchNumber: m + 1,
        seriesTotal: def.matchCount,
      })
    }
  }

  // Sort by date
  events.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  return { events, seriesResults: {}, originStandings: [] }
}

// ---------------------------------------------------------------------------
// Origin-specific scheduling
// ---------------------------------------------------------------------------

const ORIGIN_VENUES = ['MCG', 'Adelaide Oval', 'Optus Stadium', 'Gabba', 'SCG', 'Blundstone Arena', 'TIO Stadium']

function scheduleOriginEvents(
  config: OriginConfig,
  settings: SpecialEventsSettings,
  year: number,
  seasonStartDate: string,
  totalRounds: number,
  players: Record<string, Player>,
  rng: SeededRNG,
  availableByes: number[],
): SpecialEventInstance[] {
  const fixtures = generateOriginFixtures(config, year)
  if (fixtures.length === 0) return []

  const events: SpecialEventInstance[] = []
  const originDef = SPECIAL_EVENT_DEFINITIONS.find((d) => d.id === 'state-of-origin')!

  // Schedule each fixture match
  for (let m = 0; m < fixtures.length; m++) {
    const scheduledDate = getOriginMatchDate(config, m, seasonStartDate, totalRounds, availableByes)
    const venue = ORIGIN_VENUES[m % ORIGIN_VENUES.length]!
    const { teamA, teamB } = selectEventTeams(
      originDef, players, rng, m, settings.originEligibility, config, fixtures,
    )

    events.push({
      id: `spe-state-of-origin-${year}-${m + 1}`,
      eventId: 'state-of-origin',
      year,
      scheduledDate,
      venue,
      teamA,
      teamB,
      result: null,
      status: 'scheduled',
      matchNumber: m + 1,
      seriesTotal: fixtures.length + (config.includeShowdownFinal ? 1 : 0),
    })
  }

  // Showdown Final (extra match)
  if (config.includeShowdownFinal) {
    const showdownDate = getShowdownFinalDate(config, seasonStartDate, totalRounds)
    // Teams TBD — will be top 2 from standings. Use placeholder "TBD" teams.
    // The store will re-select teams before simming if standings are available.
    const { teamA, teamB } = selectEventTeams(
      originDef, players, rng, 0, settings.originEligibility, config, fixtures,
    )

    events.push({
      id: `spe-state-of-origin-${year}-showdown`,
      eventId: 'state-of-origin',
      year,
      scheduledDate: showdownDate,
      venue: config.showdownFinalVenue,
      teamA,
      teamB,
      result: null,
      status: 'scheduled',
      matchNumber: fixtures.length + 1,
      seriesTotal: fixtures.length + 1,
    })
  }

  return events
}

function getOriginMatchDate(
  config: OriginConfig,
  matchIndex: number,
  seasonStartDate: string,
  totalRounds: number,
  availableByes: number[],
): string {
  const dayOffset = MATCH_DAY_OFFSETS[config.matchDay] ?? 3

  switch (config.scheduleMode) {
    case 'mid-season-block': {
      // Cluster during bye rounds
      const byeIdx = matchIndex % availableByes.length
      const roundNum = availableByes[byeIdx]!
      return addDays(seasonStartDate, roundNum * 7 + dayOffset)
    }
    case 'weeknight-spread': {
      // Space evenly across the season
      const totalWeeks = totalRounds
      const spacing = Math.max(1, Math.floor(totalWeeks / (config.matchCount + 1)))
      const week = spacing * (matchIndex + 1)
      return addDays(seasonStartDate, week * 7 + dayOffset)
    }
    case 'pre-finals': {
      // Place in the week before finals start, spaced daily
      const finalsStartDay = totalRounds * 7
      return addDays(seasonStartDate, finalsStartDay - 3 + matchIndex)
    }
    case 'post-season': {
      // After finals end, weekly spacing
      const finalsEndOffset = totalRounds * 7 + 35
      return addDays(seasonStartDate, finalsEndOffset + matchIndex * 7)
    }
  }
}

function getShowdownFinalDate(
  config: OriginConfig,
  seasonStartDate: string,
  totalRounds: number,
): string {
  const finalsStartDay = totalRounds * 7

  if (config.showdownFinalTiming === 'before-gf') {
    // 2 days before Grand Final (finals start + ~28 days for 4-week finals)
    return addDays(seasonStartDate, finalsStartDay + 26)
  }
  // after-gf: 7 days after Grand Final
  return addDays(seasonStartDate, finalsStartDay + 35)
}
