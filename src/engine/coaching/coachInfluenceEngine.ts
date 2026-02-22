import type { Club, ClubGameplan } from '@/types/club'
import type { AICoachProfile, EffectivePersonality } from '@/types/coach'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Weight calculation
// ---------------------------------------------------------------------------

/** Coach influence weight based on tenure years (year 0-1=55%, year 2=67%, year 3+=80%) */
export function coachWeight(tenureYears: number): number {
  if (tenureYears <= 1) return 0.55
  if (tenureYears === 2) return 0.67
  return 0.80
}

// ---------------------------------------------------------------------------
// Numeric blending
// ---------------------------------------------------------------------------

function blendNumber(clubVal: number, coachVal: number, weight: number): number {
  return Math.round(clubVal * (1 - weight) + coachVal * weight)
}

// ---------------------------------------------------------------------------
// Categorical blending (coin-flip weighted toward coach)
// ---------------------------------------------------------------------------

function blendCategorical<T>(clubVal: T, coachVal: T, weight: number, rng: SeededRNG): T {
  return rng.chance(weight) ? coachVal : clubVal
}

// ---------------------------------------------------------------------------
// Map aiPersonality to numeric riskTolerance (0-100)
// ---------------------------------------------------------------------------

function riskToNumeric(risk: 'aggressive' | 'moderate' | 'conservative'): number {
  if (risk === 'aggressive') return 80
  if (risk === 'moderate') return 50
  return 20
}

// ---------------------------------------------------------------------------
// Map tradeStyle to tradeActivity enum
// ---------------------------------------------------------------------------

function tradeStyleToActivity(style: AICoachProfile['tradeStyle']): 'active' | 'moderate' | 'passive' {
  switch (style) {
    case 'deal-maker':
    case 'win-now-pusher':
      return 'active'
    case 'value-seeker':
      return 'moderate'
    case 'asset-protector':
    case 'rebuild-architect':
      return 'passive'
  }
}

// ---------------------------------------------------------------------------
// Map tradeStyle to competitive window
// ---------------------------------------------------------------------------

function tradeStyleToWindow(style: AICoachProfile['tradeStyle']): 'win-now' | 'balanced' | 'rebuilding' {
  switch (style) {
    case 'win-now-pusher':
    case 'deal-maker':
      return 'win-now'
    case 'rebuild-architect':
      return 'rebuilding'
    default:
      return 'balanced'
  }
}

// ---------------------------------------------------------------------------
// Map recruitingPhilosophy to draftPhilosophy enum
// ---------------------------------------------------------------------------

function recruitingToDraftPhilosophy(
  philosophy: AICoachProfile['recruitingPhilosophy'],
): 'best-available' | 'positional-need' | 'high-upside' {
  switch (philosophy) {
    case 'best-available':
      return 'best-available'
    case 'role-specific':
      return 'positional-need'
    case 'youth-first':
    case 'star-driven':
      return 'high-upside'
    case 'prime-window':
      return 'best-available'
  }
}

// ---------------------------------------------------------------------------
// Gameplan blending
// ---------------------------------------------------------------------------

function blendGameplan(
  clubGameplan: ClubGameplan,
  coachPreferred: Partial<ClubGameplan>,
  weight: number,
  rng: SeededRNG,
): Partial<ClubGameplan> {
  const blended: Partial<ClubGameplan> = {}

  const categorical = <T>(key: keyof ClubGameplan) => {
    const coachVal = coachPreferred[key] as T | undefined
    if (coachVal !== undefined) {
      const clubVal = clubGameplan[key] as T
      blended[key] = blendCategorical(clubVal, coachVal, weight, rng) as never
    }
  }

  categorical('offensiveStyle')
  categorical('tempo')
  categorical('aggression')
  categorical('kickInTactic')
  categorical('centreTactic')
  categorical('stoppageTactic')
  categorical('defensiveLine')
  categorical('midfieldLine')
  categorical('forwardLine')
  categorical('rotations')

  return blended
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute effective personality by blending club AI defaults with coach profile.
 * Pure function — no side effects.
 */
export function getEffectivePersonality(
  club: Club,
  coach: AICoachProfile,
  currentYear: number,
  rng: SeededRNG,
): EffectivePersonality {
  const tenureYears = coach.tenureStartYear != null ? currentYear - coach.tenureStartYear : 0
  const weight = coachWeight(tenureYears)

  const clubRiskNumeric = riskToNumeric(club.aiPersonality.riskTolerance)
  const effectiveRiskTolerance = blendNumber(clubRiskNumeric, coach.traits.riskTolerance, weight)

  // Trade activity
  const clubTradeActivity = club.aiPersonality.tradeActivity
  const coachTradeActivity = tradeStyleToActivity(coach.tradeStyle)
  const effectiveTradeActivity = blendCategorical(clubTradeActivity, coachTradeActivity, weight, rng)

  // Draft philosophy
  const clubDraftPhilosophy = club.aiPersonality.draftPhilosophy
  const coachDraftPhilosophy = recruitingToDraftPhilosophy(coach.recruitingPhilosophy)
  const effectiveDraftPhilosophy = blendCategorical(clubDraftPhilosophy, coachDraftPhilosophy, weight, rng)

  // Competitive window
  const clubWindow = club.aiPersonality.competitiveWindow
  const coachWindow = tradeStyleToWindow(coach.tradeStyle)
  const effectiveCompetitiveWindow = blendCategorical(clubWindow, coachWindow, weight, rng)

  // Gameplan
  const blendedGameplan = blendGameplan(club.gameplan, coach.preferredGameplan, weight, rng)

  return {
    effectiveRiskTolerance,
    effectiveTradeActivity,
    effectiveDraftPhilosophy,
    effectiveCompetitiveWindow,
    blendedGameplan,
  }
}
