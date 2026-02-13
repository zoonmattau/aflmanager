import type { Club, ClubFacilities } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FacilityImpact {
  trainingBonus: number
  injuryReduction: number
  recoveryBonus: number
  developmentBonus: number
  analysisBonus: number
  youthBonus: number
}

export interface RevenueBreakdown {
  matchDay: number
  membership: number
  sponsorship: number
  broadcasting: number
  merchandise: number
  total: number
}

export interface ExpenseBreakdown {
  playerSalaries: number
  staffSalaries: number
  facilityMaintenance: number
  operations: number
  total: number
}

export interface BoardExpectation {
  type: 'finals' | 'top4' | 'premiership' | 'improvement' | 'development'
  description: string
  graceYears: number
}

// ---------------------------------------------------------------------------
// Facility upgrade costs
// ---------------------------------------------------------------------------

/**
 * Cost in dollars to upgrade a facility TO the given level.
 * For example, upgrading from level 1 -> level 2 costs $500,000.
 */
export const FacilityUpgradeCost: Record<number, number> = {
  2: 500_000,
  3: 1_000_000,
  4: 2_000_000,
  5: 4_000_000,
}

/**
 * Returns the cost to upgrade a facility from its current level to the next.
 * Returns 0 if the facility is already at max level (5).
 */
export function getUpgradeCost(currentLevel: number): number {
  const nextLevel = currentLevel + 1
  return FacilityUpgradeCost[nextLevel] ?? 0
}

// ---------------------------------------------------------------------------
// Facility upgrade checks & mutation
// ---------------------------------------------------------------------------

/**
 * Check whether a club can upgrade the specified facility.
 * Returns the upgrade cost and a human-readable reason if the upgrade is
 * not possible.
 */
export function canUpgradeFacility(
  club: Club,
  facility: keyof ClubFacilities,
): { canUpgrade: boolean; cost: number; reason: string } {
  const currentLevel = club.facilities[facility]
  const cost = getUpgradeCost(currentLevel)

  if (currentLevel >= 5) {
    return { canUpgrade: false, cost: 0, reason: 'Facility is already at maximum level' }
  }

  if (club.finances.balance < cost) {
    return {
      canUpgrade: false,
      cost,
      reason: `Insufficient funds: need $${cost.toLocaleString()} but only $${club.finances.balance.toLocaleString()} available`,
    }
  }

  return { canUpgrade: true, cost, reason: 'Upgrade available' }
}

/**
 * Returns a new Club object with the specified facility upgraded by one level
 * and the upgrade cost deducted from the club's balance. This is an immutable
 * operation -- the original club object is not modified.
 *
 * Callers should validate with `canUpgradeFacility` first; this function
 * will throw if the upgrade is not valid.
 */
export function upgradeFacility(
  club: Club,
  facility: keyof ClubFacilities,
): Club {
  const { canUpgrade, cost, reason } = canUpgradeFacility(club, facility)

  if (!canUpgrade) {
    throw new Error(`Cannot upgrade ${facility}: ${reason}`)
  }

  return {
    ...club,
    facilities: {
      ...club.facilities,
      [facility]: club.facilities[facility] + 1,
    },
    finances: {
      ...club.finances,
      balance: club.finances.balance - cost,
    },
  }
}

// ---------------------------------------------------------------------------
// Facility impact bonuses
// ---------------------------------------------------------------------------

/**
 * Calculate the impact bonuses provided by a club's current facility levels.
 * Each bonus is `(level - 1) * 0.05`, so level 1 = 0% and level 5 = 20%.
 */
export function getFacilityImpact(facilities: ClubFacilities): FacilityImpact {
  return {
    trainingBonus: (facilities.trainingGround - 1) * 0.05,
    injuryReduction: (facilities.medicalCentre - 1) * 0.05,
    recoveryBonus: (facilities.recoveryPool - 1) * 0.05,
    developmentBonus: (facilities.gym - 1) * 0.05,
    analysisBonus: (facilities.analysisSuite - 1) * 0.05,
    youthBonus: (facilities.youthAcademy - 1) * 0.05,
  }
}

// ---------------------------------------------------------------------------
// Revenue calculation
// ---------------------------------------------------------------------------

/** Helper to linearly interpolate a value based on ladder position (1 = best, 18 = worst). */
function lerpByLadder(ladderPosition: number, best: number, worst: number): number {
  // position 1 -> best, position 18 -> worst
  const t = (ladderPosition - 1) / 17
  return best + (worst - best) * t
}

/**
 * Calculate the revenue breakdown for a club's season.
 *
 * @param club           - The club generating revenue
 * @param ladderPosition - Final ladder position (1 = premiers/minor premiers, 18 = last)
 * @param isFinalist     - Whether the club played in finals
 * @param rng            - Seeded RNG for slight random variation in membership numbers
 */
export function calculateRevenue(
  _club: Club,
  ladderPosition: number,
  isFinalist: boolean,
  rng: SeededRNG,
): RevenueBreakdown {
  // matchDay: $5M for 1st, scaling down to $2M for 18th
  const matchDay = Math.round(lerpByLadder(ladderPosition, 5_000_000, 2_000_000))

  // membership: $3M-$6M with slight random variance
  const membershipBase = lerpByLadder(ladderPosition, 5_500_000, 3_500_000)
  const membershipVariance = rng.nextFloat(-500_000, 500_000)
  const membership = Math.round(membershipBase + membershipVariance)

  // sponsorship: $5M for 1st, $2M for 18th
  const sponsorship = Math.round(lerpByLadder(ladderPosition, 5_000_000, 2_000_000))

  // broadcasting: flat $4M for every club (equal distribution)
  const broadcasting = 4_000_000

  // merchandise: $3M for 1st, $1M for 18th
  const merchandise = Math.round(lerpByLadder(ladderPosition, 3_000_000, 1_000_000))

  // Finalist bonus
  const finalistBonus = isFinalist ? 1_000_000 : 0

  const total = matchDay + membership + sponsorship + broadcasting + merchandise + finalistBonus

  return {
    matchDay,
    membership,
    sponsorship,
    broadcasting,
    merchandise,
    total,
  }
}

// ---------------------------------------------------------------------------
// Expense calculation
// ---------------------------------------------------------------------------

/** All facility keys on ClubFacilities. */
const FACILITY_KEYS: (keyof ClubFacilities)[] = [
  'trainingGround',
  'gym',
  'medicalCentre',
  'recoveryPool',
  'analysisSuite',
  'youthAcademy',
]

/**
 * Calculate the expense breakdown for a club's season.
 *
 * @param club            - The club incurring expenses
 * @param staffWageBill   - Total staff salaries for the season
 * @param playerWageBill  - Total player salaries for the season
 */
export function calculateExpenses(
  club: Club,
  staffWageBill: number,
  playerWageBill: number,
): ExpenseBreakdown {
  // Facility maintenance: each facility costs (level * $100k) per season
  const facilityMaintenance = FACILITY_KEYS.reduce(
    (sum, key) => sum + club.facilities[key] * 100_000,
    0,
  )

  // Flat operational cost
  const operations = 2_000_000

  const total = playerWageBill + staffWageBill + facilityMaintenance + operations

  return {
    playerSalaries: playerWageBill,
    staffSalaries: staffWageBill,
    facilityMaintenance,
    operations,
    total,
  }
}

// ---------------------------------------------------------------------------
// Board expectations
// ---------------------------------------------------------------------------

/**
 * Generate the board's expectation for next season based on the club's
 * current ladder position.
 *
 * @param club           - The club in question
 * @param ladderPosition - Current season's final ladder position (1-18)
 * @param rng            - Seeded RNG for slight variation in expectations
 */
export function generateBoardExpectation(
  club: Club,
  ladderPosition: number,
  rng: SeededRNG,
): BoardExpectation {
  if (ladderPosition <= 2) {
    // Top 2: board expects premiership contention or at least top 4
    return rng.chance(0.5)
      ? {
          type: 'premiership',
          description: `The board expects ${club.name} to be a serious premiership contender next season.`,
          graceYears: 0,
        }
      : {
          type: 'top4',
          description: `The board expects ${club.name} to finish in the top four next season.`,
          graceYears: 0,
        }
  }

  if (ladderPosition <= 4) {
    // 3rd-4th: expect finals or top 4
    return rng.chance(0.6)
      ? {
          type: 'top4',
          description: `The board expects ${club.name} to consolidate their position in the top four.`,
          graceYears: 0,
        }
      : {
          type: 'finals',
          description: `The board expects ${club.name} to play finals next season.`,
          graceYears: 0,
        }
  }

  if (ladderPosition <= 8) {
    // 5th-8th: expect improvement
    return {
      type: 'improvement',
      description: `The board expects ${club.name} to improve on their ladder position and push for a higher finals finish.`,
      graceYears: 1,
    }
  }

  if (ladderPosition <= 14) {
    // 9th-14th: expect development or improvement
    return rng.chance(0.5)
      ? {
          type: 'improvement',
          description: `The board expects ${club.name} to show clear improvement and challenge for a finals spot.`,
          graceYears: 1,
        }
      : {
          type: 'development',
          description: `The board wants ${club.name} to focus on developing young talent and building for the future.`,
          graceYears: 2,
        }
  }

  // 15th-18th: expect development with grace period
  const graceYears = rng.nextInt(2, 3)
  return {
    type: 'development',
    description: `The board is committed to a long-term rebuild at ${club.name}. They expect patience and player development.`,
    graceYears,
  }
}

// ---------------------------------------------------------------------------
// Board satisfaction evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate how satisfied the board is with the current season results
 * relative to their pre-season expectations.
 *
 * @param expectation    - The board's pre-season expectation
 * @param ladderPosition - Actual final ladder position this season (1-18)
 * @param isFinalist     - Whether the club played finals this season
 * @returns              - Satisfaction result including a 0-100 job security score
 */
export function evaluateBoardSatisfaction(
  expectation: BoardExpectation,
  ladderPosition: number,
  isFinalist: boolean,
): { satisfied: boolean; message: string; jobSecurity: number } {
  let satisfied = false
  let jobSecurity = 50
  let message = ''

  switch (expectation.type) {
    case 'premiership': {
      if (ladderPosition === 1) {
        // Won the premiership (or finished top -- exceeded)
        satisfied = true
        jobSecurity = 100
        message = 'The board is thrilled with the premiership success. Outstanding season!'
      } else if (ladderPosition <= 4) {
        // Close but no cigar -- still acceptable
        satisfied = true
        jobSecurity = 75
        message = 'A top-four finish is solid, but the board hoped for a premiership tilt.'
      } else if (isFinalist) {
        // Made finals at least
        satisfied = false
        jobSecurity = 50
        message = 'Making finals was positive, but the board expected a premiership challenge.'
      } else {
        // Missed finals entirely when expected to contend
        satisfied = false
        jobSecurity = 25
        message = 'A deeply disappointing season. The board expected premiership contention but the club missed finals entirely.'
      }
      break
    }

    case 'top4': {
      if (ladderPosition <= 2) {
        satisfied = true
        jobSecurity = 95
        message = 'An exceptional top-two finish exceeds expectations. The board is very pleased.'
      } else if (ladderPosition <= 4) {
        satisfied = true
        jobSecurity = 85
        message = 'A top-four finish meets the board\'s expectations. Well done.'
      } else if (isFinalist) {
        satisfied = false
        jobSecurity = 50
        message = 'Making finals is positive, but the board expected a top-four finish.'
      } else {
        satisfied = false
        jobSecurity = 30
        message = 'Missing finals when a top-four finish was expected is a significant disappointment.'
      }
      break
    }

    case 'finals': {
      if (ladderPosition <= 4) {
        satisfied = true
        jobSecurity = 95
        message = 'A top-four finish exceeds the board\'s expectations. Brilliant work.'
      } else if (isFinalist) {
        satisfied = true
        jobSecurity = 80
        message = 'Reaching finals meets the board\'s expectations for the season.'
      } else if (ladderPosition <= 10) {
        satisfied = false
        jobSecurity = 45
        message = 'Narrowly missing finals is disappointing. The board expected a finals berth.'
      } else {
        satisfied = false
        jobSecurity = 25
        message = 'The club was expected to play finals but finished well down the ladder. The board is very concerned.'
      }
      break
    }

    case 'improvement': {
      if (isFinalist) {
        // Making finals from an improvement-expected position is exceeding
        satisfied = true
        jobSecurity = 95
        message = 'Making finals from this position is a tremendous improvement. The board is delighted.'
      } else if (ladderPosition <= 10) {
        // Showed some improvement
        satisfied = true
        jobSecurity = 75
        message = 'The club showed clear improvement this season. The board is satisfied with the direction.'
      } else if (ladderPosition <= 14) {
        // Mediocre -- may be OK with grace period
        if (expectation.graceYears > 0) {
          satisfied = true
          jobSecurity = 60
          message = 'Progress has been slow, but the board acknowledges the rebuild is still underway.'
        } else {
          satisfied = false
          jobSecurity = 40
          message = 'The board expected visible improvement but results have been stagnant.'
        }
      } else {
        // Went backwards
        if (expectation.graceYears > 0) {
          satisfied = false
          jobSecurity = 40
          message = 'Results have gone backwards. The board\'s patience is wearing thin.'
        } else {
          satisfied = false
          jobSecurity = 20
          message = 'A woeful season. The board expected improvement and got regression.'
        }
      }
      break
    }

    case 'development': {
      // Development expectations are the most lenient
      if (isFinalist) {
        satisfied = true
        jobSecurity = 100
        message = 'Making finals during a development phase is extraordinary. The board could not be happier.'
      } else if (ladderPosition <= 10) {
        satisfied = true
        jobSecurity = 90
        message = 'A strong finish during the development phase. The rebuild is ahead of schedule.'
      } else if (ladderPosition <= 14) {
        satisfied = true
        jobSecurity = 70
        message = 'The club is showing signs of progress. The board is content with the development trajectory.'
      } else {
        // Bottom of the ladder during a development phase
        if (expectation.graceYears > 0) {
          satisfied = true
          jobSecurity = 60
          message = 'Results are tough, but the board understands this is part of the rebuild process.'
        } else {
          satisfied = false
          jobSecurity = 35
          message = 'The development phase has not produced enough progress. The board is growing impatient.'
        }
      }
      break
    }
  }

  return { satisfied, message, jobSecurity }
}
