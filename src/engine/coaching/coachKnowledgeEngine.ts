import type { CoachKnowledgeEntry, CoachFamiliarityTier, AICoachProfile } from '@/types/coach'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FAMILIARITY_THRESHOLDS: Record<CoachFamiliarityTier, number> = {
  unknown: 0,
  aware: 16,
  familiar: 36,
  'well-scouted': 61,
  'book-on': 86,
}

/** Trait keys revealed at each tier (cumulative) */
const TIER_REVEALED_TRAITS: Record<CoachFamiliarityTier, string[]> = {
  unknown: [],
  aware: ['tacticalPhilosophy', 'tenureStartYear'],
  familiar: ['tacticalPhilosophy', 'tenureStartYear', 'recruitingPhilosophy', 'recruitingAgeMin', 'recruitingAgeMax'],
  'well-scouted': [
    'tacticalPhilosophy', 'tenureStartYear',
    'recruitingPhilosophy', 'recruitingAgeMin', 'recruitingAgeMax',
    'tradeStyle',
    'traits.riskTolerance', 'traits.adaptability', 'traits.youthPatience',
    'traits.pressureHandling', 'traits.aggressionLevel',
  ],
  'book-on': [
    'tacticalPhilosophy', 'tenureStartYear',
    'recruitingPhilosophy', 'recruitingAgeMin', 'recruitingAgeMax',
    'tradeStyle',
    'traits.riskTolerance', 'traits.adaptability', 'traits.youthPatience',
    'traits.pressureHandling', 'traits.aggressionLevel',
    'preferredGameplan', 'mediaPersonality', 'background',
  ],
}

const MAX_FAMILIARITY = 100

// ---------------------------------------------------------------------------
// Tier calculation
// ---------------------------------------------------------------------------

export function getFamiliarityTier(familiarity: number): CoachFamiliarityTier {
  if (familiarity >= FAMILIARITY_THRESHOLDS['book-on']) return 'book-on'
  if (familiarity >= FAMILIARITY_THRESHOLDS['well-scouted']) return 'well-scouted'
  if (familiarity >= FAMILIARITY_THRESHOLDS['familiar']) return 'familiar'
  if (familiarity >= FAMILIARITY_THRESHOLDS['aware']) return 'aware'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Entry factory
// ---------------------------------------------------------------------------

export function createKnowledgeEntry(coachId: string, year: number): CoachKnowledgeEntry {
  return {
    coachId,
    familiarity: 0,
    tier: 'unknown',
    revealedTraitKeys: [],
    lastUpdatedYear: year,
    lastUpdatedRound: null,
    sourceLog: [],
  }
}

/** Create a fully revealed entry (for the player's own coach) */
export function createFullyRevealedEntry(coachId: string, year: number): CoachKnowledgeEntry {
  return {
    coachId,
    familiarity: 100,
    tier: 'book-on',
    revealedTraitKeys: TIER_REVEALED_TRAITS['book-on'],
    lastUpdatedYear: year,
    lastUpdatedRound: null,
    sourceLog: [{ type: 'passive', year, gain: 100 }],
  }
}

// ---------------------------------------------------------------------------
// Gain helpers — all pure, caller writes back to state
// ---------------------------------------------------------------------------

function applyGain(
  entry: CoachKnowledgeEntry,
  gain: number,
  source: 'match' | 'passive' | 'news',
  year: number,
  round: number | null,
): CoachKnowledgeEntry {
  const newFamiliarity = Math.min(MAX_FAMILIARITY, entry.familiarity + gain)
  const newTier = getFamiliarityTier(newFamiliarity)
  const newRevealedKeys = TIER_REVEALED_TRAITS[newTier]

  return {
    ...entry,
    familiarity: newFamiliarity,
    tier: newTier,
    revealedTraitKeys: newRevealedKeys,
    lastUpdatedYear: year,
    lastUpdatedRound: round,
    sourceLog: [...entry.sourceLog, { type: source, year, gain }].slice(-50),
  }
}

/** Call after playing a match against this coach's club (+8 familiarity) */
export function gainFamiliarityFromMatch(
  entry: CoachKnowledgeEntry,
  year: number,
  round: number,
): CoachKnowledgeEntry {
  return applyGain(entry, 8, 'match', year, round)
}

/** Call once per offseason for passive familiarity (+3) */
export function gainFamiliarityPassive(
  entry: CoachKnowledgeEntry,
  year: number,
): CoachKnowledgeEntry {
  return applyGain(entry, 3, 'passive', year, null)
}

/** Track per-season news gain to cap at +3/season */
let _newsGainBySeason: Map<string, number> = new Map()

/** Call when a news item mentions this coach's club (+1, capped at +3/season) */
export function gainFamiliarityFromNews(
  entry: CoachKnowledgeEntry,
  year: number,
): CoachKnowledgeEntry {
  const key = `${entry.coachId}:${year}`
  const current = _newsGainBySeason.get(key) ?? 0
  if (current >= 3) return entry
  _newsGainBySeason.set(key, current + 1)
  return applyGain(entry, 1, 'news', year, null)
}

/** Reset per-season news gain tracking (call at season start) */
export function resetNewsGainTracking(): void {
  _newsGainBySeason = new Map()
}

// ---------------------------------------------------------------------------
// Fog-of-war reveal
// ---------------------------------------------------------------------------

/** Returns the subset of coach profile data that has been revealed to the player */
export function getRevealedCoachProfile(
  entry: CoachKnowledgeEntry,
  profile: AICoachProfile,
): Partial<AICoachProfile> & { _tier: CoachFamiliarityTier } {
  const revealed: Partial<AICoachProfile> & { _tier: CoachFamiliarityTier } = {
    _tier: entry.tier,
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    currentClubId: profile.currentClubId,
    careerHistory: profile.careerHistory,
    recentDecisions: [],
    recentQuotes: [],
  }

  const keys = entry.revealedTraitKeys

  if (keys.includes('tacticalPhilosophy')) revealed.tacticalPhilosophy = profile.tacticalPhilosophy
  if (keys.includes('tenureStartYear')) revealed.tenureStartYear = profile.tenureStartYear
  if (keys.includes('recruitingPhilosophy')) revealed.recruitingPhilosophy = profile.recruitingPhilosophy
  if (keys.includes('recruitingAgeMin')) revealed.recruitingAgeMin = profile.recruitingAgeMin
  if (keys.includes('recruitingAgeMax')) revealed.recruitingAgeMax = profile.recruitingAgeMax
  if (keys.includes('tradeStyle')) revealed.tradeStyle = profile.tradeStyle
  if (keys.includes('preferredGameplan')) revealed.preferredGameplan = profile.preferredGameplan
  if (keys.includes('mediaPersonality')) revealed.mediaPersonality = profile.mediaPersonality
  if (keys.includes('background')) revealed.background = profile.background

  // Traits
  const hasTraits = keys.includes('traits.riskTolerance')
  if (hasTraits) {
    revealed.traits = {
      riskTolerance: profile.traits.riskTolerance,
      adaptability: profile.traits.adaptability,
      youthPatience: profile.traits.youthPatience,
      pressureHandling: profile.traits.pressureHandling,
      aggressionLevel: profile.traits.aggressionLevel,
    }
  }

  // Decisions visible at familiar+
  if (entry.tier === 'familiar' || entry.tier === 'well-scouted' || entry.tier === 'book-on') {
    revealed.recentDecisions = profile.recentDecisions
    revealed.recentQuotes = profile.recentQuotes
  }

  return revealed
}
