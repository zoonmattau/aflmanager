import type { SeededRNG } from '@/engine/core/rng'
import type { Player, PlayerAttributes, PlayerPositionType, PlayerTrainingFocus } from '@/types/player'
import type { StaffMember, StaffRole } from '@/types/staff'
import type { ClubFacilities } from '@/types/club'
import {
  getPlayerTrainingFocusAttributeMultiplier,
  PLAYER_TRAINING_FOCUS_ATTRIBUTES,
} from '@/engine/players/trainingFocus'
import { MIN_ATTRIBUTE, MAX_ATTRIBUTE } from '@/engine/core/constants'
import { auditPlayerAttributesInPlace } from '@/engine/player/attributeAudit'
import { syncPlayerPositionRatings } from '@/engine/player/playerRating'

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
  | 'video-review'
  | 'rest'

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

export interface UpskillCompletion {
  playerId: string
  planId: string
  type: 'position' | 'skill'
  targetLabel: string
}

export interface TrainingResult {
  playerId: string
  attributeChanges: Partial<PlayerAttributes>
  fitnessChange: number
  fatigueChange: number
  injuryRisk: boolean
}

// ── Enhanced Week Planner Types ─────────────────────────────────────────────

export interface TrainingGroup {
  id: string
  focus: TrainingFocus
  intensity: TrainingIntensity
  assignedCoachId: string | null
  playerIds: string[]    // empty on remainder group
  isRemainder: boolean   // true = catches all unassigned players
}

export interface TrainingSlot {
  groups: TrainingGroup[]
}

export interface TrainingWeekPlan {
  slots: Record<string, { morning: TrainingSlot; afternoon: TrainingSlot }>
  matchDate: string | null   // YYYY-MM-DD or null for bye
}

export type FatigueTrend = 'rising' | 'falling' | 'stable'

export interface PlayerFitnessBreakdown {
  playerId: string
  fitness: number
  fatigue: number
  form: number
  endurance: number
  recoveryAttr: number
  injuryRisk: 'low' | 'moderate' | 'high'
  fatigueTrend: FatigueTrend
  weeklySessionCount: number
  weeklyIntenseCount: number
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
  'video-review': ['disposalDecision', 'positioning', 'anticipation', 'composure', 'consistency', 'teamPlayer'],
  rest: [],
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
  'video-review': 'head-coach',
  rest: 'strength-conditioning',
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

/**
 * Fatigue overrides for non-physical sessions.
 * Recovery and rest reduce fatigue; video-review barely affects it.
 */
const FOCUS_FATIGUE_OVERRIDE: Partial<Record<TrainingFocus, Record<TrainingIntensity, number>>> = {
  recovery:       { light: -12, moderate: -6, intense: -2 },
  rest:           { light: -16, moderate: -12, intense: -8 },
  'video-review': { light: 1,   moderate: 2,  intense: 3  },
}

/**
 * Fitness overrides for non-physical sessions.
 * Recovery sessions actively restore fitness; video-review provides none.
 */
const FOCUS_FITNESS_OVERRIDE: Partial<Record<TrainingFocus, Record<TrainingIntensity, number>>> = {
  recovery:       { light: 4, moderate: 6, intense: 3 },
  rest:           { light: 2, moderate: 2, intense: 1 },
  'video-review': { light: 0, moderate: 0, intense: 0 },
}

const POSITION_UPSKILL_FOCUS: Record<PlayerPositionType, TrainingFocus[]> = {
  BP: ['defensive', 'contested', 'marking'],
  FB: ['defensive', 'marking', 'contested'],
  HBF: ['defensive', 'kicking', 'game-sense'],
  CHB: ['defensive', 'marking', 'contested'],
  W: ['match-fitness', 'kicking', 'game-sense'],
  IM: ['contested', 'match-fitness', 'game-sense'],
  OM: ['kicking', 'game-sense', 'match-fitness'],
  RK: ['ruck', 'contested', 'match-fitness'],
  HFF: ['offensive', 'kicking', 'match-fitness'],
  CHF: ['offensive', 'marking', 'contested'],
  FP: ['offensive', 'kicking', 'match-fitness'],
  FF: ['offensive', 'marking', 'kicking'],
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
  budgetMultiplier?: number,
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

    // Rest session: recover fatigue, small fitness gain, no attribute work
    if (session.focus === 'rest') {
      for (const playerId of participantIds) {
        const player = players[playerId]
        if (!player) continue
        if (player.injury) continue
        ensureResult(playerId)
        const result = resultMap[playerId]
        result.fatigueChange -= 8
        result.fitnessChange += 3
      }
      continue
    }

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
          getPlayerTrainingFocusAttributeMultiplier(player.trainingFocus, attr) *
          ceilingDiminish *
          (budgetMultiplier ?? 1)

        const prev = (result.attributeChanges[attr] as number | undefined) ?? 0
        result.attributeChanges[attr] = prev + gain
      }

      // Apply physical attribute decline for players past peak
      // Skip during rest/recovery — not stressing the body
      const isRestorative = session.focus === 'recovery'
      if (!isRestorative && player.age > player.hiddenAttributes.peakAgeEnd) {
        const declineRate = player.hiddenAttributes.declineRate
        for (const attr of DECLINING_PHYSICAL_ATTRS) {
          const focusMultiplier = getPlayerTrainingFocusAttributeMultiplier(
            player.trainingFocus,
            attr,
            0.92,
            1.05,
          )
          const decline = rng.nextFloat(0.1, 0.3) * declineRate * focusMultiplier
          const prev = (result.attributeChanges[attr] as number | undefined) ?? 0
          result.attributeChanges[attr] = prev - decline
        }
      }

      // Fatigue and fitness — use focus-specific overrides for recovery/rest/video-review
      const fatigueOverride = FOCUS_FATIGUE_OVERRIDE[session.focus]
      const fitnessOverride = FOCUS_FITNESS_OVERRIDE[session.focus]
      result.fatigueChange += fatigueOverride
        ? fatigueOverride[session.intensity]
        : INTENSITY_FATIGUE[session.intensity]
      result.fitnessChange += fitnessOverride
        ? fitnessOverride[session.intensity]
        : INTENSITY_FITNESS[session.intensity]

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
    auditPlayerAttributesInPlace(player, { stage: 'progression' })
  }
}

function getBestDevelopmentCoachFactor(staff: Record<string, StaffMember>): number {
  const staffList = Object.values(staff)
  if (staffList.length === 0) return 0.85
  const bestDev = staffList.reduce((best, s) => Math.max(best, s.ratings.development), 50)
  return clamp(0.8 + (bestDev / 100) * 0.4, 0.85, 1.25)
}

function getAgeUpskillFactor(age: number): number {
  if (age <= 20) return 1.18
  if (age <= 24) return 1.08
  if (age <= 28) return 1
  if (age <= 32) return 0.9
  return 0.78
}

function getConditionUpskillFactor(player: Player): number {
  if (player.injury) return 0.35
  const fitnessFactor = clamp(player.fitness / 100, 0.55, 1.05)
  const fatigueFactor = clamp(1 - player.fatigue / 120, 0.45, 1)
  return fitnessFactor * fatigueFactor
}

function getSkillSessionRelevance(
  sessions: TrainingSession[],
  targetSkill: PlayerTrainingFocus,
): number {
  if (sessions.length === 0) return 0.85
  const skillAttrs = PLAYER_TRAINING_FOCUS_ATTRIBUTES[targetSkill]
  if (!skillAttrs || skillAttrs.length === 0) return 1

  let weightedOverlap = 0
  let totalWeight = 0
  for (const session of sessions) {
    const attrs = FOCUS_ATTRIBUTES[session.focus]
    const overlap = attrs.filter((a) => skillAttrs.includes(a)).length
    const overlapRatio = overlap / Math.max(1, skillAttrs.length)
    const intensityWeight = INTENSITY_MULTIPLIER[session.intensity]
    weightedOverlap += overlapRatio * intensityWeight
    totalWeight += intensityWeight
  }
  const averageOverlap = totalWeight > 0 ? weightedOverlap / totalWeight : 0
  return clamp(0.8 + averageOverlap * 1.1, 0.8, 1.4)
}

function getPositionSessionRelevance(
  sessions: TrainingSession[],
  targetPosition: PlayerPositionType,
): number {
  if (sessions.length === 0) return 0.85
  const preferredFocuses = POSITION_UPSKILL_FOCUS[targetPosition]
  const weightedTotal = sessions.reduce((sum, s) => sum + INTENSITY_MULTIPLIER[s.intensity], 0)
  const weightedMatches = sessions
    .filter((s) => preferredFocuses.includes(s.focus))
    .reduce((sum, s) => sum + INTENSITY_MULTIPLIER[s.intensity], 0)
  const ratio = weightedTotal > 0 ? weightedMatches / weightedTotal : 0
  return clamp(0.78 + ratio * 0.8, 0.78, 1.4)
}

function applyPositionUpskillCompletion(
  player: Player,
  targetPosition: PlayerPositionType,
  rng: SeededRNG,
): void {
  if (!Array.isArray(player.position.secondary)) {
    player.position.secondary = []
  }
  if (
    player.position.primary !== targetPosition &&
    !player.position.secondary.includes(targetPosition)
  ) {
    player.position.secondary.push(targetPosition)
  }
  const currentRating = player.position.ratings[targetPosition] ?? 0
  const nextRating = currentRating > 0
    ? currentRating + rng.nextInt(6, 14)
    : rng.nextInt(45, 62)
  player.position.ratings[targetPosition] = clamp(nextRating, MIN_ATTRIBUTE, MAX_ATTRIBUTE - 1)
  syncPlayerPositionRatings(player)
}

function applySkillUpskillCompletion(
  player: Player,
  targetSkill: PlayerTrainingFocus,
  coachingFactor: number,
  rng: SeededRNG,
): void {
  const skillAttrs = PLAYER_TRAINING_FOCUS_ATTRIBUTES[targetSkill]
  const devRate = clamp(player.hiddenAttributes.developmentRate, 0.55, 2)
  for (const attr of skillAttrs) {
    const current = player.attributes[attr]
    const gain = rng.nextFloat(0.5, 1.7) * coachingFactor * devRate * 0.55
    player.attributes[attr] = clamp(
      Math.round((current + gain) * 10) / 10,
      MIN_ATTRIBUTE,
      MAX_ATTRIBUTE - 1,
    )
  }
  auditPlayerAttributesInPlace(player, { stage: 'progression' })
  syncPlayerPositionRatings(player)
}

/**
 * Advance all active upskill plans for a club by one simulated week.
 * Mutates players in place and returns any plans completed this week.
 */
export function advanceClubUpskilling(
  players: Record<string, Player>,
  sessions: TrainingSession[],
  staff: Record<string, StaffMember>,
  rng: SeededRNG,
  currentRound: number,
  currentDate: string,
): UpskillCompletion[] {
  const completions: UpskillCompletion[] = []
  const coachingFactor = getBestDevelopmentCoachFactor(staff)

  for (const player of Object.values(players)) {
    const plans = player.upskillPlans ?? []
    if (plans.length === 0) continue

    const ageFactor = getAgeUpskillFactor(player.age)
    const conditionFactor = getConditionUpskillFactor(player)
    const determinationFactor = clamp(0.75 + player.attributes.determination / 250, 0.8, 1.15)

    for (const plan of plans) {
      if (plan.status !== 'active' || plan.progress >= 100) continue

      let relevance = 1
      let targetLabel = ''
      if (plan.type === 'position' && plan.targetPosition) {
        relevance = getPositionSessionRelevance(sessions, plan.targetPosition)
        targetLabel = plan.targetPosition
      } else if (plan.type === 'skill' && plan.targetSkill) {
        relevance = getSkillSessionRelevance(sessions, plan.targetSkill)
        targetLabel = plan.targetSkill
      } else {
        continue
      }

      const baseGain = rng.nextFloat(4.8, 9.8)
      const gain = baseGain * coachingFactor * ageFactor * conditionFactor * determinationFactor * relevance
      plan.progress = Math.min(100, Math.round((plan.progress + gain) * 10) / 10)
      plan.updatedDate = currentDate

      if (plan.progress >= 100) {
        plan.progress = 100
        plan.status = 'completed'
        plan.completedDate = currentDate

        if (plan.type === 'position' && plan.targetPosition) {
          applyPositionUpskillCompletion(player, plan.targetPosition, rng)
        } else if (plan.type === 'skill' && plan.targetSkill) {
          applySkillUpskillCompletion(player, plan.targetSkill, coachingFactor, rng)
        }

        completions.push({
          playerId: player.id,
          planId: plan.id,
          type: plan.type,
          targetLabel,
        })
      }
    }

    if (!player.upskillPlans) player.upskillPlans = plans
    for (const plan of plans) {
      if (!plan.startedRound && plan.startedRound !== 0) {
        plan.startedRound = currentRound
      }
    }
  }

  return completions
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

// ── Enhanced Week Planner Functions ─────────────────────────────────────────

let groupCounter = 0

/** Create a single remainder group with the given focus and intensity. */
export function createDefaultGroup(
  focus: TrainingFocus,
  intensity: TrainingIntensity,
): TrainingGroup {
  return {
    id: `grp-${++groupCounter}-${Date.now()}`,
    focus,
    intensity,
    assignedCoachId: null,
    playerIds: [],
    isRemainder: true,
  }
}

/**
 * Generate a sensible default TrainingWeekPlan for a Mon-Sun week.
 * @param weekDates - 7 YYYY-MM-DD strings (Mon through Sun)
 * @param matchDate - YYYY-MM-DD of the match day, or null for bye week
 */
export function getDefaultTrainingWeekPlan(
  weekDates: string[],
  matchDate: string | null,
): TrainingWeekPlan {
  const focusRotation: TrainingFocus[] = [
    'contested', 'kicking', 'defensive', 'offensive', 'game-sense', 'physical', 'mental',
  ]
  let rotIndex = 0

  const slots: TrainingWeekPlan['slots'] = {}

  for (const date of weekDates) {
    const isMatchDay = matchDate !== null && date === matchDate
    const dayBefore = matchDate !== null && weekDates.indexOf(date) >= 0 &&
      (() => {
        const d1 = new Date(date + 'T00:00:00')
        const dm = new Date(matchDate + 'T00:00:00')
        return dm.getTime() - d1.getTime() === 86400000
      })()
    const dayAfter = matchDate !== null &&
      (() => {
        const d1 = new Date(date + 'T00:00:00')
        const dm = new Date(matchDate + 'T00:00:00')
        return d1.getTime() - dm.getTime() === 86400000
      })()

    if (isMatchDay) {
      // Match day: empty slots
      slots[date] = {
        morning: { groups: [] },
        afternoon: { groups: [] },
      }
    } else if (dayBefore) {
      // Game eve: light match-fitness AM, rest PM
      slots[date] = {
        morning: { groups: [createDefaultGroup('match-fitness', 'light')] },
        afternoon: { groups: [] },
      }
    } else if (dayAfter) {
      // Recovery + video review day (typically Monday after a game)
      slots[date] = {
        morning: { groups: [createDefaultGroup('recovery', 'light')] },
        afternoon: { groups: [createDefaultGroup('video-review', 'light')] },
      }
    } else {
      // Normal training day
      const amFocus = focusRotation[rotIndex % focusRotation.length]
      rotIndex++
      slots[date] = {
        morning: { groups: [createDefaultGroup(amFocus, 'moderate')] },
        afternoon: { groups: [createDefaultGroup('recovery', 'light')] },
      }
    }
  }

  return { slots, matchDate }
}

/**
 * Flatten a TrainingWeekPlan into TrainingSession[] for runTrainingSessions().
 * Each group becomes one session. Remainder groups get assignedPlayerIds: []
 * (engine treats as whole squad).
 */
export function weekPlanToSessions(plan: TrainingWeekPlan): TrainingSession[] {
  const sessions: TrainingSession[] = []
  let counter = 0

  for (const daySlots of Object.values(plan.slots)) {
    for (const slotKey of ['morning', 'afternoon'] as const) {
      const slot = daySlots[slotKey]
      for (const group of slot.groups) {
        sessions.push({
          id: `wp-${counter++}`,
          focus: group.focus,
          intensity: group.intensity,
          assignedCoachId: group.assignedCoachId,
          assignedPlayerIds: group.isRemainder ? [] : group.playerIds,
        })
      }
    }
  }

  return sessions
}

/** Compare fatigue vs fitness ratio and recovery attribute to determine trend. */
export function computeFatigueTrend(player: Player): FatigueTrend {
  const fatigueRatio = player.fatigue / Math.max(player.fitness, 1)
  const recoveryFactor = player.attributes.recovery / 100

  // High fatigue relative to fitness and low recovery = rising
  if (fatigueRatio > 0.7 && recoveryFactor < 0.5) return 'rising'
  if (fatigueRatio > 0.5) return 'stable'
  return 'falling'
}

/** Count how many sessions (total and intense) a player has in a given plan. */
export function countPlayerSessions(
  plan: TrainingWeekPlan,
  playerId: string,
): { total: number; intense: number } {
  let total = 0
  let intense = 0

  for (const daySlots of Object.values(plan.slots)) {
    for (const slotKey of ['morning', 'afternoon'] as const) {
      const slot = daySlots[slotKey]
      for (const group of slot.groups) {
        const participates = group.isRemainder || group.playerIds.includes(playerId)
        if (participates) {
          total++
          if (group.intensity === 'intense') intense++
        }
      }
    }
  }

  return { total, intense }
}

/** Build enhanced fitness breakdown data for each player. */
export function buildFitnessBreakdown(
  players: Player[],
  plan: TrainingWeekPlan | null,
): PlayerFitnessBreakdown[] {
  return players.map((player) => {
    const sessionCounts = plan ? countPlayerSessions(plan, player.id) : { total: 0, intense: 0 }
    const injuryProneness = player.hiddenAttributes.injuryProneness

    let injuryRisk: 'low' | 'moderate' | 'high' = 'low'
    if (injuryProneness > 66) injuryRisk = 'high'
    else if (injuryProneness > 33) injuryRisk = 'moderate'

    return {
      playerId: player.id,
      fitness: player.fitness,
      fatigue: player.fatigue,
      form: player.form,
      endurance: player.attributes.endurance,
      recoveryAttr: player.attributes.recovery,
      injuryRisk,
      fatigueTrend: computeFatigueTrend(player),
      weeklySessionCount: sessionCounts.total,
      weeklyIntenseCount: sessionCounts.intense,
    }
  })
}
