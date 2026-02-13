import type { SeededRNG } from '@/engine/core/rng'
import type { Player, PlayerAttributes, PlayerPositionType } from '@/types/player'
import type { StaffMember, StaffRole } from '@/types/staff'
import type { ClubFacilities } from '@/types/club'
import { MIN_ATTRIBUTE, MAX_ATTRIBUTE } from '@/engine/core/constants'

// ── Training Program Types ──────────────────────────────────────────────────

export type TrainingFocus =
  | 'kicking'
  | 'handball'
  | 'marking'
  | 'physical'
  | 'contested'
  | 'game-sense'
  | 'offensive'
  | 'defensive'
  | 'ruck'
  | 'mental'
  | 'set-pieces'
  | 'match-fitness'
  | 'recovery'

export type TrainingIntensity = 'light' | 'moderate' | 'intense'

export interface TrainingSession {
  id: string
  focus: TrainingFocus
  intensity: TrainingIntensity
  assignedCoachId: string | null
  assignedPlayerIds: string[] // empty = whole squad
}

export interface TrainingWeek {
  sessions: TrainingSession[] // max 4 sessions per week
}

export interface PositionRetrainProgress {
  playerId: string
  targetPosition: PlayerPositionType
  progress: number // 0-100, once 100 the player gains the position
  startedWeek: number
}

export interface TrainingResult {
  playerId: string
  attributeChanges: Partial<PlayerAttributes>
  fitnessChange: number
  fatigueChange: number
  injuryRisk: boolean
}

// ── Attribute Mappings by Focus ─────────────────────────────────────────────

export const FOCUS_ATTRIBUTES: Record<TrainingFocus, (keyof PlayerAttributes)[]> = {
  kicking: ['kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap'],
  handball: ['handballEfficiency', 'handballDistance', 'handballReceive'],
  marking: ['markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested'],
  physical: ['speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery'],
  contested: ['tackling', 'contested', 'clearance', 'hardness'],
  'game-sense': ['disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure'],
  offensive: ['goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct'],
  defensive: ['intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding'],
  ruck: ['hitouts', 'ruckCreative', 'followUp'],
  mental: ['pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch'],
  'set-pieces': ['centreBounce', 'boundaryThrowIn', 'stoppage'],
  'match-fitness': ['endurance', 'recovery', 'workRate'],
  recovery: ['recovery'],
}

/** Maps training focus to the most appropriate specialist coach role. */
const FOCUS_TO_COACH_ROLE: Record<TrainingFocus, StaffRole> = {
  kicking: 'assistant-coach',
  handball: 'assistant-coach',
  marking: 'assistant-coach',
  physical: 'strength-conditioning',
  contested: 'midfield-coach',
  'game-sense': 'midfield-coach',
  offensive: 'forwards-coach',
  defensive: 'defensive-coach',
  ruck: 'ruck-coach',
  mental: 'head-coach',
  'set-pieces': 'midfield-coach',
  'match-fitness': 'strength-conditioning',
  recovery: 'strength-conditioning',
}

/** Physical attributes that decline faster post-peak. */
const DECLINING_PHYSICAL_ATTRS: (keyof PlayerAttributes)[] = [
  'speed',
  'acceleration',
  'leap',
  'endurance',
]

// ── Utility ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const INTENSITY_MULTIPLIER: Record<TrainingIntensity, number> = {
  light: 0.5,
  moderate: 1.0,
  intense: 1.5,
}

const INTENSITY_FATIGUE: Record<TrainingIntensity, number> = {
  light: 3,
  moderate: 8,
  intense: 15,
}

const INTENSITY_FITNESS: Record<TrainingIntensity, number> = {
  light: 2,
  moderate: 1,
  intense: -3,
}

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Returns a sensible default training week with 4 sessions:
 * match-fitness (moderate), contested (moderate), kicking (moderate), recovery (light).
 */
export function getDefaultTrainingWeek(): TrainingWeek {
  return {
    sessions: [
      {
        id: 'default-1',
        focus: 'match-fitness',
        intensity: 'moderate',
        assignedCoachId: null,
        assignedPlayerIds: [],
      },
      {
        id: 'default-2',
        focus: 'contested',
        intensity: 'moderate',
        assignedCoachId: null,
        assignedPlayerIds: [],
      },
      {
        id: 'default-3',
        focus: 'kicking',
        intensity: 'moderate',
        assignedCoachId: null,
        assignedPlayerIds: [],
      },
      {
        id: 'default-4',
        focus: 'recovery',
        intensity: 'light',
        assignedCoachId: null,
        assignedPlayerIds: [],
      },
    ],
  }
}

/**
 * Find the most appropriate coach for a given training focus from the staff pool.
 * Returns the specialist coach if one exists, otherwise falls back to the head coach.
 */
export function getCoachForFocus(
  focus: TrainingFocus,
  staff: Record<string, StaffMember>,
): StaffMember | null {
  const staffList = Object.values(staff)
  const targetRole = FOCUS_TO_COACH_ROLE[focus]

  // Look for the specialist coach first
  const specialist = staffList.find((s) => s.role === targetRole)
  if (specialist) return specialist

  // Fall back to head coach
  const headCoach = staffList.find((s) => s.role === 'head-coach')
  return headCoach ?? null
}

/**
 * Get the age-based training multiplier.
 * Younger players develop faster, older players gain very little.
 */
function getTrainingAgeFactor(age: number): number {
  if (age < 23) return 1.3
  if (age <= 26) return 1.0
  if (age <= 30) return 0.7
  return 0.3
}

/**
 * Calculate the coaching quality multiplier for a session.
 *
 * If an assigned coach matches the specialist role for the focus,
 * they provide a 1.2x bonus on top of their development rating.
 * Otherwise the head coach's development rating is used as a baseline.
 */
function getCoachingMultiplier(
  session: TrainingSession,
  staff: Record<string, StaffMember>,
  focus: TrainingFocus,
): number {
  const targetRole = FOCUS_TO_COACH_ROLE[focus]

  // If a specific coach is assigned, use them
  if (session.assignedCoachId && staff[session.assignedCoachId]) {
    const coach = staff[session.assignedCoachId]
    const baseQuality = coach.ratings.development / 100
    const isSpecialist = coach.role === targetRole
    return isSpecialist ? baseQuality * 1.2 : baseQuality
  }

  // Otherwise auto-select: look for specialist, then head coach
  const staffList = Object.values(staff)
  const specialist = staffList.find((s) => s.role === targetRole)
  if (specialist) {
    return (specialist.ratings.development / 100) * 1.2
  }

  const headCoach = staffList.find((s) => s.role === 'head-coach')
  if (headCoach) {
    return headCoach.ratings.development / 100
  }

  // No coaching staff available -- minimal benefit
  return 0.5
}

/**
 * Calculate the facility multiplier based on the training ground level.
 * Level 3 = 1.0 (baseline), level 5 = 1.67, level 1 = 0.33.
 */
function getFacilityMultiplier(facilities: ClubFacilities): number {
  return facilities.trainingGround / 3
}

/**
 * Calculate the potential ceiling diminishing factor.
 * As an attribute approaches the player's ceiling, gains taper off.
 */
function getCeilingDiminish(currentValue: number, ceiling: number): number {
  if (currentValue >= ceiling) return 0
  const headroom = ceiling - currentValue
  if (headroom >= 20) return 1.0
  // Linear taper: 20 headroom -> 1.0, 0 headroom -> 0
  return headroom / 20
}

/**
 * Run all training sessions for the week and calculate results for each player.
 * Does NOT mutate players -- use applyTrainingResults() to apply.
 */
export function runTrainingSessions(
  players: Record<string, Player>,
  sessions: TrainingSession[],
  staff: Record<string, StaffMember>,
  facilities: ClubFacilities,
  rng: SeededRNG,
): TrainingResult[] {
  // Build a map of player results to accumulate across multiple sessions
  const resultMap: Record<
    string,
    {
      attributeChanges: Partial<PlayerAttributes>
      fitnessChange: number
      fatigueChange: number
      injuryRisk: boolean
    }
  > = {}

  function ensureResult(playerId: string) {
    if (!resultMap[playerId]) {
      resultMap[playerId] = {
        attributeChanges: {},
        fitnessChange: 0,
        fatigueChange: 0,
        injuryRisk: false,
      }
    }
  }

  const facilityMultiplier = getFacilityMultiplier(facilities)

  for (const session of sessions) {
    // Determine which players participate in this session
    const participantIds =
      session.assignedPlayerIds.length > 0
        ? session.assignedPlayerIds
        : Object.keys(players)

    const intensityMul = INTENSITY_MULTIPLIER[session.intensity]
    const coachingMul = getCoachingMultiplier(session, staff, session.focus)
    const focusAttrs = FOCUS_ATTRIBUTES[session.focus]

    for (const playerId of participantIds) {
      const player = players[playerId]
      if (!player) continue

      // Skip injured players
      if (player.injury) continue

      ensureResult(playerId)
      const result = resultMap[playerId]

      const ageFactor = getTrainingAgeFactor(player.age)
      const devRate = player.hiddenAttributes.developmentRate
      const ceiling = player.hiddenAttributes.potentialCeiling

      // Calculate attribute gains for relevant attributes
      for (const attr of focusAttrs) {
        const currentValue = player.attributes[attr]
        const baseGain = rng.nextFloat(0.1, 0.5)
        const ceilingDiminish = getCeilingDiminish(currentValue, ceiling)

        const gain =
          baseGain *
          intensityMul *
          coachingMul *
          facilityMultiplier *
          devRate *
          ageFactor *
          ceilingDiminish

        const prev = (result.attributeChanges[attr] as number | undefined) ?? 0
        result.attributeChanges[attr] = prev + gain
      }

      // Apply physical attribute decline for players past peak
      if (player.age > player.hiddenAttributes.peakAgeEnd) {
        const declineRate = player.hiddenAttributes.declineRate
        for (const attr of DECLINING_PHYSICAL_ATTRS) {
          const decline = rng.nextFloat(0.1, 0.3) * declineRate
          const prev = (result.attributeChanges[attr] as number | undefined) ?? 0
          result.attributeChanges[attr] = prev - decline
        }
      }

      // Fatigue and fitness
      result.fatigueChange += INTENSITY_FATIGUE[session.intensity]
      result.fitnessChange += INTENSITY_FITNESS[session.intensity]

      // Injury risk check
      if (session.intensity === 'intense') {
        const currentFatigue = player.fatigue + result.fatigueChange
        if (currentFatigue > 70) {
          const injuryChance = player.hiddenAttributes.injuryProneness / 200
          if (rng.next() < injuryChance) {
            result.injuryRisk = true
          }
        }
      }
    }
  }

  // Convert the map to an array of TrainingResult
  const results: TrainingResult[] = []
  for (const [playerId, data] of Object.entries(resultMap)) {
    results.push({
      playerId,
      attributeChanges: data.attributeChanges,
      fitnessChange: data.fitnessChange,
      fatigueChange: data.fatigueChange,
      injuryRisk: data.injuryRisk,
    })
  }

  return results
}

/**
 * Apply training results to players, mutating them in place.
 * Clamps fitness to 1-100, fatigue to 0-100, and all attributes to 1-99.
 */
export function applyTrainingResults(
  players: Record<string, Player>,
  results: TrainingResult[],
): void {
  for (const result of results) {
    const player = players[result.playerId]
    if (!player) continue

    // Apply attribute changes
    for (const [attr, change] of Object.entries(result.attributeChanges)) {
      const key = attr as keyof PlayerAttributes
      const current = player.attributes[key]
      player.attributes[key] = clamp(
        Math.round((current + (change as number)) * 10) / 10,
        MIN_ATTRIBUTE,
        MAX_ATTRIBUTE - 1, // cap at 99
      )
    }

    // Apply fitness and fatigue
    player.fitness = clamp(player.fitness + result.fitnessChange, 1, 100)
    player.fatigue = clamp(player.fatigue + result.fatigueChange, 0, 100)
  }
}

/**
 * Begin retraining a player at a new position.
 * Returns a fresh progress tracker starting at 0%.
 */
export function startPositionRetrain(
  playerId: string,
  targetPosition: PlayerPositionType,
  currentWeek: number = 0,
): PositionRetrainProgress {
  return {
    playerId,
    targetPosition,
    progress: 0,
    startedWeek: currentWeek,
  }
}

/**
 * Advance position retraining by one week.
 *
 * Progress gains are based on the player's agility, determination, and
 * coaching quality. When progress reaches 100, the target position is
 * added to the player's secondary positions with a base rating of 40-60.
 */
export function advancePositionRetrain(
  progress: PositionRetrainProgress,
  player: Player,
  staff: Record<string, StaffMember>,
  rng: SeededRNG,
): PositionRetrainProgress {
  if (progress.progress >= 100) return progress

  // Base weekly advance: 3-8 points
  const baseAdvance = rng.nextInt(3, 8)

  // Agility factor: 0.8 (low agility) to 1.2 (high agility)
  const agilityFactor = 0.8 + (player.attributes.agility / 100) * 0.4

  // Determination factor: 0.8 to 1.2
  const determinationFactor = 0.8 + (player.attributes.determination / 100) * 0.4

  // Coaching quality: best development rating among all staff
  const staffList = Object.values(staff)
  const bestDevRating = staffList.reduce(
    (best, s) => Math.max(best, s.ratings.development),
    50,
  )
  const coachFactor = 0.8 + (bestDevRating / 100) * 0.4

  const weeklyGain = baseAdvance * agilityFactor * determinationFactor * coachFactor
  const newProgress = Math.min(100, progress.progress + weeklyGain)

  const updatedProgress: PositionRetrainProgress = {
    ...progress,
    progress: Math.round(newProgress * 10) / 10,
  }

  // If retrain is complete, award the new position to the player
  if (updatedProgress.progress >= 100) {
    updatedProgress.progress = 100

    // Add the target position to secondary positions if not already present
    if (
      player.position.primary !== progress.targetPosition &&
      !player.position.secondary.includes(progress.targetPosition)
    ) {
      player.position.secondary.push(progress.targetPosition)
    }

    // Assign a base position rating of 40-60
    const baseRating = rng.nextInt(40, 60)
    player.position.ratings[progress.targetPosition] = baseRating
  }

  return updatedProgress
}

/**
 * Run a full preseason training block over the specified number of weeks.
 *
 * Uses a balanced moderate-intensity program to build fitness and develop
 * base attributes. Mutates all players in place.
 */
export function calculatePreseasonTraining(
  players: Record<string, Player>,
  weeks: number,
  staff: Record<string, StaffMember>,
  facilities: ClubFacilities,
  rng: SeededRNG,
): void {
  // Preseason rotation of focus areas for well-rounded development
  const preseasonRotation: TrainingFocus[] = [
    'match-fitness',
    'physical',
    'contested',
    'kicking',
    'defensive',
    'game-sense',
    'offensive',
    'mental',
  ]

  for (let week = 0; week < weeks; week++) {
    // Build 4 sessions per week, rotating through focus areas
    const sessions: TrainingSession[] = []
    for (let s = 0; s < 4; s++) {
      const focusIndex = (week * 4 + s) % preseasonRotation.length
      const focus = preseasonRotation[focusIndex]

      // Preseason uses moderate intensity throughout,
      // except last session of each week is light (recovery)
      const intensity: TrainingIntensity = s === 3 ? 'light' : 'moderate'

      sessions.push({
        id: `preseason-w${week}-s${s}`,
        focus,
        intensity,
        assignedCoachId: null,
        assignedPlayerIds: [], // whole squad
      })
    }

    const results = runTrainingSessions(players, sessions, staff, facilities, rng)
    applyTrainingResults(players, results)

    // Natural weekly fatigue recovery during preseason (players rest between weeks)
    for (const player of Object.values(players)) {
      const recoveryRate = player.attributes.recovery / 100
      const fatigueReduction = 5 + recoveryRate * 10 // 5-15 points per week
      player.fatigue = clamp(player.fatigue - fatigueReduction, 0, 100)
    }
  }
}
