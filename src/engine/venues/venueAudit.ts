import type { Season } from '@/types/season'
import type { SeasonVenueState } from '@/types/venue'
import type { Venue } from '@/types/venue'
import type { Club } from '@/types/club'

export interface AuditViolation {
  type: 'over-quota' | 'wrong-venue' | 'missing-allocation'
  severity: 'critical' | 'warning'
  message: string
  roundIndex?: number
  fixtureIndex?: number
}

export interface ClubVenueAudit {
  clubId: string
  primaryVenueId: string
  secondaryVenueId: string | null
  quotaPrimary: number
  quotaSecondary: number
  quotaSold: number
  actualByVenueId: Record<string, number>
  violations: AuditViolation[]
}

export interface RoundConflict {
  roundIndex: number
  venueId: string
  venueName: string
  clubIds: string[]
  fixtureIndices: number[]
  description: string
}

export interface VenueAuditReport {
  clubAudits: ClubVenueAudit[]
  roundConflicts: RoundConflict[]
  totalViolations: number
  criticalCount: number
}

export function computeVenueAudit(
  season: Season,
  venueState: SeasonVenueState,
  clubs: Record<string, Club>,
  venues: Record<string, Venue>,
): VenueAuditReport {
  const { allocations } = venueState
  const clubAudits = new Map<string, ClubVenueAudit>()

  // Initialize audit entries for all clubs
  for (const clubId of Object.keys(clubs)) {
    const config = allocations[clubId]
    if (!config) {
      clubAudits.set(clubId, {
        clubId,
        primaryVenueId: '',
        secondaryVenueId: null,
        quotaPrimary: 0,
        quotaSecondary: 0,
        quotaSold: 0,
        actualByVenueId: {},
        violations: [
          {
            type: 'missing-allocation',
            severity: 'critical',
            message: `No venue allocation found for ${clubs[clubId]?.fullName ?? clubId}`,
          },
        ],
      })
    } else {
      clubAudits.set(clubId, {
        clubId,
        primaryVenueId: config.primaryVenueId,
        secondaryVenueId: config.secondaryVenueId,
        quotaPrimary: config.homeGamesAtPrimary,
        quotaSecondary: config.homeGamesAtSecondary,
        quotaSold: config.soldHomeGames.length,
        actualByVenueId: {},
        violations: [],
      })
    }
  }

  const roundConflicts: RoundConflict[] = []

  // Walk regular season rounds
  for (let roundIndex = 0; roundIndex < season.rounds.length; roundIndex++) {
    const round = season.rounds[roundIndex]
    if (round.isFinals) continue

    // Track venue -> home clubs in this round
    const roundVenueUsage = new Map<string, { clubIds: string[]; fixtureIndices: number[] }>()

    for (let fi = 0; fi < round.fixtures.length; fi++) {
      const fixture = round.fixtures[fi]
      const homeClubId = fixture.homeClubId
      const venueId = fixture.venueId ?? null
      if (!venueId) continue

      // Accumulate actual venue usage per home club
      const audit = clubAudits.get(homeClubId)
      if (audit) {
        audit.actualByVenueId[venueId] = (audit.actualByVenueId[venueId] ?? 0) + 1
      }

      // Track per-round venue usage for conflict detection
      const existing = roundVenueUsage.get(venueId)
      if (existing) {
        existing.clubIds.push(homeClubId)
        existing.fixtureIndices.push(fi)
      } else {
        roundVenueUsage.set(venueId, { clubIds: [homeClubId], fixtureIndices: [fi] })
      }
    }

    // Detect conflicts: same venue used by 2+ home teams in one round
    for (const [venueId, usage] of roundVenueUsage) {
      if (usage.clubIds.length >= 2) {
        const venue = venues[venueId]
        const clubNames = usage.clubIds.map((id) => clubs[id]?.fullName ?? id)
        roundConflicts.push({
          roundIndex,
          venueId,
          venueName: venue?.name ?? venueId,
          clubIds: usage.clubIds,
          fixtureIndices: usage.fixtureIndices,
          description: `Round ${round.number} · ${venue?.name ?? venueId} — ${clubNames.join(' + ')} both home`,
        })
      }
    }
  }

  // Check per-club quota and wrong-venue violations
  for (const [, audit] of clubAudits) {
    const config = allocations[audit.clubId]
    if (!config) continue // already flagged as missing-allocation

    const allowedVenueIds = new Set<string>([config.primaryVenueId])
    if (config.secondaryVenueId) allowedVenueIds.add(config.secondaryVenueId)
    for (const sold of config.soldHomeGames) {
      allowedVenueIds.add(sold.venueId)
    }

    for (const [venueId, count] of Object.entries(audit.actualByVenueId)) {
      if (!allowedVenueIds.has(venueId)) {
        const venueName = venues[venueId]?.name ?? venueId
        audit.violations.push({
          type: 'wrong-venue',
          severity: 'critical',
          message: `${count} game(s) at ${venueName} — not an approved venue`,
        })
      } else if (venueId === config.primaryVenueId && count > config.homeGamesAtPrimary) {
        const venueName = venues[venueId]?.name ?? venueId
        audit.violations.push({
          type: 'over-quota',
          severity: 'warning',
          message: `${count} games at ${venueName} (primary), quota is ${config.homeGamesAtPrimary}`,
        })
      } else if (venueId === config.secondaryVenueId && count > config.homeGamesAtSecondary) {
        const venueName = venues[venueId]?.name ?? venueId
        audit.violations.push({
          type: 'over-quota',
          severity: 'warning',
          message: `${count} games at ${venueName} (secondary), quota is ${config.homeGamesAtSecondary}`,
        })
      }
    }
  }

  const allAudits = Array.from(clubAudits.values())
  allAudits.sort((a, b) => b.violations.length - a.violations.length)

  let totalViolations = 0
  let criticalCount = 0
  for (const audit of allAudits) {
    totalViolations += audit.violations.length
    criticalCount += audit.violations.filter((v) => v.severity === 'critical').length
  }
  totalViolations += roundConflicts.length

  return {
    clubAudits: allAudits,
    roundConflicts,
    totalViolations,
    criticalCount,
  }
}
