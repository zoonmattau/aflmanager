import type { StaffMember, StaffRole, StaffRatings } from '@/types/staff'
import type { SeededRNG } from '@/engine/core/rng'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface CoachingImpact {
  developmentBonus: number
  matchBonus: number
  fitnessBonus: number
  moraleBonus: number
  forwardsDev: number
  midfieldDev: number
  ruckDev: number
  defensiveDev: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_ROLES: StaffRole[] = [
  'head-coach',
  'assistant-coach',
  'forwards-coach',
  'midfield-coach',
  'ruck-coach',
  'defensive-coach',
  'strength-conditioning',
  'reserves-coach',
]

const PHILOSOPHIES: StaffMember['philosophy'][] = [
  'attacking',
  'defensive',
  'balanced',
  'development',
]

/** The full coaching roster expected at every club. */
const REQUIRED_ROLES: { role: StaffRole; count: number }[] = [
  { role: 'head-coach', count: 1 },
  { role: 'assistant-coach', count: 3 },
  { role: 'forwards-coach', count: 1 },
  { role: 'midfield-coach', count: 1 },
  { role: 'ruck-coach', count: 1 },
  { role: 'defensive-coach', count: 1 },
  { role: 'strength-conditioning', count: 1 },
  { role: 'reserves-coach', count: 1 },
]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Counter used to produce unique IDs within a single generation run. */
let staffIdCounter = 0

function generateStaffId(): string {
  staffIdCounter++
  return `staff-${Date.now()}-${staffIdCounter}`
}

/**
 * Generate a random StaffRatings block within the given min/max range.
 * Specialist roles receive a targeted boost to one rating.
 */
function generateRatings(
  rng: SeededRNG,
  min: number,
  max: number,
  specialtyOverrides?: Partial<Record<keyof StaffRatings, { min: number; max: number }>>,
): StaffRatings {
  const base = (): number => rng.nextInt(min, max)

  const ratings: StaffRatings = {
    tactical: base(),
    manManagement: base(),
    development: base(),
    gameDay: base(),
    recruitment: base(),
    fitness: base(),
    discipline: base(),
  }

  // Apply specialty overrides
  if (specialtyOverrides) {
    for (const [key, range] of Object.entries(specialtyOverrides) as [keyof StaffRatings, { min: number; max: number }][]) {
      ratings[key] = rng.nextInt(range.min, range.max)
    }
  }

  return ratings
}

/**
 * Generate a single StaffMember with the given role and rating/salary
 * parameters.
 */
function generateSingleStaff(
  rng: SeededRNG,
  role: StaffRole,
  ratingMin: number,
  ratingMax: number,
  salaryMin: number,
  salaryMax: number,
  clubId: string,
  contractYears: number,
  specialtyOverrides?: Partial<Record<keyof StaffRatings, { min: number; max: number }>>,
): StaffMember {
  const firstName = rng.pick(FIRST_NAMES)
  const lastName = rng.pick(LAST_NAMES)

  return {
    id: generateStaffId(),
    firstName,
    lastName,
    age: rng.nextInt(35, 65),
    role,
    clubId,
    ratings: generateRatings(rng, ratingMin, ratingMax, specialtyOverrides),
    contractYears,
    salary: Math.round(rng.nextInt(salaryMin / 1000, salaryMax / 1000) * 1000),
    philosophy: rng.pick(PHILOSOPHIES),
  }
}

/**
 * Return rating/salary parameters for a given role.
 */
function getRoleParams(role: StaffRole): {
  ratingMin: number
  ratingMax: number
  salaryMin: number
  salaryMax: number
  specialtyOverrides?: Partial<Record<keyof StaffRatings, { min: number; max: number }>>
} {
  switch (role) {
    case 'head-coach':
      return { ratingMin: 50, ratingMax: 90, salaryMin: 200_000, salaryMax: 800_000 }

    case 'assistant-coach':
      return { ratingMin: 40, ratingMax: 80, salaryMin: 120_000, salaryMax: 400_000 }

    case 'forwards-coach':
      return {
        ratingMin: 40,
        ratingMax: 75,
        salaryMin: 100_000,
        salaryMax: 350_000,
        specialtyOverrides: { development: { min: 50, max: 85 } },
      }

    case 'midfield-coach':
      return {
        ratingMin: 40,
        ratingMax: 75,
        salaryMin: 100_000,
        salaryMax: 350_000,
        specialtyOverrides: { tactical: { min: 50, max: 85 } },
      }

    case 'ruck-coach':
      return {
        ratingMin: 40,
        ratingMax: 75,
        salaryMin: 100_000,
        salaryMax: 350_000,
        specialtyOverrides: { development: { min: 50, max: 85 } },
      }

    case 'defensive-coach':
      return {
        ratingMin: 40,
        ratingMax: 75,
        salaryMin: 100_000,
        salaryMax: 350_000,
        specialtyOverrides: { tactical: { min: 50, max: 85 } },
      }

    case 'strength-conditioning':
      return {
        ratingMin: 35,
        ratingMax: 70,
        salaryMin: 80_000,
        salaryMax: 250_000,
        specialtyOverrides: { fitness: { min: 60, max: 90 } },
      }

    case 'reserves-coach':
      return { ratingMin: 35, ratingMax: 70, salaryMin: 80_000, salaryMax: 200_000 }
  }
}

// ---------------------------------------------------------------------------
// 1. generateStaffPool
// ---------------------------------------------------------------------------

/**
 * Generate a pool of available (unattached) coaches for hiring.
 *
 * Roles are distributed roughly evenly across all 8 staff roles, with each
 * coach receiving randomised ratings, salary, and philosophy. All generated
 * coaches have `clubId = ''` and `contractYears = 0`.
 */
export function generateStaffPool(count: number, rng: SeededRNG): StaffMember[] {
  const pool: StaffMember[] = []

  for (let i = 0; i < count; i++) {
    const role = ALL_ROLES[i % ALL_ROLES.length]
    const params = getRoleParams(role)

    pool.push(
      generateSingleStaff(
        rng,
        role,
        params.ratingMin,
        params.ratingMax,
        params.salaryMin,
        params.salaryMax,
        '',
        0,
        params.specialtyOverrides,
      ),
    )
  }

  return rng.shuffle(pool)
}

// ---------------------------------------------------------------------------
// 2. generateClubStaff
// ---------------------------------------------------------------------------

/**
 * Generate a full coaching staff for a club (called during game init).
 *
 * Always produces 10 staff members:
 * - 1 head coach
 * - 3 assistant coaches
 * - 1 forwards coach
 * - 1 midfield coach
 * - 1 ruck coach
 * - 1 defensive coach
 * - 1 strength & conditioning coach
 * - 1 reserves coach
 *
 * All are assigned to the given `clubId` with 1-3 year contracts.
 */
export function generateClubStaff(clubId: string, rng: SeededRNG): StaffMember[] {
  const staff: StaffMember[] = []

  for (const { role, count } of REQUIRED_ROLES) {
    const params = getRoleParams(role)

    for (let i = 0; i < count; i++) {
      staff.push(
        generateSingleStaff(
          rng,
          role,
          params.ratingMin,
          params.ratingMax,
          params.salaryMin,
          params.salaryMax,
          clubId,
          rng.nextInt(1, 3),
          params.specialtyOverrides,
        ),
      )
    }
  }

  return staff
}

// ---------------------------------------------------------------------------
// 3. hireStaff
// ---------------------------------------------------------------------------

/**
 * Returns a new StaffMember object with the given clubId and contractYears
 * set. The original object is not mutated (immutable pattern).
 */
export function hireStaff(
  staff: StaffMember,
  clubId: string,
  contractYears: number,
): StaffMember {
  return {
    ...staff,
    clubId,
    contractYears,
  }
}

// ---------------------------------------------------------------------------
// 4. fireStaff
// ---------------------------------------------------------------------------

/**
 * Fires a staff member and calculates severance pay.
 *
 * Returns a new StaffMember with `clubId = ''` and `contractYears = 0`,
 * along with the severance amount (remaining contract years * salary).
 */
export function fireStaff(
  staff: StaffMember,
): { firedStaff: StaffMember; severancePay: number } {
  const severancePay = staff.contractYears * staff.salary

  const firedStaff: StaffMember = {
    ...staff,
    clubId: '',
    contractYears: 0,
  }

  return { firedStaff, severancePay }
}

// ---------------------------------------------------------------------------
// 5. getCoachingImpact
// ---------------------------------------------------------------------------

/**
 * Calculate the aggregate coaching impact bonuses from a club's staff.
 *
 * - `developmentBonus`: average of all coaches' development rating / 100
 *   (0-1 multiplier)
 * - `matchBonus`: head coach's (gameDay + tactical) / 2 / 200 (0-0.5 range)
 * - `fitnessBonus`: S&C coach's fitness rating / 200 (0-0.5 range)
 * - `moraleBonus`: average of all coaches' manManagement / 200 (0-0.5 range)
 * - Specialist dev bonuses: that specialist's development / 100 (0-1 each)
 *
 * Missing roles default to 0.
 */
export function getCoachingImpact(
  staff: StaffMember[],
  clubId: string,
): CoachingImpact {
  const clubStaff = staff.filter((s) => s.clubId === clubId)

  // Defaults
  const impact: CoachingImpact = {
    developmentBonus: 0,
    matchBonus: 0,
    fitnessBonus: 0,
    moraleBonus: 0,
    forwardsDev: 0,
    midfieldDev: 0,
    ruckDev: 0,
    defensiveDev: 0,
  }

  if (clubStaff.length === 0) {
    return impact
  }

  // developmentBonus: average of all coaches' development / 100
  const totalDevelopment = clubStaff.reduce((sum, s) => sum + s.ratings.development, 0)
  impact.developmentBonus = totalDevelopment / clubStaff.length / 100

  // moraleBonus: average of all coaches' manManagement / 200
  const totalManManagement = clubStaff.reduce((sum, s) => sum + s.ratings.manManagement, 0)
  impact.moraleBonus = totalManManagement / clubStaff.length / 200

  // matchBonus: head coach's (gameDay + tactical) averaged / 200
  const headCoach = clubStaff.find((s) => s.role === 'head-coach')
  if (headCoach) {
    impact.matchBonus = (headCoach.ratings.gameDay + headCoach.ratings.tactical) / 2 / 200
  }

  // fitnessBonus: S&C coach's fitness / 200
  const scCoach = clubStaff.find((s) => s.role === 'strength-conditioning')
  if (scCoach) {
    impact.fitnessBonus = scCoach.ratings.fitness / 200
  }

  // Specialist development bonuses
  const forwardsCoach = clubStaff.find((s) => s.role === 'forwards-coach')
  if (forwardsCoach) {
    impact.forwardsDev = forwardsCoach.ratings.development / 100
  }

  const midfieldCoach = clubStaff.find((s) => s.role === 'midfield-coach')
  if (midfieldCoach) {
    impact.midfieldDev = midfieldCoach.ratings.development / 100
  }

  const ruckCoach = clubStaff.find((s) => s.role === 'ruck-coach')
  if (ruckCoach) {
    impact.ruckDev = ruckCoach.ratings.development / 100
  }

  const defensiveCoach = clubStaff.find((s) => s.role === 'defensive-coach')
  if (defensiveCoach) {
    impact.defensiveDev = defensiveCoach.ratings.development / 100
  }

  return impact
}

// ---------------------------------------------------------------------------
// 6. getStaffByRole
// ---------------------------------------------------------------------------

/**
 * Find a staff member at a specific club with the given role.
 * Returns the first match, or `null` if no such staff member exists.
 */
export function getStaffByRole(
  staff: StaffMember[],
  clubId: string,
  role: StaffRole,
): StaffMember | null {
  return staff.find((s) => s.clubId === clubId && s.role === role) ?? null
}

// ---------------------------------------------------------------------------
// 7. getClubStaff
// ---------------------------------------------------------------------------

/**
 * Returns all staff members currently attached to the given club.
 */
export function getClubStaff(
  staff: StaffMember[],
  clubId: string,
): StaffMember[] {
  return staff.filter((s) => s.clubId === clubId)
}

// ---------------------------------------------------------------------------
// 8. calculateStaffWageBill
// ---------------------------------------------------------------------------

/**
 * Sum of all salaries for a club's coaching staff.
 */
export function calculateStaffWageBill(
  staff: StaffMember[],
  clubId: string,
): number {
  return staff
    .filter((s) => s.clubId === clubId)
    .reduce((total, s) => total + s.salary, 0)
}

// ---------------------------------------------------------------------------
// 9. getRequiredRoles
// ---------------------------------------------------------------------------

/**
 * Returns the full flat list of required coaching positions at a club,
 * including duplicates for roles that need multiple staff (e.g. 3 assistants).
 */
export function getRequiredRoles(): StaffRole[] {
  const roles: StaffRole[] = []
  for (const { role, count } of REQUIRED_ROLES) {
    for (let i = 0; i < count; i++) {
      roles.push(role)
    }
  }
  return roles
}

// ---------------------------------------------------------------------------
// 10. getVacantRoles
// ---------------------------------------------------------------------------

/**
 * Returns roles that are not currently filled at a club.
 *
 * Compares the required role counts against the current staff to identify
 * vacancies. If a club should have 3 assistants but only has 1, two
 * 'assistant-coach' entries will appear in the result.
 */
export function getVacantRoles(
  staff: StaffMember[],
  clubId: string,
): StaffRole[] {
  const clubStaff = staff.filter((s) => s.clubId === clubId)

  // Count how many of each role we currently have
  const currentCounts = new Map<StaffRole, number>()
  for (const s of clubStaff) {
    currentCounts.set(s.role, (currentCounts.get(s.role) ?? 0) + 1)
  }

  const vacant: StaffRole[] = []

  for (const { role, count } of REQUIRED_ROLES) {
    const current = currentCounts.get(role) ?? 0
    const deficit = count - current
    for (let i = 0; i < deficit; i++) {
      vacant.push(role)
    }
  }

  return vacant
}
