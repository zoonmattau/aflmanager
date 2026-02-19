import type {
  Club,
  ClubMembershipState,
  MembershipTierConfig,
  MembershipTierState,
} from '@/types/club'
import type { Player } from '@/types/player'
import { getPlayerStarRating } from '@/engine/player/playerRating'

// ---------------------------------------------------------------------------
// Tier configuration
// ---------------------------------------------------------------------------

export const TIER_CONFIGS: MembershipTierConfig[] = [
  {
    id: 'reserved-seat',
    label: 'Reserved Seat',
    description: 'Guaranteed seat at every home game in a reserved section.',
    basePrice: 420,
    minPrice: 250,
    maxPrice: 700,
  },
  {
    id: 'general-admission',
    label: 'General Admission',
    description: 'Entry to all home games — general admission areas.',
    basePrice: 220,
    minPrice: 120,
    maxPrice: 400,
  },
  {
    id: 'interstate',
    label: 'Interstate',
    description: 'Discounted membership for fans based outside Victoria/home state.',
    basePrice: 150,
    minPrice: 80,
    maxPrice: 280,
  },
  {
    id: 'digital',
    label: 'Digital / Social',
    description: 'Digital-only membership: exclusive content, early access and loyalty rewards.',
    basePrice: 60,
    minPrice: 30,
    maxPrice: 120,
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Family pack — 2 adults + 2 children, general admission.',
    basePrice: 380,
    minPrice: 200,
    maxPrice: 650,
  },
  {
    id: 'premium',
    label: 'Premium / Corporate',
    description: 'Premium hospitality package with premium seating and catering.',
    basePrice: 1200,
    minPrice: 800,
    maxPrice: 2500,
  },
]

// Proportional split of total members across tiers (must sum to 1.0)
const TIER_PROPORTIONS: Record<string, number> = {
  'reserved-seat': 0.20,
  'general-admission': 0.45,
  'interstate': 0.10,
  'digital': 0.12,
  'family': 0.08,
  'premium': 0.05,
}

// Base churn rate per off-season
const BASE_CHURN_RATE = 0.08

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Baseline acquisition pool multiplier by ladder position (1 → 0.20, 18 → 0.03). */
function acquisitionPoolRate(ladderPosition: number): number {
  // Linear interpolation: pos 1 = 0.20, pos 18 = 0.03
  const t = (ladderPosition - 1) / 17
  return 0.20 - (0.20 - 0.03) * t
}

/** Campaign spend → acquisition multiplier (logarithmic, capped at 2×). */
function campaignMultiplier(budget: number): number {
  if (budget <= 0) return 0.5
  // $50k → ~1.0×, $500k → ~2.0×
  return Math.min(2.0, 0.5 + (Math.log10(budget / 10_000)) * 0.55)
}

/** Star player count → bonus multiplier (1.0 to 1.3). */
function starBonus(starCount: number): number {
  return Math.min(1.3, 1.0 + starCount * 0.05)
}

/** Price index → elasticity modifier (higher price = lower acquisition, more churn). */
function priceElasticity(priceIndex: number): number {
  // priceIndex = avg price / baseline avg price; 1.0 = neutral
  return Math.max(0.5, 1.0 - (priceIndex - 1.0) * 0.6)
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export interface MembershipGrowthResult {
  newTotal: number
  delta: number
  churnCount: number
  acquisitions: number
  fanSatisfactionDelta: number
}

export interface MembershipGrowthInputs {
  currentTotal: number
  fanSatisfaction: number        // 0-100
  ladderPosition: number         // 1-18
  starPlayerCount: number
  campaignBudget: number
  trendLastSeason: number
  priceIndex: number             // avg price / baseline avg
}

/**
 * Calculate membership growth and churn for the off-season.
 */
export function calculateMembershipGrowth(inputs: MembershipGrowthInputs): MembershipGrowthResult {
  const {
    currentTotal,
    fanSatisfaction,
    ladderPosition,
    starPlayerCount,
    campaignBudget,
    priceIndex,
  } = inputs

  const pe = priceElasticity(priceIndex)
  const sentimentFactor = fanSatisfaction / 50  // 1.0 at satisfaction=50

  // Churn
  const churnRate = BASE_CHURN_RATE * pe * (2 - sentimentFactor)
  const churnCount = Math.round(currentTotal * Math.min(0.25, Math.max(0, churnRate)))

  // Acquisition pool: fraction of current base who might join
  const poolRate = acquisitionPoolRate(ladderPosition)
  const sb = starBonus(starPlayerCount)
  const cm = campaignMultiplier(campaignBudget)
  const acquisitions = Math.round(currentTotal * poolRate * (sentimentFactor) * sb * cm * pe)

  const delta = acquisitions - churnCount
  const newTotal = Math.max(0, currentTotal + delta)

  // Fan satisfaction naturally trends toward 50 + small randomness
  const fanSatisfactionDelta = (50 - fanSatisfaction) * 0.1

  return {
    newTotal,
    delta,
    churnCount,
    acquisitions,
    fanSatisfactionDelta,
  }
}

/**
 * Distribute a membership total delta across tiers proportionally.
 */
export function distributeMembershipDelta(
  tiers: MembershipTierState[],
  delta: number,
): MembershipTierState[] {
  const totalCurrent = tiers.reduce((s, t) => s + t.count, 0)

  return tiers.map((tier) => {
    const weight = totalCurrent > 0 ? tier.count / totalCurrent : TIER_PROPORTIONS[tier.tierId] ?? (1 / tiers.length)
    const change = Math.round(delta * weight)
    const newCount = Math.max(0, tier.count + change)
    return { ...tier, lastSeasonCount: tier.count, count: newCount }
  })
}

/**
 * Calculate total membership revenue from all tiers.
 */
export function calculateTierMembershipRevenue(tiers: MembershipTierState[]): number {
  return tiers.reduce((sum, tier) => sum + tier.price * tier.count, 0)
}

/** Baseline average price across all tier configs */
const BASELINE_AVG_PRICE = TIER_CONFIGS.reduce((sum, c) => {
  const proportion = TIER_PROPORTIONS[c.id] ?? 0
  return sum + c.basePrice * proportion
}, 0)

/**
 * Compute the price index (average price / baseline average price).
 */
export function computePriceIndex(tiers: MembershipTierState[]): number {
  const totalCount = tiers.reduce((s, t) => s + t.count, 0)
  if (totalCount === 0) return 1.0
  const weightedAvg = tiers.reduce((s, t) => s + t.price * t.count, 0) / totalCount
  return weightedAvg / BASELINE_AVG_PRICE
}

/**
 * Project next season membership across low / base / high scenarios.
 */
export function projectNextSeasonMembership(
  state: ClubMembershipState,
  ladderPosition: number,
  starCount: number,
): { low: number; mid: number; high: number } {
  const currentTotal = state.tiers.reduce((s, t) => s + t.count, 0)
  const pi = computePriceIndex(state.tiers)

  const base: MembershipGrowthInputs = {
    currentTotal,
    fanSatisfaction: state.fanSatisfaction,
    ladderPosition,
    starPlayerCount: starCount,
    campaignBudget: state.campaignBudget,
    trendLastSeason: state.trendLastSeason,
    priceIndex: pi,
  }

  const midResult = calculateMembershipGrowth(base)
  const lowResult = calculateMembershipGrowth({ ...base, fanSatisfaction: Math.max(0, state.fanSatisfaction - 20) })
  const highResult = calculateMembershipGrowth({ ...base, fanSatisfaction: Math.min(100, state.fanSatisfaction + 20) })

  return {
    low: Math.max(0, lowResult.newTotal),
    mid: Math.max(0, midResult.newTotal),
    high: Math.max(0, highResult.newTotal),
  }
}

/**
 * Update fan satisfaction based on season results.
 */
export function updateMembershipFanSatisfaction(
  current: number,
  ladderPosition: number,
  wonPremier: boolean,
  keySignings: number,
  keyDepartures: number,
): number {
  let delta = 0
  if (wonPremier) delta += 20
  else if (ladderPosition <= 4) delta += 10
  else if (ladderPosition >= 15) delta -= 15
  else if (ladderPosition >= 12) delta -= 5

  delta += keySignings * 2
  delta -= keyDepartures * 3

  return Math.max(0, Math.min(100, current + delta))
}

/**
 * Run end-of-season membership processing: apply growth/churn, update history.
 */
export function processSeasonEndMembership(
  state: ClubMembershipState,
  year: number,
  ladderPosition: number,
  starCount: number,
): ClubMembershipState {
  const currentTotal = state.tiers.reduce((s, t) => s + t.count, 0)
  const pi = computePriceIndex(state.tiers)

  const result = calculateMembershipGrowth({
    currentTotal,
    fanSatisfaction: state.fanSatisfaction,
    ladderPosition,
    starPlayerCount: starCount,
    campaignBudget: state.campaignBudget,
    trendLastSeason: state.trendLastSeason,
    priceIndex: pi,
  })

  const updatedTiers = distributeMembershipDelta(state.tiers, result.delta)
  const revenue = calculateTierMembershipRevenue(updatedTiers)
  const newTotal = updatedTiers.reduce((s, t) => s + t.count, 0)

  // Natural fan satisfaction drift
  const newFanSatisfaction = Math.max(0, Math.min(100, state.fanSatisfaction + result.fanSatisfactionDelta))

  return {
    ...state,
    tiers: updatedTiers,
    trendLastSeason: result.delta,
    fanSatisfaction: newFanSatisfaction,
    history: [
      ...state.history,
      { year, total: newTotal, revenue },
    ],
  }
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

/** Total base membership by club tier band (top-4 / mid / bottom-4). */
function baseTotalForPosition(ladderPosition: number): number {
  if (ladderPosition <= 4) return 45_000
  if (ladderPosition <= 14) return 28_000
  return 16_000
}

/**
 * Count players with a star rating >= threshold (default 4) for a club.
 */
export function getPlayerStarRatingCountForClub(
  players: Record<string, Player>,
  clubId: string,
  threshold = 4,
): number {
  return Object.values(players).filter(
    (p) => p.clubId === clubId && getPlayerStarRating(p) >= threshold,
  ).length
}

/**
 * Create the initial ClubMembershipState for a club at game start.
 */
export function createInitialMembershipState(
  _club: Club,
  ladderPosition: number,
): ClubMembershipState {
  const total = baseTotalForPosition(ladderPosition)

  const tiers: MembershipTierState[] = TIER_CONFIGS.map((config) => {
    const proportion = TIER_PROPORTIONS[config.id] ?? 0
    const count = Math.round(total * proportion)
    return {
      tierId: config.id,
      price: config.basePrice,
      count,
      lastSeasonCount: count,
    }
  })

  return {
    tiers,
    campaignBudget: 50_000,
    seasonTarget: total + 2_000,
    fanSatisfaction: 50,
    trendLastSeason: 0,
    history: [],
  }
}
