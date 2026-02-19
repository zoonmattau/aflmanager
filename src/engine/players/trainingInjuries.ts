/**
 * trainingInjuries.ts
 *
 * Training and preseason injury events — separate from match injuries.
 *
 * Training injuries have a lower base rate than match injuries, use a
 * different template pool (no concussions / impact injuries), and are
 * influenced by training load, player fatigue, medical staff quality,
 * and whether a preseason competition was played.
 */

import type { Player, PlayerInjury } from '@/types/player'
import type { MedicalStaffImpact } from '@/engine/staff/staffEngine'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TrainingInjuryCause =
  | 'overtraining'
  | 'soft-tissue'
  | 'stress-fracture'
  | 'practice-match'

export interface TrainingInjuryEvent {
  playerId: string
  playerName: string
  clubId: string
  injury: PlayerInjury
  cause: TrainingInjuryCause
  /** 1-based week within the preseason (or round number in-season). */
  week: number
  /** Weeks remaining on this injury at season start (0 = healed before round 1). */
  weeksAtSeasonStart: number
}

export interface TrainingInjuryRisk {
  level: 'low' | 'moderate' | 'high'
  /** 0-1 raw probability per training week (pre-medical adjustment). */
  chance: number
  /** Human-readable contributing factors for UI display. */
  factors: string[]
}

// ---------------------------------------------------------------------------
// Training-specific injury template pool
// (no concussions, no impact — training-context only)
// ---------------------------------------------------------------------------

interface TrainingInjuryTemplate {
  types: string[]
  weight: number
  minWeeks: number
  maxWeeks: number
  severity: 'minor' | 'moderate' | 'major' | 'severe'
  bodyRegion: 'soft-tissue' | 'joint' | 'structural'
  recurrenceWeight: number
  /** Only included when intensity is 'intense'. */
  intenseOnly?: boolean
}

const TRAINING_INJURY_TEMPLATES: TrainingInjuryTemplate[] = [
  {
    types: ['Hamstring strain', 'Calf strain', 'Quad strain'],
    weight: 0.40, minWeeks: 1, maxWeeks: 4,
    severity: 'minor', bodyRegion: 'soft-tissue', recurrenceWeight: 0.9,
  },
  {
    types: ['Ankle sprain', 'Knee sprain'],
    weight: 0.22, minWeeks: 1, maxWeeks: 5,
    severity: 'moderate', bodyRegion: 'joint', recurrenceWeight: 0.65,
  },
  {
    types: ['Lower back strain', 'Back soreness'],
    weight: 0.16, minWeeks: 1, maxWeeks: 6,
    severity: 'moderate', bodyRegion: 'structural', recurrenceWeight: 0.7,
  },
  {
    types: ['Shoulder soreness', 'Rotator cuff strain'],
    weight: 0.10, minWeeks: 1, maxWeeks: 4,
    severity: 'minor', bodyRegion: 'joint', recurrenceWeight: 0.55,
  },
  {
    types: ['Stress fracture'],
    weight: 0.08, minWeeks: 4, maxWeeks: 10,
    severity: 'major', bodyRegion: 'structural', recurrenceWeight: 0.5,
    intenseOnly: true,
  },
  {
    types: ['ACL tear', 'Structural knee injury'],
    weight: 0.04, minWeeks: 12, maxWeeks: 26,
    severity: 'severe', bodyRegion: 'structural', recurrenceWeight: 0.4,
  },
]

// ---------------------------------------------------------------------------
// Base injury rates by training context
// ---------------------------------------------------------------------------

const BASE_RATE: Record<'light' | 'moderate' | 'intense' | 'practice-match', number> = {
  'light':          0.002,
  'moderate':       0.005,
  'intense':        0.014,
  'practice-match': 0.009,
}

// Max cap on training injury probability (much lower than match)
const MAX_TRAINING_INJURY_CHANCE = 0.12

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function weightedPickTemplate(
  rng: SeededRNG,
  intensity: 'light' | 'moderate' | 'intense' | 'practice-match',
): TrainingInjuryTemplate {
  const pool =
    intensity === 'intense'
      ? TRAINING_INJURY_TEMPLATES
      : TRAINING_INJURY_TEMPLATES.filter((t) => !t.intenseOnly)

  const total = pool.reduce((s, t) => s + t.weight, 0)
  let roll = rng.nextFloat(0, total)
  for (const t of pool) {
    roll -= t.weight
    if (roll <= 0) return t
  }
  return pool[pool.length - 1]
}

function recentInjuryLoad(player: Player): number {
  if (!player.injuryHistory?.length) return 0
  return player.injuryHistory
    .slice(-5)
    .reduce(
      (sum, h) =>
        sum + (h.initialWeeks >= 8 ? 1.2 : h.initialWeeks >= 4 ? 0.8 : 0.4),
      0,
    )
}

function getInjuryChance(
  player: Player,
  intensity: 'light' | 'moderate' | 'intense' | 'practice-match',
  medical: MedicalStaffImpact | null,
): number {
  let chance = BASE_RATE[intensity]

  // Injury proneness
  chance += (player.hiddenAttributes.injuryProneness / 100) * 0.008

  // Fatigue amplifier (kicks in above 65)
  if (player.fatigue > 65) {
    chance *= 1 + (player.fatigue - 65) / 150
  }

  // Low fitness increases risk
  if (player.fitness < 75) {
    chance *= 1 + (75 - player.fitness) / 200
  }

  // Age amplifier
  if (player.age > 30) {
    chance *= 1 + (player.age - 30) * 0.04
  }

  // Recent injury history
  const recentLoad = recentInjuryLoad(player)
  chance *= 1 + recentLoad * 0.06

  // Medical staff impact
  if (medical) {
    chance *= medical.injuryRiskMultiplier
  }

  return Math.min(chance, MAX_TRAINING_INJURY_CHANCE)
}

function buildInjury(
  template: TrainingInjuryTemplate,
  rng: SeededRNG,
  currentDate: string,
  player: Player,
  medical: MedicalStaffImpact | null,
): PlayerInjury {
  const history = player.injuryHistory ?? []
  const sameRegion = history.filter((h) => h.bodyRegion === template.bodyRegion).length
  const baseRecurrence = Math.min(
    0.6,
    sameRegion * 0.10 + template.recurrenceWeight * 0.07,
  )
  const recurrenceRisk = baseRecurrence * (medical?.recurrenceRiskMultiplier ?? 1)
  const recurring = recurrenceRisk > 0 && rng.next() < recurrenceRisk

  const weeks = rng.nextInt(template.minWeeks, template.maxWeeks)
  const type = template.types[rng.nextInt(0, template.types.length - 1)]

  return {
    type,
    weeksRemaining: weeks,
    initialWeeks: weeks,
    severity: template.severity,
    occurredOn: currentDate,
    recurrenceRisk,
    recoveryProgress: 0,
    gamesMissed: 0,
    recurring,
    bodyRegion: template.bodyRegion as PlayerInjury['bodyRegion'],
  }
}

// ---------------------------------------------------------------------------
// Public API — single-week roll
// ---------------------------------------------------------------------------

/**
 * Roll for training injuries for a group of players in one training week.
 *
 * @param players       - All players to check (already-injured players are skipped).
 * @param intensity     - Intensity of the training week.
 * @param week          - 1-based week number (used in returned event).
 * @param medical       - Per-club medical staff impact map.
 * @param rng           - Seeded RNG for reproducibility.
 * @param currentDate   - ISO date string to stamp injuries.
 * @param weeksLeftInPreseason - If in preseason, weeks remaining after this week (for persistence calc).
 * @param extraBufferWeeks    - Additional weeks before season (practice matches, venue phases).
 */
export function rollTrainingInjuries(
  players: Player[],
  intensity: 'light' | 'moderate' | 'intense' | 'practice-match',
  week: number,
  medical: MedicalStaffImpact | null,
  rng: SeededRNG,
  currentDate: string,
  weeksLeftInPreseason = 0,
  extraBufferWeeks = 0,
): TrainingInjuryEvent[] {
  const events: TrainingInjuryEvent[] = []

  for (const player of players) {
    if (player.injury) continue // already injured — skip

    const chance = getInjuryChance(player, intensity, medical)
    if (rng.next() >= chance) continue

    const template = weightedPickTemplate(rng, intensity)
    const injury = buildInjury(template, rng, currentDate, player, medical)

    // How many weeks of recovery time is available before round 1?
    const healingBuffer = weeksLeftInPreseason + extraBufferWeeks
    const weeksAtSeasonStart = Math.max(0, injury.weeksRemaining - healingBuffer)

    const cause: TrainingInjuryCause =
      intensity === 'practice-match'
        ? 'practice-match'
        : injury.bodyRegion === 'structural' && injury.severity === 'major'
        ? 'stress-fracture'
        : player.fatigue > 70
        ? 'overtraining'
        : 'soft-tissue'

    events.push({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      clubId: player.clubId,
      injury,
      cause,
      week,
      weeksAtSeasonStart,
    })
  }

  return events
}

// ---------------------------------------------------------------------------
// Public API — full preseason block
// ---------------------------------------------------------------------------

/**
 * Simulate training injuries across a full preseason block (PRESEASON_WEEKS weeks).
 *
 * Returns injury events per player. Events with `weeksAtSeasonStart > 0` should
 * have their injury applied to the player at season start.
 *
 * @param playersByClub - Map of clubId → Player[].
 * @param medicalByClub - Per-club medical staff impact.
 * @param preseasonWeeks - Number of preseason training weeks (default 8).
 * @param rng           - Seeded RNG.
 * @param baseDate      - ISO date representing start of preseason (for stamping).
 * @param extraBufferWeeks - Additional weeks between training block end and round 1.
 */
export function rollPreseasonInjuryBlock(
  playersByClub: Record<string, Player[]>,
  medicalByClub: Record<string, MedicalStaffImpact | null>,
  preseasonWeeks: number,
  rng: SeededRNG,
  baseDate: string,
  extraBufferWeeks = 3,
): TrainingInjuryEvent[] {
  const allEvents: TrainingInjuryEvent[] = []

  // Injured-this-preseason set (once injured, player skips remaining weeks)
  const injuredPlayerIds = new Set<string>()

  for (let week = 1; week <= preseasonWeeks; week++) {
    // Last session of each week is light recovery → use 'light' for that week's aggregate
    // Weeks 1-4: moderate, weeks 5-7: occasional intense session, week 8: taper
    const intensity: 'light' | 'moderate' | 'intense' =
      week === 8
        ? 'light'
        : week >= 5
        ? rng.next() < 0.4 ? 'intense' : 'moderate'
        : 'moderate'

    const weeksRemaining = preseasonWeeks - week // weeks left AFTER this week

    for (const [clubId, players] of Object.entries(playersByClub)) {
      const medical = medicalByClub[clubId] ?? null
      const eligible = players.filter((p) => !injuredPlayerIds.has(p.id))

      const weekDate = advanceDate(baseDate, (week - 1) * 7)
      const events = rollTrainingInjuries(
        eligible,
        intensity,
        week,
        medical,
        rng,
        weekDate,
        weeksRemaining,
        extraBufferWeeks,
      )

      for (const event of events) {
        injuredPlayerIds.add(event.playerId)
        allEvents.push(event)
      }
    }
  }

  return allEvents
}

// ---------------------------------------------------------------------------
// Helper: advance ISO date by N days
// ---------------------------------------------------------------------------

function advanceDate(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Public API — per-player risk assessment for UI
// ---------------------------------------------------------------------------

/**
 * Compute a risk summary for a single player's current training injury risk.
 * Used by the Training page to surface high-risk players.
 */
export function getTrainingInjuryRisk(
  player: Player,
  intensity: 'light' | 'moderate' | 'intense' = 'moderate',
  medical: MedicalStaffImpact | null = null,
): TrainingInjuryRisk {
  const chance = getInjuryChance(player, intensity, medical)
  const factors: string[] = []

  if (player.hiddenAttributes.injuryProneness > 65)
    factors.push('High injury proneness')
  if (player.fatigue > 70) factors.push(`Fatigue ${player.fatigue} (very high)`)
  else if (player.fatigue > 55) factors.push(`Fatigue ${player.fatigue} (elevated)`)
  if (player.fitness < 65) factors.push(`Fitness ${player.fitness} (low)`)
  if (player.age > 33) factors.push('Veteran age')
  if ((player.injuryHistory?.length ?? 0) >= 3) factors.push('Injury history')

  const level: TrainingInjuryRisk['level'] =
    chance > 0.06
      ? 'high'
      : chance > 0.025
      ? 'moderate'
      : 'low'

  return { level, chance, factors }
}
