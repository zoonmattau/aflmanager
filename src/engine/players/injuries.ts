import type { SeededRNG } from '@/engine/core/rng'
import type { Player, PlayerInjury, PlayerInjuryHistoryEntry } from '@/types/player'
import { getInjuryFrequencyMultiplier } from '@/engine/core/difficultyPresets'
import type { MedicalStaffImpact } from '@/engine/staff/staffEngine'

/**
 * Represents an injury that occurred during a match.
 */
export interface InjuryEvent {
  playerId: string
  type: string
  weeksOut: number
  severity: 'minor' | 'moderate' | 'major' | 'severe'
  recurring: boolean
  recurrenceRisk: number
  bodyRegion: 'soft-tissue' | 'joint' | 'concussion' | 'structural' | 'impact'
  occurredOn: string
}

/**
 * Injury category definition used for weighted random selection.
 */
interface InjuryTemplate {
  types: string[]
  weight: number
  minWeeks: number
  maxWeeks: number
  severity: 'minor' | 'moderate' | 'major' | 'severe'
  bodyRegion: 'soft-tissue' | 'joint' | 'concussion' | 'structural' | 'impact'
  recurrenceWeight: number
}

/**
 * Weighted injury categories with their probabilities and recovery windows.
 */
const INJURY_TEMPLATES: InjuryTemplate[] = [
  { types: ['Hamstring strain', 'Calf strain', 'Quad strain'], weight: 0.33, minWeeks: 1, maxWeeks: 4, severity: 'minor', bodyRegion: 'soft-tissue', recurrenceWeight: 0.95 },
  { types: ['Concussion'], weight: 0.12, minWeeks: 1, maxWeeks: 3, severity: 'moderate', bodyRegion: 'concussion', recurrenceWeight: 0.5 },
  { types: ['Corked thigh', 'Dead leg'], weight: 0.14, minWeeks: 0, maxWeeks: 1, severity: 'minor', bodyRegion: 'impact', recurrenceWeight: 0.2 },
  { types: ['Ankle sprain', 'Knee sprain'], weight: 0.17, minWeeks: 2, maxWeeks: 7, severity: 'moderate', bodyRegion: 'joint', recurrenceWeight: 0.7 },
  { types: ['Shoulder injury'], weight: 0.10, minWeeks: 2, maxWeeks: 8, severity: 'major', bodyRegion: 'joint', recurrenceWeight: 0.6 },
  { types: ['ACL tear', 'Structural knee injury'], weight: 0.09, minWeeks: 10, maxWeeks: 24, severity: 'severe', bodyRegion: 'structural', recurrenceWeight: 0.35 },
  { types: ['Back injury'], weight: 0.05, minWeeks: 2, maxWeeks: 8, severity: 'major', bodyRegion: 'structural', recurrenceWeight: 0.65 },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function clampChance(n: number): number {
  return Math.max(0, Math.min(0.95, n))
}

function normalizeInjury(injury: PlayerInjury): PlayerInjury {
  return {
    ...injury,
    initialWeeks: injury.initialWeeks ?? Math.max(1, injury.weeksRemaining),
    severity: injury.severity ?? (injury.weeksRemaining >= 10 ? 'severe' : injury.weeksRemaining >= 6 ? 'major' : injury.weeksRemaining >= 3 ? 'moderate' : 'minor'),
    occurredOn: injury.occurredOn ?? todayISO(),
    recurrenceRisk: injury.recurrenceRisk ?? 0,
    recoveryProgress: injury.recoveryProgress ?? 0,
    gamesMissed: injury.gamesMissed ?? 0,
    recurring: injury.recurring ?? false,
    bodyRegion: injury.bodyRegion ?? 'soft-tissue',
  }
}

function recentInjuryLoad(player: Player): number {
  if (!player.injuryHistory || player.injuryHistory.length === 0) return 0
  const recent = player.injuryHistory.slice(-5)
  return recent.reduce((sum, h) => sum + (h.initialWeeks >= 8 ? 1.2 : h.initialWeeks >= 4 ? 0.8 : 0.45), 0)
}

function getRecurrenceProfile(
  player: Player,
  template: InjuryTemplate,
  rng: SeededRNG,
  medical?: MedicalStaffImpact,
): { recurring: boolean; recurrenceRisk: number } {
  const history = player.injuryHistory ?? []
  const sameRegionCount = history.filter((h) => h.bodyRegion === template.bodyRegion).length
  const baseRisk = Math.min(
    0.65,
    (sameRegionCount * 0.12 + template.recurrenceWeight * 0.08) * (medical?.recurrenceRiskMultiplier ?? 1),
  )
  return {
    recurring: baseRisk > 0 && rng.next() < baseRisk,
    recurrenceRisk: baseRisk,
  }
}

/**
 * Calculate the injury probability for a single player in a match.
 *
 * Base chance is ~3%, modified by injury proneness, aggression level,
 * fatigue, and age.
 */
function getInjuryChance(
  player: Player,
  aggressionLevel: 'high' | 'medium' | 'low',
): number {
  let chance = 0.012
  const durability = player.hiddenAttributes.durability ?? Math.max(20, 100 - player.hiddenAttributes.injuryProneness)
  chance += (player.hiddenAttributes.injuryProneness / 100) * 0.028
  chance += ((100 - durability) / 100) * 0.024

  if (aggressionLevel === 'high') {
    chance += 0.012
  } else if (aggressionLevel === 'low') {
    chance -= 0.006
  }

  if (player.fatigue > 45) {
    chance += Math.min(0.03, (player.fatigue - 45) / 1800)
  }
  if (player.fitness < 80) {
    chance += Math.min(0.018, (80 - player.fitness) / 1500)
  }
  chance += Math.min(0.02, recentInjuryLoad(player) * 0.005)

  if (player.age > 30) {
    chance += 0.008
  }

  return clampChance(chance)
}

/**
 * Pick a random injury category using weighted selection, then pick a
 * specific injury type from that category and randomise the weeks out.
 */
function rollInjuryType(
  player: Player,
  rng: SeededRNG,
  currentDate?: string,
  medical?: MedicalStaffImpact,
): Omit<InjuryEvent, 'playerId'> {
  let roll = rng.nextFloat(0, 1)

  for (const template of INJURY_TEMPLATES) {
    roll -= template.weight
    if (roll <= 0) {
      const type = rng.pick(template.types)
      const recurrence = getRecurrenceProfile(player, template, rng, medical)
      const ageFactor = player.age >= 30 ? 1.12 : player.age <= 21 ? 0.95 : 1
      const durability = player.hiddenAttributes.durability ?? Math.max(20, 100 - player.hiddenAttributes.injuryProneness)
      const durabilityFactor = 1 + (100 - durability) / 280
      const recurringFactor = recurrence.recurring ? 1.25 : 1
      const baseWeeks = rng.nextInt(template.minWeeks, template.maxWeeks)
      const weeksOut = Math.max(
        1,
        Math.round(baseWeeks * ageFactor * durabilityFactor * recurringFactor),
      )
      return {
        type,
        weeksOut,
        severity: template.severity,
        recurring: recurrence.recurring,
        recurrenceRisk: recurrence.recurrenceRisk,
        bodyRegion: template.bodyRegion,
        occurredOn: currentDate ?? todayISO(),
      }
    }
  }

  const fallback = INJURY_TEMPLATES[0]
  return {
    type: rng.pick(fallback.types),
    weeksOut: rng.nextInt(fallback.minWeeks, fallback.maxWeeks),
    severity: fallback.severity,
    recurring: false,
    recurrenceRisk: 0,
    bodyRegion: fallback.bodyRegion,
    occurredOn: currentDate ?? todayISO(),
  }
}

export function applyInjuryEvent(player: Player, event: InjuryEvent): void {
  player.injury = {
    type: event.type,
    weeksRemaining: event.weeksOut,
    initialWeeks: event.weeksOut,
    severity: event.severity,
    occurredOn: event.occurredOn,
    recurrenceRisk: event.recurrenceRisk,
    recoveryProgress: 0,
    gamesMissed: 0,
    recurring: event.recurring,
    bodyRegion: event.bodyRegion,
  }
  player.fitness = Math.max(40, player.fitness - Math.min(24, Math.round(event.weeksOut * 1.8)))
  player.fatigue = Math.min(100, player.fatigue + Math.min(25, Math.round(event.weeksOut * 1.3)))
  player.morale = Math.max(1, player.morale - (event.severity === 'severe' ? 10 : event.severity === 'major' ? 7 : 4))

  const historyEntry: PlayerInjuryHistoryEntry = {
    type: event.type,
    occurredOn: event.occurredOn,
    initialWeeks: event.weeksOut,
    gamesMissed: 0,
    recurring: event.recurring,
    severity: event.severity,
    bodyRegion: event.bodyRegion,
  }
  if (!player.injuryHistory) player.injuryHistory = []
  player.injuryHistory.push(historyEntry)
}

/**
 * Roll for injuries across all players participating in a match.
 *
 * For each player, calculates an injury probability based on their
 * attributes, fatigue, age, and the match aggression level. If the roll
 * succeeds, an injury is generated with a random type and duration.
 *
 * @param playerIds - IDs of players participating in the match
 * @param players - Full player record keyed by ID
 * @param rng - Seeded random number generator for reproducibility
 * @param aggressionLevel - Overall aggression intensity of the match
 * @returns Array of injury events that occurred during the match
 */
export function rollMatchInjuries(
  playerIds: string[],
  players: Record<string, Player>,
  rng: SeededRNG,
  aggressionLevel: 'high' | 'medium' | 'low',
  injuryFrequency?: 'low' | 'medium' | 'high',
  currentDate?: string,
  medicalImpactByClub?: Record<string, MedicalStaffImpact>,
): InjuryEvent[] {
  const injuries: InjuryEvent[] = []
  const frequencyMultiplier = getInjuryFrequencyMultiplier(injuryFrequency ?? 'medium')

  for (const playerId of playerIds) {
    const player = players[playerId]
    if (!player) continue

    // Skip players who are already injured
    if (player.injury) continue

    const medical = medicalImpactByClub?.[player.clubId]
    const chance =
      getInjuryChance(player, aggressionLevel) *
      frequencyMultiplier *
      (medical?.injuryRiskMultiplier ?? 1)

    if (rng.chance(chance)) {
      const rolled = rollInjuryType(player, rng, currentDate, medical)
      injuries.push({ playerId, ...rolled })
    }
  }

  return injuries
}

/**
 * Process weekly injury healing for all players.
 *
 * Decrements weeksRemaining for every injured player. When weeksRemaining
 * reaches 0 the injury is cleared (set to null).
 *
 * @param players - Mutable player record (call inside Immer draft or similar)
 * @returns Array of player IDs who have fully recovered this week
 */
export function healInjuries(
  players: Record<string, Player>,
  currentDate?: string,
  medicalImpactByClub?: Record<string, MedicalStaffImpact>,
  medicalCentreLevelByClub?: Record<string, number>,
): string[] {
  const recovered: string[] = []

  for (const playerId of Object.keys(players)) {
    const player = players[playerId]
    if (!player.injury) continue

    player.injury = normalizeInjury(player.injury)

    const injury = player.injury
    const medical = medicalImpactByClub?.[player.clubId]
    const professionalismBoost = (player.personality.professionalism - 50) / 500
    const durability = player.hiddenAttributes.durability ?? Math.max(20, 100 - player.hiddenAttributes.injuryProneness)
    const durabilityBoost = (durability - 50) / 420
    const agePenalty = player.age >= 30 ? -0.07 : player.age <= 22 ? 0.04 : 0
    const fatiguePenalty = player.fatigue >= 60 ? -0.08 : 0
    const baseStep = 100 / Math.max(1, injury.initialWeeks ?? injury.weeksRemaining)
    const severityDrag = injury.severity === 'severe' ? 0.8 : injury.severity === 'major' ? 0.9 : 1
    const recurringDrag = injury.recurring ? 0.88 : 1
    // Medical centre facility modifier: level 3 = 1.0x (baseline), level 5 = 1.1x, level 1 = 0.9x
    const facilityLevel = medicalCentreLevelByClub?.[player.clubId] ?? 3
    const facilityRecoveryMod = 1 + (facilityLevel - 3) * 0.05
    const weeklyRecovery =
      baseStep *
      (1 + professionalismBoost + durabilityBoost + agePenalty + fatiguePenalty) *
      severityDrag *
      recurringDrag *
      (medical?.rehabProgressMultiplier ?? 1) *
      facilityRecoveryMod

    injury.recoveryProgress = (injury.recoveryProgress ?? 0) + Math.max(8, weeklyRecovery)
    injury.gamesMissed = (injury.gamesMissed ?? 0) + 1

    while ((injury.recoveryProgress ?? 0) >= 100 && injury.weeksRemaining > 0) {
      injury.weeksRemaining -= 1
      injury.recoveryProgress = (injury.recoveryProgress ?? 0) - 100
    }

    if (injury.weeksRemaining <= 0) {
      if (player.injuryHistory && player.injuryHistory.length > 0) {
        for (let i = player.injuryHistory.length - 1; i >= 0; i--) {
          const h = player.injuryHistory[i]
          if (h.recoveredOn) continue
          if (h.type === injury.type && h.occurredOn === injury.occurredOn) {
            h.recoveredOn = currentDate ?? todayISO()
            h.gamesMissed = injury.gamesMissed ?? h.gamesMissed
            break
          }
        }
      }
      player.injury = null
      player.fitness = Math.min(88, player.fitness + 8)
      player.fatigue = Math.max(0, player.fatigue - 10)
      recovered.push(playerId)
    }
  }

  return recovered
}
