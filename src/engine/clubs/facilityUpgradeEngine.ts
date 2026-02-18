import type { Club, ClubFacilities } from '@/types/club'
import type {
  ApprovalFactor,
  FacilityUpgradeRequest,
  FacilityUpgradeTracker,
} from '@/types/facilityUpgrade'
import type { SeededRNG } from '@/engine/core/rng'
import { FacilityUpgradeCost, FacilityConstructionWeeks } from './clubManagement'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FACILITY_LEVEL = 5
const DENIAL_COOLDOWN_DAYS = 14
const AI_UPGRADE_CHANCE_PER_ROUND = 0.05

const FACILITY_KEYS: (keyof ClubFacilities)[] = [
  'trainingGround',
  'gym',
  'medicalCentre',
  'recoveryPool',
  'analysisSuite',
  'youthAcademy',
]

/** Facilities that benefit "rebuilding" / youth-focused strategies. */
const YOUTH_FACILITIES: ReadonlySet<keyof ClubFacilities> = new Set([
  'youthAcademy',
  'analysisSuite',
])

/** Facilities that benefit "win-now" / performance strategies. */
const PERFORMANCE_FACILITIES: ReadonlySet<keyof ClubFacilities> = new Set([
  'trainingGround',
  'gym',
  'medicalCentre',
  'recoveryPool',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function getUpgradeCost(currentLevel: number): number {
  return FacilityUpgradeCost[currentLevel + 1] ?? 0
}

function getConstructionWeeks(targetLevel: number): number {
  return FacilityConstructionWeeks[targetLevel] ?? 4
}

// ---------------------------------------------------------------------------
// computeApprovalProbability
// ---------------------------------------------------------------------------

export function computeApprovalProbability(
  club: Club,
  facility: keyof ClubFacilities,
  cost: number,
  jobSecurity: number,
  ladderPosition: number,
): { probability: number; factors: ApprovalFactor[] } {
  const factors: ApprovalFactor[] = []
  let probability = 70

  factors.push({ label: 'Base probability', modifier: 70 })

  // Financial health: balance/cost ratio
  const ratio = club.finances.balance / Math.max(1, cost)
  if (ratio < 1) {
    return { probability: 0, factors: [{ label: 'Insufficient funds', modifier: -100 }] }
  } else if (ratio >= 3) {
    factors.push({ label: 'Strong financial position', modifier: 10 })
    probability += 10
  } else if (ratio >= 2) {
    factors.push({ label: 'Healthy finances', modifier: 5 })
    probability += 5
  } else {
    factors.push({ label: 'Tight budget', modifier: 0 })
  }

  // Job security influence: (jobSecurity - 50) * 0.3
  const securityMod = Math.round((jobSecurity - 50) * 0.3)
  if (securityMod !== 0) {
    factors.push({
      label: securityMod > 0 ? 'Board confidence in management' : 'Board lacks confidence',
      modifier: securityMod,
    })
    probability += securityMod
  }

  // Competitive window alignment
  const competitiveWindow = club.aiPersonality?.competitiveWindow ?? 'balanced'
  if (competitiveWindow === 'rebuilding' && YOUTH_FACILITIES.has(facility)) {
    factors.push({ label: 'Aligns with rebuild strategy', modifier: 5 })
    probability += 5
  } else if (competitiveWindow === 'rebuilding' && PERFORMANCE_FACILITIES.has(facility)) {
    factors.push({ label: 'Misaligned with rebuild strategy', modifier: -5 })
    probability -= 5
  } else if (competitiveWindow === 'win-now' && PERFORMANCE_FACILITIES.has(facility)) {
    factors.push({ label: 'Aligns with win-now strategy', modifier: 5 })
    probability += 5
  } else if (competitiveWindow === 'win-now' && YOUTH_FACILITIES.has(facility)) {
    factors.push({ label: 'Misaligned with win-now strategy', modifier: -5 })
    probability -= 5
  }

  // Facility need: if this is the club's lowest-level facility, +5%
  const currentLevel = club.facilities[facility]
  const minLevel = Math.min(...FACILITY_KEYS.map((k) => club.facilities[k]))
  if (currentLevel === minLevel) {
    factors.push({ label: 'Addresses weakest facility', modifier: 5 })
    probability += 5
  }

  // Higher ladder = more board willingness
  if (ladderPosition <= 4) {
    factors.push({ label: 'Strong ladder position', modifier: 5 })
    probability += 5
  } else if (ladderPosition >= 15) {
    factors.push({ label: 'Poor ladder position', modifier: -5 })
    probability -= 5
  }

  probability = clamp(probability, 10, 95)

  return { probability, factors }
}

// ---------------------------------------------------------------------------
// canRequestUpgrade
// ---------------------------------------------------------------------------

export function canRequestUpgrade(
  tracker: FacilityUpgradeTracker,
  club: Club,
  facility: keyof ClubFacilities,
  currentDate: string,
): { allowed: boolean; reason: string; cost: number } {
  const currentLevel = club.facilities[facility]

  if (currentLevel >= MAX_FACILITY_LEVEL) {
    return { allowed: false, reason: 'Facility is already at maximum level', cost: 0 }
  }

  const cost = getUpgradeCost(currentLevel)

  // Check for active construction for this club (max 1 concurrent)
  if (tracker.activeConstructionByClub[club.id]) {
    return { allowed: false, reason: 'Another construction project is already in progress', cost }
  }

  // Check denial cooldown
  const cooldownKey = `${club.id}:${facility}`
  const cooldownExpiry = tracker.denialCooldowns[cooldownKey]
  if (cooldownExpiry && currentDate < cooldownExpiry) {
    return {
      allowed: false,
      reason: `Board denied this upgrade recently. Cooldown expires ${cooldownExpiry}`,
      cost,
    }
  }

  if (club.finances.balance < cost) {
    return {
      allowed: false,
      reason: `Insufficient funds: need $${cost.toLocaleString()} but only $${club.finances.balance.toLocaleString()} available`,
      cost,
    }
  }

  return { allowed: true, reason: 'Upgrade available', cost }
}

// ---------------------------------------------------------------------------
// requestFacilityUpgrade
// ---------------------------------------------------------------------------

export function requestFacilityUpgrade(
  tracker: FacilityUpgradeTracker,
  club: Club,
  facility: keyof ClubFacilities,
  probability: number,
  rng: SeededRNG,
  currentDate: string,
): { updatedTracker: FacilityUpgradeTracker; request: FacilityUpgradeRequest; approved: boolean } {
  const currentLevel = club.facilities[facility]
  const toLevel = currentLevel + 1
  const cost = getUpgradeCost(currentLevel)
  const roll = rng.nextFloat(0, 100)
  const approved = roll < probability

  const request: FacilityUpgradeRequest = {
    id: crypto.randomUUID(),
    clubId: club.id,
    facility,
    fromLevel: currentLevel,
    toLevel,
    cost,
    status: approved ? 'under-construction' : 'denied',
    requestedDate: currentDate,
    approvalProbability: probability,
    constructionWeeksTotal: approved ? getConstructionWeeks(toLevel) : 0,
    constructionWeeksRemaining: approved ? getConstructionWeeks(toLevel) : 0,
    startedDate: approved ? currentDate : undefined,
    denialReason: approved
      ? undefined
      : 'The board has decided not to proceed with this upgrade at this time.',
  }

  const updatedTracker: FacilityUpgradeTracker = {
    requests: [...tracker.requests, request],
    activeConstructionByClub: { ...tracker.activeConstructionByClub },
    denialCooldowns: { ...tracker.denialCooldowns },
  }

  if (approved) {
    updatedTracker.activeConstructionByClub[club.id] = request.id
  } else {
    const cooldownKey = `${club.id}:${facility}`
    updatedTracker.denialCooldowns[cooldownKey] = addDaysISO(currentDate, DENIAL_COOLDOWN_DAYS)
  }

  return { updatedTracker, request, approved }
}

// ---------------------------------------------------------------------------
// tickFacilityUpgrades
// ---------------------------------------------------------------------------

export function tickFacilityUpgrades(
  tracker: FacilityUpgradeTracker,
  daysFraction: number,
  currentDate: string,
): { updatedTracker: FacilityUpgradeTracker; completedUpgrades: FacilityUpgradeRequest[] } {
  const completedUpgrades: FacilityUpgradeRequest[] = []
  const updatedRequests = [...tracker.requests]
  const activeByClub = { ...tracker.activeConstructionByClub }

  for (const [clubId, requestId] of Object.entries(activeByClub)) {
    const idx = updatedRequests.findIndex((r) => r.id === requestId)
    if (idx === -1) continue

    const req = { ...updatedRequests[idx] }
    req.constructionWeeksRemaining -= daysFraction / 7

    if (req.constructionWeeksRemaining <= 0) {
      req.constructionWeeksRemaining = 0
      req.status = 'completed'
      req.completedDate = currentDate
      delete activeByClub[clubId]
      completedUpgrades.push(req)
    }

    updatedRequests[idx] = req
  }

  return {
    updatedTracker: {
      requests: updatedRequests,
      activeConstructionByClub: activeByClub,
      denialCooldowns: tracker.denialCooldowns,
    },
    completedUpgrades,
  }
}

// ---------------------------------------------------------------------------
// tickAIFacilityUpgrades
// ---------------------------------------------------------------------------

export function tickAIFacilityUpgrades(
  tracker: FacilityUpgradeTracker,
  clubs: Record<string, Club>,
  playerClubId: string,
  rng: SeededRNG,
  currentDate: string,
): FacilityUpgradeTracker {
  let current = tracker

  for (const [clubId, club] of Object.entries(clubs)) {
    // Skip player's club
    if (clubId === playerClubId) continue
    // Skip clubs already under construction
    if (current.activeConstructionByClub[clubId]) continue
    // ~5% chance per round to attempt an upgrade
    if (!rng.chance(AI_UPGRADE_CHANCE_PER_ROUND)) continue

    // Pick the lowest-level facility
    let lowestKey: keyof ClubFacilities = FACILITY_KEYS[0]
    let lowestLevel = club.facilities[lowestKey]
    for (const key of FACILITY_KEYS) {
      if (club.facilities[key] < lowestLevel) {
        lowestKey = key
        lowestLevel = club.facilities[key]
      }
    }

    if (lowestLevel >= MAX_FACILITY_LEVEL) continue

    const cost = getUpgradeCost(lowestLevel)
    // Deterministic approval: balance > 2x cost
    if (club.finances.balance < cost * 2) continue

    const toLevel = lowestLevel + 1
    const request: FacilityUpgradeRequest = {
      id: crypto.randomUUID(),
      clubId,
      facility: lowestKey,
      fromLevel: lowestLevel,
      toLevel,
      cost,
      status: 'under-construction',
      requestedDate: currentDate,
      approvalProbability: 100,
      constructionWeeksTotal: getConstructionWeeks(toLevel),
      constructionWeeksRemaining: getConstructionWeeks(toLevel),
      startedDate: currentDate,
    }

    current = {
      requests: [...current.requests, request],
      activeConstructionByClub: {
        ...current.activeConstructionByClub,
        [clubId]: request.id,
      },
      denialCooldowns: current.denialCooldowns,
    }

    // Deduct cost from AI club balance (caller must apply this to club state)
    club.finances.balance -= cost
  }

  return current
}
