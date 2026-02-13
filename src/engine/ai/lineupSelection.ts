import type { Player, PlayerPositionType, LineupSlot } from '@/types/player'

// ---------------------------------------------------------------------------
// Position codes that make up a full 22-player AFL lineup
// ---------------------------------------------------------------------------

const BACK_LINE: LineupSlot[] = ['LBP', 'RBP', 'FB']
const HALF_BACK_LINE: LineupSlot[] = ['LHB', 'RHB', 'CHB']
const CENTRE_LINE: LineupSlot[] = ['LW', 'RW', 'C']
const HALF_FORWARD_LINE: LineupSlot[] = ['LHF', 'RHF', 'CHF']
const FORWARD_LINE: LineupSlot[] = ['LFP', 'RFP', 'FF']
const FOLLOWERS: LineupSlot[] = ['RK', 'RR', 'ROV']
const INTERCHANGE: LineupSlot[] = ['I1', 'I2', 'I3', 'I4']

/**
 * Ordered list describing which position types fill which slots, and in what
 * priority.  We fill specialist roles first (ruck, centre, wings) before the
 * lines so that versatile players are not wasted on less critical positions.
 */
const FILL_ORDER: { posType: PlayerPositionType; slots: LineupSlot[] }[] = [
  // Ruck is hardest to fill – only RK players suit it
  { posType: 'RK', slots: ['RK'] },
  // Centre – outside mids map here
  { posType: 'OM', slots: ['C'] },
  // Wings
  { posType: 'W', slots: ['LW', 'RW'] },
  // Back line
  { posType: 'FB', slots: ['FB'] },
  { posType: 'BP', slots: ['LBP', 'RBP'] },
  // Half-back line
  { posType: 'CHB', slots: ['CHB'] },
  { posType: 'HBF', slots: ['LHB', 'RHB'] },
  // Half-forward line
  { posType: 'CHF', slots: ['CHF'] },
  { posType: 'HFF', slots: ['LHF', 'RHF'] },
  // Forward line
  { posType: 'FF', slots: ['FF'] },
  { posType: 'FP', slots: ['LFP', 'RFP'] },
  // Midfield followers (rover, ruck-rover)
  { posType: 'IM', slots: ['RR', 'ROV'] },
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
 * type. Uses the player's position ratings when available, falling back to
 * the generic effective rating.
 */
function computeSuitability(player: Player, targetType: PlayerPositionType): number {
  const effectiveRating = computeEffectiveRating(player)

  // If the player's primary position matches the target, they are
  // inherently a better fit.
  if (player.position.primary === targetType) {
    return effectiveRating
  }

  // If the target type appears in the player's position ratings, apply
  // that rating as a scaling factor (0-100 mapped to 0.0-1.0).
  const posRating = player.position.ratings[targetType]
  if (posRating !== undefined) {
    return effectiveRating * (posRating / 100)
  }

  // If the target type is a listed secondary position, give a moderate
  // discount (80% of effective rating).
  if (player.position.secondary.includes(targetType)) {
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
 *   - `lineup`: a mapping of lineup slots to player IDs
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

  // ---- 2. Greedy position-type assignment --------------------------------

  const lineup: Record<string, string> = {}
  const assigned = new Set<string>()

  // Helper: from a pool of candidates, pick the best one for a given
  // position type and assign them to the given slot.
  const assignBest = (
    slot: LineupSlot,
    candidates: Player[],
    targetType: PlayerPositionType,
  ): boolean => {
    // Filter to unassigned candidates and sort by suitability descending
    const available = candidates
      .filter((p) => !assigned.has(p.id))
      .map((p) => ({ player: p, score: computeSuitability(p, targetType) }))
      .sort((a, b) => b.score - a.score)

    if (available.length === 0) return false

    const best = available[0]
    lineup[slot] = best.player.id
    assigned.add(best.player.id)
    return true
  }

  // Build a lookup of eligible players grouped by their primary position.
  const byType = new Map<PlayerPositionType, Player[]>()
  for (const p of eligible) {
    const type = p.position.primary
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type)!.push(p)
  }

  // Fill each position-type block in priority order.
  for (const { posType, slots } of FILL_ORDER) {
    // Primary candidates: players whose primary position matches.
    const primaryCandidates = byType.get(posType) ?? []

    // Secondary candidates: players who list this type as a secondary
    // position. These are used as fallback.
    const secondaryCandidates = eligible.filter(
      (p) =>
        p.position.primary !== posType && p.position.secondary.includes(posType),
    )

    // Combined pool: primary first, then secondary.
    const pool = [...primaryCandidates, ...secondaryCandidates]

    for (const slot of slots) {
      assignBest(slot, pool, posType)
    }
  }

  // ---- 3. Fill any remaining on-field slots with best available -----------

  const ALL_ON_FIELD_SLOTS: LineupSlot[] = [
    ...BACK_LINE,
    ...HALF_BACK_LINE,
    ...CENTRE_LINE,
    ...HALF_FORWARD_LINE,
    ...FORWARD_LINE,
    ...FOLLOWERS,
  ]

  // Some on-field positions may still be empty if the squad was thin at a
  // particular position type. Fill them with the best remaining players.
  for (const slot of ALL_ON_FIELD_SLOTS) {
    if (lineup[slot]) continue

    const remaining = eligible
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => (ratingCache.get(b.id) ?? 0) - (ratingCache.get(a.id) ?? 0))

    if (remaining.length > 0) {
      lineup[slot] = remaining[0].id
      assigned.add(remaining[0].id)
    }
  }

  // ---- 4. Fill interchange with best remaining players --------------------

  const interchangeSlots: LineupSlot[] = [...INTERCHANGE]

  // Midfield-type players already assigned to RR / ROV above; now fill
  // interchange slots. Start with unassigned midfielders (natural
  // interchange candidates), then any remaining players.
  const remainingMids = [...(byType.get('IM') ?? []), ...(byType.get('OM') ?? [])]
    .filter((p) => !assigned.has(p.id))
    .sort((a, b) => (ratingCache.get(b.id) ?? 0) - (ratingCache.get(a.id) ?? 0))

  for (const slot of interchangeSlots) {
    if (lineup[slot]) continue

    if (remainingMids.length > 0) {
      const mid = remainingMids.shift()!
      lineup[slot] = mid.id
      assigned.add(mid.id)
    }
  }

  // If interchange spots are still unfilled, use the best remaining from
  // any position.
  for (const slot of interchangeSlots) {
    if (lineup[slot]) continue

    const remaining = eligible
      .filter((p) => !assigned.has(p.id))
      .sort((a, b) => (ratingCache.get(b.id) ?? 0) - (ratingCache.get(a.id) ?? 0))

    if (remaining.length > 0) {
      lineup[slot] = remaining[0].id
      assigned.add(remaining[0].id)
    }
  }

  // ---- 5. Build output ----------------------------------------------------

  const selectedPlayerIds = Object.values(lineup)

  return { lineup, selectedPlayerIds }
}
