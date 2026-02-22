import type { Club, TacticalIdentity } from '@/types/club'
import type {
  AICoachProfile,
  CoachBackground,
  CoachTacticalPhilosophy,
  CoachRecruitingPhilosophy,
  CoachTradeStyle,
  CoachMediaPersonality,
} from '@/types/coach'
import type { SeededRNG } from '@/engine/core/rng'
import { FIRST_NAMES, LAST_NAMES } from '@/data/names'

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function tacticalIdentityToPhilosophy(
  identity: TacticalIdentity,
  rng: SeededRNG,
): CoachTacticalPhilosophy {
  const MAP: Record<TacticalIdentity, CoachTacticalPhilosophy> = {
    'fast-movement': 'direct-attack',
    contested: 'grind-it-out',
    defensive: 'defensive-structure',
    'stoppage-focused': 'grind-it-out',
    'corridor-heavy': 'possession-first',
  }
  const base = MAP[identity]
  // 25% chance to pick an adjacent variant
  if (rng.chance(0.25)) {
    const ADJACENT: Record<CoachTacticalPhilosophy, CoachTacticalPhilosophy[]> = {
      'direct-attack': ['possession-first', 'hybrid-adaptive'],
      'grind-it-out': ['defensive-structure', 'direct-attack'],
      'defensive-structure': ['grind-it-out', 'hybrid-adaptive'],
      'possession-first': ['direct-attack', 'hybrid-adaptive'],
      'hybrid-adaptive': ['possession-first', 'direct-attack'],
    }
    return rng.pick(ADJACENT[base])
  }
  return base
}

function riskToleranceTrait(risk: 'aggressive' | 'moderate' | 'conservative', rng: SeededRNG): number {
  if (risk === 'aggressive') return rng.nextInt(70, 95)
  if (risk === 'moderate') return rng.nextInt(35, 65)
  return rng.nextInt(10, 40)
}

function tradeActivityToStyle(
  activity: 'active' | 'moderate' | 'passive',
  rng: SeededRNG,
): CoachTradeStyle {
  if (activity === 'active') return rng.chance(0.5) ? 'deal-maker' : 'win-now-pusher'
  if (activity === 'moderate') return rng.chance(0.5) ? 'value-seeker' : 'deal-maker'
  return rng.chance(0.5) ? 'asset-protector' : 'rebuild-architect'
}

function competitiveWindowToAgeRange(
  window: 'win-now' | 'balanced' | 'rebuilding',
): { min: number; max: number } {
  if (window === 'win-now') return { min: 22, max: 29 }
  if (window === 'balanced') return { min: 19, max: 27 }
  return { min: 17, max: 24 }
}

function draftPhilosophyToRecruiting(
  draft: 'best-available' | 'positional-need' | 'high-upside',
  rng: SeededRNG,
): CoachRecruitingPhilosophy {
  if (draft === 'best-available') return 'best-available'
  if (draft === 'positional-need') return 'role-specific'
  return rng.chance(0.5) ? 'youth-first' : 'star-driven'
}

const BACKGROUNDS: CoachBackground[] = [
  'former-midfielder',
  'former-defender',
  'former-forward',
  'former-ruck',
  'career-coach',
]

const MEDIA_PERSONALITIES: CoachMediaPersonality[] = [
  'guarded',
  'combative',
  'diplomatic',
  'expressive',
  'analytical',
]

// ---------------------------------------------------------------------------
// Preferred gameplan from tactical philosophy
// ---------------------------------------------------------------------------

function buildPreferredGameplan(
  philosophy: CoachTacticalPhilosophy,
): AICoachProfile['preferredGameplan'] {
  switch (philosophy) {
    case 'possession-first':
      return { tempo: 'slow', offensiveStyle: 'balanced', centreTactic: 'cluster', stoppageTactic: 'cluster' }
    case 'direct-attack':
      return { tempo: 'fast', offensiveStyle: 'attacking', centreTactic: 'spread', stoppageTactic: 'spread' }
    case 'grind-it-out':
      return { tempo: 'medium', offensiveStyle: 'balanced', stoppageTactic: 'cluster', aggression: 'high' }
    case 'defensive-structure':
      return { tempo: 'slow', offensiveStyle: 'defensive', defensiveLine: 'zone', midfieldLine: 'hold' }
    case 'hybrid-adaptive':
      return { tempo: 'medium', offensiveStyle: 'balanced' }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _coachIdCounter = 1

/** Generate a stable unique coach ID */
function nextCoachId(): string {
  return `coach_${Date.now()}_${_coachIdCounter++}`
}

/**
 * Generate a coach profile for the given club.
 * Pure function — no side effects.
 */
export function generateCoach(
  club: Club,
  currentYear: number,
  rng: SeededRNG,
): AICoachProfile {
  const { aiPersonality, tacticalIdentity } = club

  const tacticalPhilosophy = tacticalIdentityToPhilosophy(tacticalIdentity, rng)
  const tradeStyle = tradeActivityToStyle(aiPersonality.tradeActivity, rng)
  const recruitingPhilosophy = draftPhilosophyToRecruiting(aiPersonality.draftPhilosophy, rng)
  const { min: recruitingAgeMin, max: recruitingAgeMax } = competitiveWindowToAgeRange(
    aiPersonality.competitiveWindow,
  )
  const riskTolerance = riskToleranceTrait(aiPersonality.riskTolerance, rng)

  const coach: AICoachProfile = {
    id: nextCoachId(),
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age: rng.nextInt(42, 65),
    background: rng.pick(BACKGROUNDS),
    tacticalPhilosophy,
    recruitingPhilosophy,
    tradeStyle,
    mediaPersonality: rng.pick(MEDIA_PERSONALITIES),
    traits: {
      riskTolerance,
      adaptability: rng.nextInt(20, 90),
      youthPatience: aiPersonality.draftPhilosophy === 'high-upside' ? rng.nextInt(55, 95) : rng.nextInt(20, 75),
      pressureHandling: rng.nextInt(30, 95),
      aggressionLevel: aiPersonality.riskTolerance === 'aggressive' ? rng.nextInt(55, 95) : rng.nextInt(20, 70),
    },
    preferredGameplan: buildPreferredGameplan(tacticalPhilosophy),
    recruitingAgeMin,
    recruitingAgeMax,
    currentClubId: club.id,
    tenureStartYear: currentYear,
    careerHistory: [
      {
        clubId: club.id,
        clubName: club.name,
        startYear: currentYear,
        endYear: null,
        wins: 0,
        losses: 0,
        draws: 0,
        premiershipsWon: 0,
        finalLadderPositions: [],
        departed: 'active',
      },
    ],
    recentDecisions: [],
    recentQuotes: [],
  }

  return coach
}

/**
 * Generate coaches for all clubs in the provided record.
 * Returns { coaches, clubCoachMap } where clubCoachMap links club IDs to coach IDs.
 */
export function generateAllCoaches(
  clubs: Record<string, Club>,
  currentYear: number,
  rng: SeededRNG,
): { coaches: Record<string, AICoachProfile>; clubCoachMap: Record<string, string> } {
  const coaches: Record<string, AICoachProfile> = {}
  const clubCoachMap: Record<string, string> = {}

  for (const club of Object.values(clubs)) {
    const coach = generateCoach(club, currentYear, rng)
    coaches[coach.id] = coach
    clubCoachMap[club.id] = coach.id
  }

  return { coaches, clubCoachMap }
}

/** Find the coach assigned to a given club */
export function findCoachForClub(
  clubId: string,
  coaches: Record<string, AICoachProfile>,
): AICoachProfile | undefined {
  return Object.values(coaches).find((c) => c.currentClubId === clubId)
}

/** Find the coach ID for a given club */
export function findCoachIdForClub(
  clubId: string,
  coaches: Record<string, AICoachProfile>,
  clubs: Record<string, { coachId?: string }>,
): string | undefined {
  // Fast path via club.coachId
  const coachId = clubs[clubId]?.coachId
  if (coachId && coaches[coachId]) return coachId
  // Fallback: scan
  return Object.values(coaches).find((c) => c.currentClubId === clubId)?.id
}
