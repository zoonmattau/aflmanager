import type { SeededRNG } from '@/engine/core/rng'
import type { Club } from '@/types/club'
import type { LadderEntry, Season } from '@/types/season'
import type { Match } from '@/types/match'
import type {
  ClubVenueConfig,
  SoldHomeGame,
  VenueAssignment,
  VenueNegotiationOffer,
} from '@/types/venue'
import {
  VENUES,
  CLUB_DEFAULT_VENUES,
  VENUE_NAME_TO_ID,
  SHARED_VENUE_OVERFLOW,
  STATE_DISTANCE,
  SOLD_GAME_VENUES,
} from '@/data/venues'

// ---------------------------------------------------------------------------
// resolveVenueId — backward compat bridge
// ---------------------------------------------------------------------------

export function resolveVenueId(venueName: string): string | null {
  return VENUE_NAME_TO_ID[venueName] ?? null
}

// ---------------------------------------------------------------------------
// generateDefaultAllocations
// ---------------------------------------------------------------------------

export function generateDefaultAllocations(
  clubIds: string[],
  clubs: Record<string, Club>,
  rng: SeededRNG,
): Record<string, ClubVenueConfig> {
  const allocations: Record<string, ClubVenueConfig> = {}

  // Group clubs by primary venue to handle shared venues
  const venueGroups: Record<string, string[]> = {}
  for (const clubId of clubIds) {
    const defaults = CLUB_DEFAULT_VENUES[clubId]
    if (!defaults) continue
    const primary = defaults.primary
    if (!venueGroups[primary]) venueGroups[primary] = []
    venueGroups[primary].push(clubId)
  }

  // Total home games per club (for 23-round, 18-team season = ~11 home games)
  const homeGamesPerClub = 11

  for (const clubId of clubIds) {
    const defaults = CLUB_DEFAULT_VENUES[clubId]
    if (!defaults) {
      // Fictional/custom club — give them all home games at a generic venue
      allocations[clubId] = {
        primaryVenueId: 'marvel-stadium',
        secondaryVenueId: null,
        homeGamesAtPrimary: homeGamesPerClub,
        homeGamesAtSecondary: 0,
        soldHomeGames: [],
      }
      continue
    }

    const primary = defaults.primary
    const secondary = defaults.secondary ?? null
    const tenants = venueGroups[primary] ?? [clubId]
    const numTenants = tenants.length
    const club = clubs[clubId]
    const isLarge = club?.tier === 'large'

    let atPrimary: number
    let atSecondary: number

    if (numTenants === 1) {
      // Sole tenant — all home games at primary (minus secondary)
      atSecondary = secondary ? 2 : 0
      atPrimary = homeGamesPerClub - atSecondary
    } else if (numTenants === 2) {
      // 2 tenants (Adelaide Oval, Optus Stadium) — split roughly even
      atSecondary = secondary ? 2 : 0
      atPrimary = Math.min(homeGamesPerClub - atSecondary, 9 + (isLarge ? 1 : 0))
      // If total exceeds homeGamesPerClub, reduce secondary
      if (atPrimary + atSecondary > homeGamesPerClub) {
        atSecondary = homeGamesPerClub - atPrimary
      }
    } else {
      // 4+ tenants (MCG: 4, Marvel: 5) — limited primary slots
      const totalSlots = Math.min(20, homeGamesPerClub * numTenants)
      const basePerClub = Math.floor(totalSlots / numTenants)
      const bonus = isLarge ? 1 : 0
      atSecondary = secondary ? 2 : 0
      atPrimary = Math.min(basePerClub + bonus, homeGamesPerClub - atSecondary)

      // Add slight randomness
      if (rng.chance(0.3) && atPrimary > 3) {
        atPrimary -= 1
      }
    }

    // Remaining games go to overflow venue
    const remaining = homeGamesPerClub - atPrimary - atSecondary
    if (remaining > 0) {
      // These will be assigned to overflow venues during fixture application
      atPrimary += remaining // For now, mark as primary — overflow handled later
    }

    allocations[clubId] = {
      primaryVenueId: primary,
      secondaryVenueId: secondary,
      homeGamesAtPrimary: atPrimary,
      homeGamesAtSecondary: atSecondary,
      soldHomeGames: [],
    }
  }

  return allocations
}

// ---------------------------------------------------------------------------
// generateSoldGameOffers
// ---------------------------------------------------------------------------

export function generateSoldGameOffers(
  club: Club,
  rng: SeededRNG,
): VenueNegotiationOffer[] {
  const roll = rng.next()
  const numOffers = roll < 0.65 ? 0 : roll < 0.92 ? 1 : 2
  const offers: VenueNegotiationOffer[] = []

  const availableVenues = rng.shuffle([...SOLD_GAME_VENUES])

  for (let i = 0; i < numOffers && i < availableVenues.length; i++) {
    const venueId = availableVenues[i]
    const venue = VENUES[venueId]
    if (!venue) continue

    // Payment scales by club tier
    let minPay: number
    let maxPay: number
    switch (club.tier) {
      case 'large':
        minPay = 300_000; maxPay = 500_000; break
      case 'medium':
        minPay = 200_000; maxPay = 400_000; break
      default:
        minPay = 150_000; maxPay = 300_000; break
    }
    const payment = rng.nextInt(Math.round(minPay / 1000), Math.round(maxPay / 1000)) * 1000

    // Fan penalty: -5 to -15, higher for more remote venues
    const basePenalty = venue.isNeutral ? -10 : -5
    const remotePenalty = venue.capacity < 15000 ? -5 : 0
    const fanPenalty = basePenalty + remotePenalty + rng.nextInt(-2, 2)

    offers.push({
      id: `venue-offer-${i}-${venueId}`,
      venueId,
      venueName: venue.name,
      payment,
      fanPenalty: Math.max(-15, Math.min(-5, fanPenalty)),
      description: `The AFL is offering $${(payment / 1000).toFixed(0)}k for ${club.name} to play a home game at ${venue.name} in ${venue.city}.`,
    })
  }

  return offers
}

// ---------------------------------------------------------------------------
// applyVenueAllocationsToFixture
// ---------------------------------------------------------------------------

export function applyVenueAllocationsToFixture(
  season: Season,
  allocations: Record<string, ClubVenueConfig>,
  rng: SeededRNG,
): VenueAssignment[] {
  const assignments: VenueAssignment[] = []

  // Track remaining primary/secondary allocations per club
  const remaining: Record<string, { primary: number; secondary: number; sold: SoldHomeGame[] }> = {}
  for (const [clubId, config] of Object.entries(allocations)) {
    remaining[clubId] = {
      primary: config.homeGamesAtPrimary,
      secondary: config.homeGamesAtSecondary,
      sold: [...config.soldHomeGames].slice(0, 2),
    }
  }

  const regularRounds = season.rounds.filter((r) => !r.isFinals)
  const totalRegularRounds = regularRounds.length
  const soldWindowStart = Math.max(5, Math.floor(totalRegularRounds * 0.25))
  const soldWindowEnd = Math.max(soldWindowStart, Math.min(totalRegularRounds - 4, Math.ceil(totalRegularRounds * 0.8)))

  // Track per-round venue usage to detect conflicts
  for (const round of season.rounds) {
    if (round.isFinals) continue

    // Collect which venues are used this round
    const roundVenueUsage: Record<string, number> = {}

    for (let fi = 0; fi < round.fixtures.length; fi++) {
      const fixture = round.fixtures[fi]
      const homeClubId = fixture.homeClubId
      const config = allocations[homeClubId]

      // If no allocation config, keep existing venue
      if (!config) {
        const existingVenueId = resolveVenueId(fixture.venue)
        assignments.push({
          roundNumber: round.number,
          fixtureIndex: fi,
          venueId: existingVenueId ?? 'marvel-stadium',
          isHomeGround: true,
          isSecondaryHome: false,
          isSoldGame: false,
          expectedAttendance: 0,
          matchRevenue: 0,
        })
        continue
      }

      // Skip blockbusters — they keep their hardcoded venue
      if (fixture.isBlockbuster) {
        const venueId = resolveVenueId(fixture.venue) ?? config.primaryVenueId
        fixture.venueId = venueId
        assignments.push({
          roundNumber: round.number,
          fixtureIndex: fi,
          venueId,
          isHomeGround: venueId === config.primaryVenueId,
          isSecondaryHome: venueId === config.secondaryVenueId,
          isSoldGame: false,
          expectedAttendance: 0,
          matchRevenue: 0,
        })
        // Count against primary/secondary usage
        if (venueId === config.primaryVenueId && remaining[homeClubId]) {
          remaining[homeClubId].primary = Math.max(0, remaining[homeClubId].primary - 1)
        } else if (venueId === config.secondaryVenueId && remaining[homeClubId]) {
          remaining[homeClubId].secondary = Math.max(0, remaining[homeClubId].secondary - 1)
        }
        roundVenueUsage[venueId] = (roundVenueUsage[venueId] ?? 0) + 1
        continue
      }

      const clubRemaining = remaining[homeClubId]
      let venueId: string
      let isSecondary = false
      let isSold = false
      const inSoldWindow = round.number !== 1 && round.number >= soldWindowStart && round.number <= soldWindowEnd

      if (!clubRemaining) {
        venueId = config.primaryVenueId
      } else if (clubRemaining.sold.length > 0 && inSoldWindow) {
        // Sold games should be rare and mainly mid-season.
        const soldGame = clubRemaining.sold.pop()!
        venueId = soldGame.venueId
        isSold = true
      } else if (clubRemaining.secondary > 0 && config.secondaryVenueId) {
        venueId = config.secondaryVenueId
        clubRemaining.secondary--
        isSecondary = true
      } else if (clubRemaining.primary > 0) {
        venueId = config.primaryVenueId
        clubRemaining.primary--
      } else {
        // Overflow
        venueId = SHARED_VENUE_OVERFLOW[config.primaryVenueId] ?? config.primaryVenueId
      }

      // Check for conflict: if venue already used this round by another home team
      const currentUsage = roundVenueUsage[venueId] ?? 0
      if (currentUsage > 0) {
        if (isSold) {
          // Sold game venue conflicts: try a different neutral venue
          const usedThisRound = new Set(Object.keys(roundVenueUsage).filter((v) => roundVenueUsage[v] > 0))
          const alternate = SOLD_GAME_VENUES.find((v) => !usedThisRound.has(v) && v !== venueId)
          if (alternate) {
            venueId = alternate
          }
        } else {
          // Use overflow venue instead
          const overflow = SHARED_VENUE_OVERFLOW[venueId]
          if (overflow && overflow !== venueId) {
            venueId = overflow
          }
        }
      }

      roundVenueUsage[venueId] = (roundVenueUsage[venueId] ?? 0) + 1

      // Update fixture
      const venue = VENUES[venueId]
      if (venue) {
        fixture.venue = venue.name
        fixture.venueId = venueId
      }

      assignments.push({
        roundNumber: round.number,
        fixtureIndex: fi,
        venueId,
        isHomeGround: venueId === config.primaryVenueId,
        isSecondaryHome: isSecondary,
        isSoldGame: isSold,
        expectedAttendance: 0,
        matchRevenue: 0,
      })
    }
  }

  // Now calculate attendance and revenue for all assignments
  for (const assignment of assignments) {
    const round = season.rounds.find((r) => r.number === assignment.roundNumber)
    if (!round) continue
    const fixture = round.fixtures[assignment.fixtureIndex]
    if (!fixture) continue

    assignment.expectedAttendance = calculateMatchAttendance(
      assignment.venueId,
      fixture.homeClubId,
      fixture.awayClubId,
      rng,
    )
    assignment.matchRevenue = calculateMatchDayRevenue(
      assignment.expectedAttendance,
      assignment.venueId,
    )
  }

  return assignments
}

// ---------------------------------------------------------------------------
// Attendance context & result types
// ---------------------------------------------------------------------------

export interface AttendanceContext {
  venueId: string
  homeClubId: string
  awayClubId: string
  clubs: Record<string, Club>
  ladder: LadderEntry[]
  isFinal: boolean
  finalType?: 'QF' | 'EF' | 'PF' | 'SF' | 'GF'
  isBlockbuster: boolean
  isRivalry: boolean
  homeStarCount: number
  awayStarCount: number
  rng: SeededRNG
}

export interface AttendanceResult {
  attendance: number
  capacityPct: number
  factors: {
    base: number
    clubPopularity: number
    ladderBonus: number
    rivalryBonus: number
    finalsBonus: number
    blockbusterBonus: number
    starPower: number
    randomVariance: number
  }
}

// ---------------------------------------------------------------------------
// calculateMatchAttendanceFull — context-aware attendance calculation
// ---------------------------------------------------------------------------

export function calculateMatchAttendanceFull(ctx: AttendanceContext): AttendanceResult {
  const venue = VENUES[ctx.venueId]
  if (!venue) {
    return {
      attendance: 20000,
      capacityPct: 0,
      factors: { base: 0, clubPopularity: 0, ladderBonus: 0, rivalryBonus: 0, finalsBonus: 0, blockbusterBonus: 0, starPower: 0, randomVariance: 0 },
    }
  }

  // 1. Base fill rate by venue capacity tier
  let base: number
  if (venue.capacity >= 80000) base = 0.80
  else if (venue.capacity >= 50000) base = 0.75
  else if (venue.capacity >= 30000) base = 0.65
  else base = 0.55

  // 2. Club popularity — home weighted 2×
  const homeClub = ctx.clubs[ctx.homeClubId]
  const awayClub = ctx.clubs[ctx.awayClubId]
  const tierValue = (tier: string | undefined): number =>
    tier === 'large' ? 2 : tier === 'medium' ? 1 : 0
  const popScore = (tierValue(homeClub?.tier) * 2 + tierValue(awayClub?.tier)) / 3
  const clubPopularity = popScore >= 1.6 ? 0.12 : popScore >= 1.0 ? 0.08 : popScore >= 0.6 ? 0.04 : 0

  // 3. Ladder position bonus
  let ladderBonus = 0
  for (const clubId of [ctx.homeClubId, ctx.awayClubId]) {
    const rank = ctx.ladder.findIndex((e) => e.clubId === clubId) + 1
    if (rank >= 1 && rank <= 4) ladderBonus += 0.04
    else if (rank >= 5 && rank <= 8) ladderBonus += 0.02
  }
  ladderBonus = Math.min(0.08, ladderBonus)

  // 4. Rivalry bonus
  const rivalryBonus = ctx.isRivalry ? 0.10 : 0

  // 5. Finals bonus
  let finalsBonus = 0
  if (ctx.isFinal) {
    switch (ctx.finalType) {
      case 'GF': finalsBonus = 0.18; break
      case 'PF': finalsBonus = 0.12; break
      case 'SF': finalsBonus = 0.08; break
      case 'QF': case 'EF': finalsBonus = 0.06; break
      default: finalsBonus = 0.06; break
    }
  }

  // 6. Blockbuster bonus
  const blockbusterBonus = ctx.isBlockbuster ? 0.08 : 0

  // 7. Star power — players with overall >= 80
  const totalStars = ctx.homeStarCount + ctx.awayStarCount
  const starPower = Math.min(0.05, totalStars * 0.005)

  // 8. Random variance ±5%
  const randomVariance = ctx.rng.nextFloat(-0.05, 0.05)

  // Combine
  let fillRate = base + clubPopularity + ladderBonus + rivalryBonus + finalsBonus + blockbusterBonus + starPower + randomVariance

  // 9. Clamp 35%–100%
  fillRate = Math.max(0.35, Math.min(1.0, fillRate))

  const rawAttendance = Math.round((venue.capacity * fillRate) / 100) * 100
  const attendance = Math.min(venue.capacity, Math.max(0, rawAttendance))
  const capacityPct = Math.round((attendance / venue.capacity) * 100)

  return {
    attendance,
    capacityPct,
    factors: {
      base,
      clubPopularity,
      ladderBonus,
      rivalryBonus,
      finalsBonus,
      blockbusterBonus,
      starPower,
      randomVariance,
    },
  }
}

// ---------------------------------------------------------------------------
// calculateMatchAttendance — backward-compatible wrapper
// ---------------------------------------------------------------------------

export function calculateMatchAttendance(
  venueId: string,
  _homeClubId: string,
  _awayClubId: string,
  rng: SeededRNG,
): number {
  const result = calculateMatchAttendanceFull({
    venueId,
    homeClubId: _homeClubId,
    awayClubId: _awayClubId,
    clubs: {},
    ladder: [],
    isFinal: false,
    isBlockbuster: false,
    isRivalry: false,
    homeStarCount: 0,
    awayStarCount: 0,
    rng,
  })
  return result.attendance
}

// ---------------------------------------------------------------------------
// calculateMatchDayRevenue
// ---------------------------------------------------------------------------

export function calculateMatchDayRevenue(
  attendance: number,
  venueId: string,
  inflationIndex = 1.0,
): number {
  const venue = VENUES[venueId]
  const multiplier = venue?.revenueMultiplier ?? 1.0
  // $45 (real) per attendee × revenue multiplier × 60% home team share
  return Math.round(attendance * 45 * inflationIndex * multiplier * 0.6)
}

// ---------------------------------------------------------------------------
// getVenueHGA
// ---------------------------------------------------------------------------

export function getVenueHGA(
  venueId: string,
  homeClubId: string,
  awayClubId?: string,
): number {
  const config = CLUB_DEFAULT_VENUES[homeClubId]
  const venue = VENUES[venueId]
  if (!config || !venue) return 2

  let baseHga = 2
  if (venue.isNeutral) {
    baseHga = venue.hgaBonus
  } else if (venueId === config.primary) {
    // Count how many tenants share this venue
    const tenants = Object.values(CLUB_DEFAULT_VENUES).filter(
      (c) => c.primary === venueId,
    ).length
    if (tenants >= 4) baseHga = 3
    else if (tenants >= 2) baseHga = 4
    else baseHga = 5 // sole tenant
  } else if (venueId === config.secondary) {
    baseHga = 2
  } else {
    baseHga = 1 // non-home venue
  }

  if (!awayClubId) {
    return baseHga
  }

  const homeFamiliarity = getVenueFamiliarityScore(homeClubId, venueId)
  const awayFamiliarity = getVenueFamiliarityScore(awayClubId, venueId)
  const familiarityEdge = (homeFamiliarity - awayFamiliarity) * 2.2

  const homeTravel = getTravelFatigue(getClubState(homeClubId), venue.state)
  const awayTravel = getTravelFatigue(getClubState(awayClubId), venue.state)
  const travelEdge = Math.max(0, awayTravel - homeTravel) * 0.45

  const crowdScalar = venue.capacity >= 55_000 ? 1.08 : venue.capacity <= 20_000 ? 0.9 : 1
  const scaled = (baseHga + familiarityEdge + travelEdge) * crowdScalar

  if (venue.isNeutral) {
    return Math.max(0, Math.min(2.5, Math.round(scaled * 10) / 10))
  }
  return Math.max(0.5, Math.min(7, Math.round(scaled * 10) / 10))
}

// ---------------------------------------------------------------------------
// getTravelFatigue
// ---------------------------------------------------------------------------

export function getTravelFatigue(
  clubState: string,
  venueState: string,
): number {
  return STATE_DISTANCE[clubState]?.[venueState] ?? 0
}

export function getVenueFamiliarityScore(clubId: string, venueId: string): number {
  const config = CLUB_DEFAULT_VENUES[clubId]
  const venue = VENUES[venueId]
  if (!config || !venue) return 0
  if (config.primary === venueId) return 1
  if (config.secondary === venueId) return 0.6
  return venue.state === getClubState(clubId) ? 0.3 : 0
}

export function getVenueFamiliarityRatingBonus(clubId: string, venueId: string | undefined): number {
  if (!venueId) return 0
  const familiarity = getVenueFamiliarityScore(clubId, venueId)
  return Math.round(familiarity * 26) / 10 // up to +2.6
}

function getClubTravelFromMatch(match: Match, clubId: string): number {
  const travel = match.result?.simulationContext?.travelFatigue
  if (!travel) return 0
  if (match.homeClubId === clubId) return travel.home
  if (match.awayClubId === clubId) return travel.away
  return 0
}

export function getCompoundingTravelLoad(
  clubId: string,
  baseTravelFatigue: number,
  recentMatches: Match[],
): number {
  const recent = recentMatches
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 4)
    .map((m) => getClubTravelFromMatch(m, clubId))

  if (recent.length === 0) {
    return Math.max(0, Math.round(baseTravelFatigue * 10) / 10)
  }

  const weights = [0.8, 0.55, 0.35, 0.2]
  let weighted = 0
  for (let i = 0; i < recent.length; i++) {
    weighted += recent[i] * (weights[i] ?? 0.15)
  }

  const heavyTripCount = recent.filter((v) => v >= 4).length
  const hadInterstateLastWeek = recent[0] > 0
  const hadLongHaulLastWeek = recent[0] >= 4
  const consecutiveInterstate = baseTravelFatigue > 0 && hadInterstateLastWeek ? 1 : 0
  const backToBackLongHaul = baseTravelFatigue >= 4 && hadLongHaulLastWeek ? 1 : 0

  const compounded =
    baseTravelFatigue +
    weighted * 0.45 +
    heavyTripCount * 0.35 +
    consecutiveInterstate * 0.6 +
    backToBackLongHaul * 0.9

  return Math.max(0, Math.min(10, Math.round(compounded * 10) / 10))
}

// ---------------------------------------------------------------------------
// getClubState — resolve a club's home state from their primary venue
// ---------------------------------------------------------------------------

export function getClubState(clubId: string): string {
  const config = CLUB_DEFAULT_VENUES[clubId]
  if (!config) return 'VIC'
  const venue = VENUES[config.primary]
  return venue?.state ?? 'VIC'
}

// ---------------------------------------------------------------------------
// updateFanSatisfaction
// ---------------------------------------------------------------------------

export function updateFanSatisfaction(current: number, delta: number): number {
  return Math.max(0, Math.min(100, Math.round(current + delta)))
}
