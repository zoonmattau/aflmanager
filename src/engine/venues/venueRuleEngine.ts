/**
 * Venue Rule Engine
 *
 * Defines and enforces real-life-style venue constraints:
 *   1. Per-club secondary venue season quotas (e.g. Hawthorn: max 2 Tasmania games)
 *   2. Matchup-specific venue requirements and prohibitions
 *      (e.g. Melbourne vs Collingwood → MCG required, Marvel forbidden)
 *
 * The default AFL rule set encodes the most important real-world venue obligations.
 * Error-severity violations block fixture saves; warnings are advisory only.
 */

import type { Season } from '@/types/season'
import type { Club } from '@/types/club'
import type {
  SeasonVenueState,
  VenueRuleSet,
  VenueViolation,
  VenueViolationType,
  VenueAuditResult,
} from '@/types/venue'
import { VENUES } from '@/data/venues'

// ── Default AFL venue rule set ─────────────────────────────────────────────────

/**
 * Built-in AFL-style venue constraints.
 *
 * Club quota rules cap how many home games each club can schedule at their
 * secondary (or any named) venue per season, matching real-life AFL obligations.
 *
 * Matchup rules lock specific rivalry games to designated venues or exclude
 * venues that would damage the prestige/tradition of the fixture.
 */
export const DEFAULT_AFL_VENUE_RULES: VenueRuleSet = {
  clubQuotaRules: [
    // Hawthorn: Tasmania deal — max 2 home games at UTAS Stadium per season
    { clubId: 'hawthorn', secondaryVenueMax: 2 },
    // Western Bulldogs: Ballarat deal — max 1 home game at Mars Stadium per season
    { clubId: 'westernbulldogs', secondaryVenueMax: 1 },
    // Port Adelaide: Norwood used only as overflow — cap at 2
    { clubId: 'portadelaide', secondaryVenueMax: 2, additionalVenueMaxByVenueId: { 'norwood-oval': 2 } },
    // Adelaide: same Norwood constraint
    { clubId: 'adelaide', secondaryVenueMax: 2, additionalVenueMaxByVenueId: { 'norwood-oval': 2 } },
    // North Melbourne: Hobart allocation capped at 2 if ever assigned
    { clubId: 'northmelbourne', secondaryVenueMax: 2, additionalVenueMaxByVenueId: { 'blundstone-arena': 2 } },
    // GWS: Canberra (Manuka) capped at 2 if assigned as secondary
    { clubId: 'gws', secondaryVenueMax: 2, additionalVenueMaxByVenueId: { 'manuka-oval': 2 } },
  ],

  matchupRules: [
    // ── MCG Derbies ─────────────────────────────────────────────────────────
    // Melbourne's home games against other MCG clubs must stay at the MCG.
    // Overflow to Marvel for these fixtures is not permitted.
    {
      homeClubId: 'melbourne',
      awayClubId: 'collingwood',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Melbourne vs Collingwood must be played at the MCG',
      overridable: true,
    },
    {
      homeClubId: 'melbourne',
      awayClubId: 'richmond',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Melbourne vs Richmond must be played at the MCG',
      overridable: true,
    },
    {
      homeClubId: 'melbourne',
      awayClubId: 'hawthorn',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Melbourne vs Hawthorn must be played at the MCG',
      overridable: true,
    },
    {
      homeClubId: 'richmond',
      awayClubId: 'collingwood',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Richmond vs Collingwood must be played at the MCG',
      overridable: true,
    },
    {
      homeClubId: 'richmond',
      awayClubId: 'melbourne',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Richmond vs Melbourne must be played at the MCG',
      overridable: true,
    },
    {
      homeClubId: 'collingwood',
      awayClubId: 'melbourne',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Collingwood vs Melbourne must be played at the MCG',
      overridable: false,
    },
    {
      homeClubId: 'collingwood',
      awayClubId: 'richmond',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Collingwood vs Richmond must be played at the MCG',
      overridable: false,
    },
    {
      homeClubId: 'collingwood',
      awayClubId: 'hawthorn',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Collingwood vs Hawthorn must be played at the MCG',
      overridable: false,
    },
    {
      homeClubId: 'hawthorn',
      awayClubId: 'collingwood',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium', 'utas-stadium'],
      note: 'Hawthorn vs Collingwood must be played at the MCG (not Tasmania)',
      overridable: false,
    },
    {
      homeClubId: 'hawthorn',
      awayClubId: 'richmond',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium', 'utas-stadium'],
      note: 'Hawthorn vs Richmond must be played at the MCG (not Tasmania)',
      overridable: false,
    },
    {
      homeClubId: 'hawthorn',
      awayClubId: 'melbourne',
      requiredVenueId: 'mcg',
      forbiddenVenueIds: ['marvel-stadium', 'utas-stadium'],
      note: 'Hawthorn vs Melbourne must be played at the MCG (not Tasmania)',
      overridable: false,
    },
    // Essendon vs Collingwood: should not be at Marvel (ANZAC-style preservation)
    {
      homeClubId: 'essendon',
      awayClubId: 'collingwood',
      forbiddenVenueIds: ['marvel-stadium'],
      note: 'Essendon vs Collingwood should not be hosted at Marvel Stadium',
      overridable: true,
    },

    // ── WA Derby ────────────────────────────────────────────────────────────
    // The WA Derby cannot be sold or moved from Optus Stadium.
    {
      homeClubId: 'westcoast',
      awayClubId: 'fremantle',
      requiredVenueId: 'optus-stadium',
      forbiddenVenueIds: ['utas-stadium', 'blundstone-arena', 'manuka-oval', 'tio-stadium', 'mars-stadium', 'norwood-oval'],
      note: 'WA Derby must remain at Optus Stadium',
      overridable: false,
    },
    {
      homeClubId: 'fremantle',
      awayClubId: 'westcoast',
      requiredVenueId: 'optus-stadium',
      forbiddenVenueIds: ['utas-stadium', 'blundstone-arena', 'manuka-oval', 'tio-stadium', 'mars-stadium', 'norwood-oval'],
      note: 'WA Derby must remain at Optus Stadium',
      overridable: false,
    },

    // ── SA Showdown ──────────────────────────────────────────────────────────
    // The Showdown must be at Adelaide Oval — never the smaller Norwood Oval.
    {
      homeClubId: 'adelaide',
      awayClubId: 'portadelaide',
      requiredVenueId: 'adelaide-oval',
      forbiddenVenueIds: ['norwood-oval'],
      note: 'SA Showdown must be played at Adelaide Oval',
      overridable: false,
    },
    {
      homeClubId: 'portadelaide',
      awayClubId: 'adelaide',
      requiredVenueId: 'adelaide-oval',
      forbiddenVenueIds: ['norwood-oval'],
      note: 'SA Showdown must be played at Adelaide Oval',
      overridable: false,
    },

    // ── QLD Derby ───────────────────────────────────────────────────────────
    // Brisbane vs Gold Coast at the Gabba when Brisbane is home.
    {
      homeClubId: 'brisbane',
      awayClubId: 'goldcoast',
      requiredVenueId: 'gabba',
      note: 'QLD Derby (Brisbane home) must be played at The Gabba',
      overridable: true,
    },

    // ── Sydney Derby ─────────────────────────────────────────────────────────
    // Sydney vs GWS: both clubs have their own grounds — this is optional / advisory
    {
      homeClubId: 'sydney',
      awayClubId: 'gws',
      requiredVenueId: 'scg',
      forbiddenVenueIds: ['engie-stadium'],
      note: 'Sydney Derby (Sydney home) should be at the SCG',
      overridable: true,
    },
  ],
}

// ── Rule merging ───────────────────────────────────────────────────────────────

/**
 * Merge user-supplied custom rules on top of the default AFL rules.
 *
 * - Custom clubQuotaRules that match an existing clubId replace the default for that club.
 * - Custom matchupRules that match (homeClubId, awayClubId) replace the default pair.
 * - Pass `{ clubQuotaRules: [], matchupRules: [] }` to use completely custom rules with no defaults.
 *
 * Use `overrideDefaults: true` to start from a clean slate (no default rules at all).
 */
export function getEffectiveVenueRules(
  custom?: Partial<VenueRuleSet>,
  overrideDefaults = false,
): VenueRuleSet {
  if (!custom && !overrideDefaults) return DEFAULT_AFL_VENUE_RULES
  if (overrideDefaults) {
    return {
      clubQuotaRules: custom?.clubQuotaRules ?? [],
      matchupRules: custom?.matchupRules ?? [],
    }
  }

  // Merge custom onto defaults
  const effectiveQuota = [...DEFAULT_AFL_VENUE_RULES.clubQuotaRules]
  for (const rule of custom?.clubQuotaRules ?? []) {
    const idx = effectiveQuota.findIndex((r) => r.clubId === rule.clubId)
    if (idx >= 0) effectiveQuota[idx] = rule
    else effectiveQuota.push(rule)
  }

  const effectiveMatchup = [...DEFAULT_AFL_VENUE_RULES.matchupRules]
  for (const rule of custom?.matchupRules ?? []) {
    const idx = effectiveMatchup.findIndex(
      (r) => r.homeClubId === rule.homeClubId && r.awayClubId === rule.awayClubId,
    )
    if (idx >= 0) effectiveMatchup[idx] = rule
    else effectiveMatchup.push(rule)
  }

  return { clubQuotaRules: effectiveQuota, matchupRules: effectiveMatchup }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function makeViolation(
  type: VenueViolationType,
  severity: 'error' | 'warning',
  round: number,
  fixtureIndex: number,
  homeClubId: string,
  awayClubId: string,
  venueId: string,
  message: string,
  extras?: { requiredVenueId?: string; ruleNote?: string },
): VenueViolation {
  return { type, severity, round, fixtureIndex, homeClubId, awayClubId, venueId, message, ...extras }
}

// ── Matchup rule validation ────────────────────────────────────────────────────

/**
 * Check a single fixture's venue assignment against matchup rules only.
 * Quota rules require full-season context — use auditVenueAssignments for those.
 * Returns an array of violations (empty = compliant).
 */
export function validateMatchupVenue(
  homeClubId: string,
  awayClubId: string,
  venueId: string,
  round: number,
  fixtureIndex: number,
  rules: VenueRuleSet,
): VenueViolation[] {
  const violations: VenueViolation[] = []
  const rule = rules.matchupRules.find(
    (r) => r.homeClubId === homeClubId && r.awayClubId === awayClubId,
  )
  if (!rule) return violations

  if (rule.requiredVenueId && venueId !== rule.requiredVenueId) {
    const required = VENUES[rule.requiredVenueId]?.name ?? rule.requiredVenueId
    const actual = VENUES[venueId]?.name ?? venueId
    violations.push(makeViolation(
      'required-venue-missing', 'error',
      round, fixtureIndex, homeClubId, awayClubId, venueId,
      `This fixture must be at ${required} (currently ${actual}). ${rule.note ?? ''}`.trim(),
      { requiredVenueId: rule.requiredVenueId, ruleNote: rule.note },
    ))
  }

  if (rule.forbiddenVenueIds?.includes(venueId)) {
    const name = VENUES[venueId]?.name ?? venueId
    violations.push(makeViolation(
      'forbidden-venue-used', 'error',
      round, fixtureIndex, homeClubId, awayClubId, venueId,
      `This fixture cannot be played at ${name}. ${rule.note ?? ''}`.trim(),
      { ruleNote: rule.note },
    ))
  }

  return violations
}

// ── Full-season audit ──────────────────────────────────────────────────────────

/**
 * Audit all venue assignments in a season against the full rule set.
 * Returns structured results with all violations and per-club venue usage stats.
 */
export function auditVenueAssignments(
  season: Season,
  venueState: SeasonVenueState,
  rules: VenueRuleSet,
  clubs: Record<string, Club>,
): VenueAuditResult {
  const violations: VenueViolation[] = []
  const gamesByVenueByClub: Record<string, Record<string, number>> = {}
  const homeGamesByClub: Record<string, number> = {}

  // Build fast lookup: "roundNumber-fixtureIndex" → venueId
  const assignmentMap = new Map<string, string>()
  for (const a of venueState.assignments) {
    assignmentMap.set(`${a.roundNumber}-${a.fixtureIndex}`, a.venueId)
  }

  // Iterate regular-season fixtures
  for (const round of season.rounds) {
    if (round.isFinals) continue
    for (let fi = 0; fi < round.fixtures.length; fi++) {
      const fixture = round.fixtures[fi]
      const { homeClubId, awayClubId } = fixture
      const venueId =
        assignmentMap.get(`${round.number}-${fi}`) ??
        fixture.venueId ??
        null
      if (!venueId) continue

      // Accumulate stats
      if (!gamesByVenueByClub[homeClubId]) gamesByVenueByClub[homeClubId] = {}
      gamesByVenueByClub[homeClubId][venueId] =
        (gamesByVenueByClub[homeClubId][venueId] ?? 0) + 1
      homeGamesByClub[homeClubId] = (homeGamesByClub[homeClubId] ?? 0) + 1

      // Matchup rule checks
      violations.push(
        ...validateMatchupVenue(homeClubId, awayClubId, venueId, round.number, fi, rules),
      )
    }
  }

  // Quota rule checks (season-level)
  for (const quota of rules.clubQuotaRules) {
    const clubVenueMap = gamesByVenueByClub[quota.clubId] ?? {}
    const config = venueState.allocations[quota.clubId]
    const secondaryVenueId = config?.secondaryVenueId ?? null
    const clubName = clubs[quota.clubId]?.abbreviation ?? quota.clubId

    // Secondary venue quota
    if (quota.secondaryVenueMax !== null && secondaryVenueId) {
      const count = clubVenueMap[secondaryVenueId] ?? 0
      if (count > quota.secondaryVenueMax) {
        const venueName = VENUES[secondaryVenueId]?.name ?? secondaryVenueId
        violations.push({
          type: 'secondary-quota-exceeded',
          severity: 'error',
          round: -1,
          fixtureIndex: -1,
          homeClubId: quota.clubId,
          awayClubId: '',
          venueId: secondaryVenueId,
          message: `${clubName} has ${count} home game${count !== 1 ? 's' : ''} at ${venueName} — season quota is ${quota.secondaryVenueMax}`,
        })
      }
    }

    // Additional per-venue quotas
    for (const [venueId, maxGames] of Object.entries(quota.additionalVenueMaxByVenueId ?? {})) {
      const count = clubVenueMap[venueId] ?? 0
      if (count > maxGames) {
        const venueName = VENUES[venueId]?.name ?? venueId
        violations.push({
          type: 'additional-quota-exceeded',
          severity: 'error',
          round: -1,
          fixtureIndex: -1,
          homeClubId: quota.clubId,
          awayClubId: '',
          venueId,
          message: `${clubName} has ${count} home game${count !== 1 ? 's' : ''} at ${venueName} — quota is ${maxGames}`,
        })
      }
    }
  }

  return {
    violations,
    isValid: !violations.some((v) => v.severity === 'error'),
    stats: { gamesByVenueByClub, homeGamesByClub },
  }
}

// ── Single-fixture change validation ──────────────────────────────────────────

/**
 * Check whether assigning newVenueId to a specific fixture would violate any rules.
 * Used by the fixture editor to gate the save action.
 *
 * Checks:
 *  1. Matchup rules (required/forbidden venue)
 *  2. Quota impact — would this push the club's secondary count over its cap?
 */
export function validateSingleFixtureVenueChange(
  roundNumber: number,
  fixtureIndex: number,
  homeClubId: string,
  awayClubId: string,
  newVenueId: string,
  season: Season,
  venueState: SeasonVenueState,
  rules: VenueRuleSet,
  clubs: Record<string, Club>,
): VenueViolation[] {
  const violations: VenueViolation[] = []

  // 1. Matchup rules
  violations.push(
    ...validateMatchupVenue(homeClubId, awayClubId, newVenueId, roundNumber, fixtureIndex, rules),
  )

  // 2. Quota check — only relevant if newVenueId is the club's secondary venue
  const config = venueState.allocations[homeClubId]
  if (!config?.secondaryVenueId || newVenueId !== config.secondaryVenueId) return violations

  const quotaRule = rules.clubQuotaRules.find((r) => r.clubId === homeClubId)
  if (!quotaRule || quotaRule.secondaryVenueMax === null) return violations

  // Count existing secondary assignments, excluding the fixture being changed
  let existingCount = 0
  for (const a of venueState.assignments) {
    if (a.roundNumber === roundNumber && a.fixtureIndex === fixtureIndex) continue
    const round = season.rounds.find((r) => r.number === a.roundNumber)
    const fixture = round?.fixtures[a.fixtureIndex]
    if (fixture?.homeClubId === homeClubId && a.venueId === config.secondaryVenueId) {
      existingCount++
    }
  }

  if (existingCount + 1 > quotaRule.secondaryVenueMax) {
    const venueName = VENUES[newVenueId]?.name ?? newVenueId
    const clubName = clubs[homeClubId]?.abbreviation ?? homeClubId
    violations.push({
      type: 'secondary-quota-exceeded',
      severity: 'error',
      round: roundNumber,
      fixtureIndex,
      homeClubId,
      awayClubId,
      venueId: newVenueId,
      message: `${clubName} would have ${existingCount + 1} home game${existingCount + 1 !== 1 ? 's' : ''} at ${venueName} — season quota is ${quotaRule.secondaryVenueMax}`,
    })
  }

  // 3. Additional-venue quota check
  const additionalMax = quotaRule.additionalVenueMaxByVenueId?.[newVenueId]
  if (additionalMax !== undefined) {
    let additionalCount = 0
    for (const a of venueState.assignments) {
      if (a.roundNumber === roundNumber && a.fixtureIndex === fixtureIndex) continue
      const round = season.rounds.find((r) => r.number === a.roundNumber)
      const fixture = round?.fixtures[a.fixtureIndex]
      if (fixture?.homeClubId === homeClubId && a.venueId === newVenueId) {
        additionalCount++
      }
    }
    if (additionalCount + 1 > additionalMax) {
      const venueName = VENUES[newVenueId]?.name ?? newVenueId
      const clubName = clubs[homeClubId]?.abbreviation ?? homeClubId
      violations.push({
        type: 'additional-quota-exceeded',
        severity: 'error',
        round: roundNumber,
        fixtureIndex,
        homeClubId,
        awayClubId,
        venueId: newVenueId,
        message: `${clubName} would have ${additionalCount + 1} home game${additionalCount + 1 !== 1 ? 's' : ''} at ${venueName} — quota is ${additionalMax}`,
      })
    }
  }

  return violations
}

/**
 * Look up the matchup rule for a given home/away pair (if any).
 * Useful for surfacing advisory information in the UI without full validation.
 */
export function getMatchupRule(
  homeClubId: string,
  awayClubId: string,
  rules: VenueRuleSet,
) {
  return rules.matchupRules.find(
    (r) => r.homeClubId === homeClubId && r.awayClubId === awayClubId,
  ) ?? null
}
