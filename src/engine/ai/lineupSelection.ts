import type { Player, PositionGroup } from '@/types/player'

// ---------------------------------------------------------------------------
// Position codes that make up a full 22-player AFL lineup
// ---------------------------------------------------------------------------

const BACK_LINE = ['FB', 'BPL', 'BPR'] as const
const HALF_BACK_LINE = ['HBF', 'CHB', 'HBF2'] as const
const CENTRE_LINE = ['W', 'C', 'W2'] as const
const HALF_FORWARD_LINE = ['HFF', 'CHF', 'HFF2'] as const
const FORWARD_LINE = ['FP', 'FF', 'FP2'] as const
const FOLLOWERS = ['RK', 'RR', 'ROV'] as const
const INTERCHANGE = ['I1', 'I2', 'I3', 'I4'] as const

type PositionCode =
  | (typeof BACK_LINE)[number]
  | (typeof HALF_BACK_LINE)[number]
  | (typeof CENTRE_LINE)[number]
  | (typeof HALF_FORWARD_LINE)[number]
  | (typeof FORWARD_LINE)[number]
  | (typeof FOLLOWERS)[number]
  | (typeof INTERCHANGE)[number]

/**
 * Ordered list describing which position groups fill which slots, and in what
 * priority.  We fill specialist roles first (ruck, centre, wings) before the
 * lines so that versatile players are not wasted on less critical positions.
 */
const FILL_ORDER: { group: PositionGroup; codes: readonly PositionCode[] }[] = [
  // Ruck is hardest to fill – only FOLL players suit it
  { group: 'FOLL', codes: ['RK'] },
  // Centre – only C group maps here
  { group: 'C', codes: ['C'] },
  // Wings
  { group: 'WING', codes: ['W', 'W2'] },
  // Back line
  { group: 'FB', codes: BACK_LINE },
  // Half-back line
  { group: 'HB', codes: HALF_BACK_LINE },
  // Half-forward line
  { group: 'HF', codes: HALF_FORWARD_LINE },
  // Forward line
  { group: 'FF', codes: FORWARD_LINE },
  // Midfield followers (rover, ruck-rover) and interchange
  { group: 'MID', codes: ['RR', 'ROV'] },
]

// ---------------------------------------------------------------------------
// Rating helpers
// ---------------------------------------------------------------------------

/**
 * Compute a player's effective overall rating.
 *
 * Base overall = average of the top 10 attribute values.
 * Adjusted overall = baseOverall * (fitness / 100) * (0.7 + form / 100 * 0.3)
 */
function computeEffectiveRating(player: Player): number {
  const attrs = player.attributes
  const values: number[] = Object.values(attrs).filter(
    (v): v is number => typeof v === 'number',
  )

  // Sort descending and take top 10
  values.sort((a, b) => b - a)
  const top10 = values.slice(0, 10)
  const baseOverall =
    top10.length > 0 ? top10.reduce((sum, v) => sum + v, 0) / top10.length : 0

  return baseOverall * (player.fitness / 100) * (0.7 + (player.form / 100) * 0.3)
}

/**
 * Compute a position-aware suitability score for a player at a given position
 * group. Uses the player's position ratings when available, falling back to
 * the generic effective rating.
 */
function computeSuitability(player: Player, targetGroup: PositionGroup): number {
  const effectiveRating = computeEffectiveRating(player)

  // If the player's primary position matches the target group, they are
  // inherently a better fit.
  if (player.position.primary === targetGroup) {
    return effectiveRating
  }

  // If the target group appears in the player's position ratings, apply
  // that rating as a scaling factor (0-100 mapped to 0.0-1.0).
  const posRating = player.position.ratings[targetGroup]
  if (posRating !== undefined) {
    return effectiveRating * (posRating / 100)
  }

  // If the target group is a listed secondary position, give a moderate
  // discount (80% of effective rating).
  if (player.position.secondary.includes(targetGroup)) {
    return effectiveRating * 0.8
  }

  // Otherwise the player is out of position – heavy discount.
  return effectiveRating * 0.5
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Auto-select the best 22 players for an AI-controlled club.
 *
 * @param players - The full squad of players available for selection.
 * @param clubId  - The club ID to select a lineup for.
 * @returns An object containing:
 *   - `lineup`: a mapping of position codes to player IDs
 *   - `selectedPlayerIds`: the 22 chosen player IDs
 */
export function selectBestLineup(
  players: Player[],
  clubId: string,
): { lineup: Record<string, string>; selectedPlayerIds: string[] } {
  // ---- 1. Filter eligible players ----------------------------------------

  const eligible = players
    .filter((p) => p.clubId === clubId)
    .filter((p) => p.injury === null)
    .filter((p) => p.fitness >= 50)

  // Pre-compute effective ratings for every eligible player so we can sort
  // them without recalculating each time.
  const ratingCache = new Map<string, number>()
  for (const p of eligible) {
    ratingCache.set(p.id, computeEffectiveRating(p))
  }

  // ---- 2. Greedy position-group assignment --------------------------------

  const lineup: Record<string, string> = {}
  const assigned = new Set<string>()

  // Helper: from a pool of candidates, pick the best one for a given
  // position group and assign them to the given position code.
  const assignBest = (
    code: PositionCode,
    candidates: Player[],
    targetGroup: PositionGroup,
  ): boolean => {
    // Filter to unassigned candidates and sort by suitability descending
    const available = candidates
      .filter((p) => !assigned.has(p.id))
      .map((p) => ({ player: p, score: computeSuitability(p, targetGroup) }))
      .sort((a, b) => b.score - a.score)

    if (available.length === 0) return false

    const best = available[0]
    lineup[code] = best.player.id
    assigned.add(best.player.id)
    return true
  }

  // Build a lookup of eligible players grouped by their primary position.
  const byGroup = new Map<PositionGroup, Player[]>()
  for (const p of eligible) {
    const group = p.position.primary
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group)!.push(p)
  }

  // Fill each position-group block in priority order.
  for (const { group, codes } of FILL_ORDER) {
    // Primary candidates: players whose primary position matches.
    const primaryCandidates = byGroup.get(group) ?? []

    // Secondary candidates: players who list this group as a secondary
    // position. These are used as fallback.
    const secondaryCandidates = eligible.filter(
      (p) =>
        p.position.primary !== group && p.position.secondary.includes(group),
    )

    // Combined pool: primary first, then secondary.
    const pool = [...primaryCandidates, ...secondaryCandidates]

    for (const code of codes) {
      assignBest(code, pool, group)
    }
  }

  // ---- 3. Fill any remaining on-field slots with best available -----------

  const ALL_ON_FIELD_CODES: PositionCode[] = [
    ...BACK_LINE,
    ...HALF_BACK_LINE,
    ...CENTRE_LINE,
    ...HALF_FORWARD_LINE,
    ...FORWARD_LINE,
    ...FOLLOWERS,
  ]

  // Some on-field positions may still be empty if the squad was thin at a
  // particular position group. Fill them with the best remaining players.
  for (const code of ALL_ON_FIELD_CODES) {
    if (lineup[code]) continue

    const remaining = eligible
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => (ratingCache.get(b.id) ?? 0) - (ratingCache.get(a.id) ?? 0))

    if (remaining.length > 0) {
      lineup[code] = remaining[0].id
      assigned.add(remaining[0].id)
    }
  }

  // ---- 4. Fill interchange with best remaining players --------------------

  const interchangeCodes: PositionCode[] = [...INTERCHANGE]

  // Midfield-group players already assigned to RR / ROV above; now fill
  // interchange slots. Start with unassigned midfielders (natural
  // interchange candidates), then any remaining players.
  const remainingMids = (byGroup.get('MID') ?? [])
    .filter((p) => !assigned.has(p.id))
    .sort((a, b) => (ratingCache.get(b.id) ?? 0) - (ratingCache.get(a.id) ?? 0))

  for (const code of interchangeCodes) {
    if (lineup[code]) continue

    if (remainingMids.length > 0) {
      const mid = remainingMids.shift()!
      lineup[code] = mid.id
      assigned.add(mid.id)
    }
  }

  // If interchange spots are still unfilled, use the best remaining from
  // any position.
  for (const code of interchangeCodes) {
    if (lineup[code]) continue

    const remaining = eligible
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => (ratingCache.get(b.id) ?? 0) - (ratingCache.get(a.id) ?? 0))

    if (remaining.length > 0) {
      lineup[code] = remaining[0].id
      assigned.add(remaining[0].id)
    }
  }

  // ---- 5. Build output ----------------------------------------------------

  const selectedPlayerIds = Object.values(lineup)

  return { lineup, selectedPlayerIds }
}
