import type { YouthPlayer, YouthCompetition, YouthPlayerSeasonStats, YouthLadderEntry } from '@/types/youthPathway'
import type { ScoutingRegion } from '@/types/draft'
import type { PlayerPositionType } from '@/types/player'
import { SeededRNG } from '@/engine/core/rng'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'
import youthCompsData from '@/data/youthComps.json'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS: PlayerPositionType[] = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF']

/** Players per club by competition level */
const PLAYERS_PER_CLUB: Record<'elite' | 'school' | 'local', number> = {
  elite: 30,
  school: 20,
  local: 25,
}

/** Raw talent distribution brackets */
const TALENT_TIERS = [
  { min: 70, max: 100, weight: 5 },   // elite
  { min: 50, max: 69, weight: 15 },   // first-round
  { min: 30, max: 49, weight: 30 },   // second-round
  { min: 5,  max: 29, weight: 50 },   // depth
]

/** Elite comp ceiling bonus */
const ELITE_TALENT_BONUS = 10

/** Map comp state to scouting region */
const STATE_TO_REGION: Record<string, ScoutingRegion> = {
  VIC: 'VIC',
  SA: 'SA',
  WA: 'WA',
  'NSW/ACT': 'NSW/ACT',
  QLD: 'QLD',
  TAS: 'TAS',
  NT: 'NT',
}

/** Position bias adjustments for each proxy attribute */
const POSITION_BIASES: Record<PlayerPositionType, Partial<Record<
  'athleticism' | 'footballIQ' | 'contested' | 'kicking' | 'marking' | 'goalkicking' | 'workRate' | 'leadership',
  number
>>> = {
  FB: { athleticism: 8, footballIQ: 5, contested: 3, marking: 8, workRate: 5 },
  BP: { athleticism: 5, footballIQ: 8, contested: 5, marking: 5, workRate: 5 },
  CHB: { athleticism: 5, footballIQ: 10, kicking: 8, marking: 5, workRate: 5 },
  HBF: { athleticism: 8, footballIQ: 5, kicking: 5, workRate: 8 },
  W: { athleticism: 8, footballIQ: 5, kicking: 8, workRate: 8 },
  IM: { athleticism: 5, contested: 12, footballIQ: 5, workRate: 10 },
  OM: { athleticism: 8, footballIQ: 8, kicking: 8, workRate: 5 },
  CHF: { athleticism: 5, footballIQ: 5, kicking: 8, marking: 5, goalkicking: 8 },
  HFF: { athleticism: 5, footballIQ: 5, kicking: 5, marking: 5, workRate: 5 },
  FF: { marking: 8, goalkicking: 15, leadership: 5 },
  FP: { athleticism: 5, marking: 5, goalkicking: 10 },
  RK: { athleticism: 10, contested: 15, workRate: 5 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function emptySeasonStats(): YouthPlayerSeasonStats {
  return {
    gamesPlayed: 0,
    disposals: 0,
    goals: 0,
    marks: 0,
    tackles: 0,
    bestOnGroundCount: 0,
    avgRating: 0,
    standoutGames: 0,
  }
}

function rollTalentScore(rng: SeededRNG, isElite: boolean): number {
  // Weighted tier selection
  const totalWeight = TALENT_TIERS.reduce((s, t) => s + t.weight, 0)
  let roll = rng.nextInt(0, totalWeight - 1)
  let tier = TALENT_TIERS[TALENT_TIERS.length - 1]
  for (const t of TALENT_TIERS) {
    if (roll < t.weight) { tier = t; break }
    roll -= t.weight
  }
  const base = rng.nextInt(tier.min, tier.max)
  return isElite ? clamp(base + rng.nextInt(0, ELITE_TALENT_BONUS), 5, 100) : base
}

function rollFate(rawTalentScore: number, rng: SeededRNG): YouthPlayer['fate'] {
  if (rawTalentScore >= 60) {
    return rng.chance(0.85) ? 'draft' : 'state-league'
  } else if (rawTalentScore >= 35) {
    return rng.chance(0.40) ? 'state-league' : 'community'
  } else {
    return rng.chance(0.10) ? 'state-league' : 'community'
  }
}

function generateProxy(
  rawTalentScore: number,
  attr: keyof typeof POSITION_BIASES[PlayerPositionType],
  position: PlayerPositionType,
  rng: SeededRNG,
): number {
  const bias = POSITION_BIASES[position]?.[attr] ?? 0
  return clamp(Math.round(rawTalentScore * 0.6 + bias + rng.nextInt(-15, 15)), 10, 95)
}

function generateYouthPlayer(
  id: string,
  comp: YouthCompetition,
  clubId: string,
  _year: number,
  rng: SeededRNG,
): YouthPlayer {
  const isElite = comp.level === 'elite'
  const rawTalentScore = rollTalentScore(rng, isElite)

  const isU16 = comp.ageGroup === 'u16' || (comp.ageGroup === 'both' && rng.chance(0.5))
  const ageGroup: 'u16' | 'u18' = isU16 ? 'u16' : 'u18'

  let age: number
  let yearInComp: number
  if (ageGroup === 'u16') {
    yearInComp = rng.chance(0.60) ? 1 : 2
    age = yearInComp === 1 ? 15 : 16
  } else {
    yearInComp = rng.chance(0.50) ? 1 : 2
    age = yearInComp === 1 ? 17 : 18
  }

  const position = rng.pick(POSITIONS)
  const region: ScoutingRegion = STATE_TO_REGION[comp.state] ?? 'VIC'

  return {
    id,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age,
    ageGroup,
    region,
    position,
    clubId,
    compId: comp.id,
    athleticism: generateProxy(rawTalentScore, 'athleticism', position, rng),
    footballIQ: generateProxy(rawTalentScore, 'footballIQ', position, rng),
    contested: generateProxy(rawTalentScore, 'contested', position, rng),
    kicking: generateProxy(rawTalentScore, 'kicking', position, rng),
    marking: generateProxy(rawTalentScore, 'marking', position, rng),
    goalkicking: generateProxy(rawTalentScore, 'goalkicking', position, rng),
    workRate: generateProxy(rawTalentScore, 'workRate', position, rng),
    leadership: generateProxy(rawTalentScore, 'leadership', position, rng),
    rawTalentScore,
    discoveredByClubIds: [],
    seasonStats: emptySeasonStats(),
    yearInComp,
    fate: rollFate(rawTalentScore, rng),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build initial YouthLadder entries for a comp's clubs. */
export function buildInitialLadder(clubs: YouthCompetition['clubs']): YouthLadderEntry[] {
  return clubs.map((c) => ({
    clubId: c.id,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    percentage: 100,
  }))
}

/** Parse youthComps.json into proper YouthCompetition objects with empty season data. */
export function buildYouthCompetitions(year: number): YouthCompetition[] {
  return (youthCompsData as Omit<YouthCompetition, 'season'>[]).map((raw) => ({
    ...raw,
    clubs: raw.clubs.map((c) => ({ ...c, compId: raw.id })),
    season: {
      year,
      completedRounds: 0,
      results: [],
      ladder: buildInitialLadder(raw.clubs.map((c) => ({ ...c, compId: raw.id }))),
    },
  }))
}

/** Generate ALL youth players for a fresh season. */
export function generateAllYouthPlayers(
  competitions: YouthCompetition[],
  year: number,
  rng: SeededRNG,
): Record<string, YouthPlayer> {
  const players: Record<string, YouthPlayer> = {}
  let counter = 0

  for (const comp of competitions) {
    const playersPerClub = PLAYERS_PER_CLUB[comp.level]
    for (const club of comp.clubs) {
      for (let i = 0; i < playersPerClub; i++) {
        const id = `youth-${year}-${comp.id}-${club.id}-${counter++}`
        players[id] = generateYouthPlayer(id, comp, club.id, year, rng)
      }
    }
  }

  return players
}

/** Season rollover: age everyone +1, remove age-19+, add fresh cohort. */
export function rollNewCohort(
  existing: Record<string, YouthPlayer>,
  competitions: YouthCompetition[],
  newYear: number,
  rng: SeededRNG,
): Record<string, YouthPlayer> {
  const retained: Record<string, YouthPlayer> = {}

  // Age everyone up and keep only those still age-eligible
  for (const [id, player] of Object.entries(existing)) {
    const newAge = player.age + 1
    // U16 players can be max 16, U18 players can be max 18
    const maxAge = player.ageGroup === 'u16' ? 16 : 18
    if (newAge <= maxAge) {
      retained[id] = {
        ...player,
        age: newAge,
        yearInComp: player.yearInComp + 1,
        seasonStats: emptySeasonStats(),  // reset stats for new season
      }
    }
    // age-19 or over-max: they exit (converted to draft prospect or retired in draft conversion step)
  }

  // Generate fresh youngest cohort (age 15 for u16, age 17 for u18)
  let counter = 0
  for (const comp of competitions) {
    const playersPerClub = PLAYERS_PER_CLUB[comp.level]
    // Only generate new 'yearInComp=1' players (half the roster)
    const newCount = Math.ceil(playersPerClub * 0.5)
    for (const club of comp.clubs) {
      for (let i = 0; i < newCount; i++) {
        const id = `youth-${newYear}-${comp.id}-${club.id}-${counter++}`
        const player = generateYouthPlayer(id, comp, club.id, newYear, rng)
        // Force to be first-year, youngest age
        const forcedAge = comp.ageGroup === 'u16' || (comp.ageGroup === 'both' && player.ageGroup === 'u16') ? 15 : 17
        retained[id] = {
          ...player,
          age: forcedAge,
          yearInComp: 1,
          seasonStats: emptySeasonStats(),
        }
      }
    }
  }

  return retained
}
