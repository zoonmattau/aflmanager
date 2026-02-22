import type { ClubGameplan } from './club'

export type CoachBackground =
  | 'former-midfielder'
  | 'former-defender'
  | 'former-forward'
  | 'former-ruck'
  | 'career-coach'

export type CoachTacticalPhilosophy =
  | 'possession-first'
  | 'direct-attack'
  | 'grind-it-out'
  | 'defensive-structure'
  | 'hybrid-adaptive'

export type CoachRecruitingPhilosophy =
  | 'youth-first'
  | 'prime-window'
  | 'star-driven'
  | 'role-specific'
  | 'best-available'

export type CoachTradeStyle =
  | 'deal-maker'
  | 'asset-protector'
  | 'value-seeker'
  | 'win-now-pusher'
  | 'rebuild-architect'

export type CoachMediaPersonality =
  | 'guarded'
  | 'combative'
  | 'diplomatic'
  | 'expressive'
  | 'analytical'

export type CoachFamiliarityTier =
  | 'unknown'
  | 'aware'
  | 'familiar'
  | 'well-scouted'
  | 'book-on'

export interface CoachCareerEntry {
  clubId: string
  clubName: string
  startYear: number
  endYear: number | null
  wins: number
  losses: number
  draws: number
  premiershipsWon: number
  /** One per season */
  finalLadderPositions: number[]
  departed: 'fired' | 'resigned' | 'active'
}

export interface CoachDecisionRecord {
  id: string
  date: string
  year: number
  round: number | null
  type: 'trade' | 'draft-pick' | 'signing' | 'delisting' | 'tactical-shift'
  summary: string
  noteworthiness: 'routine' | 'notable' | 'headline'
  involvedPlayerIds: string[]
  involvedClubIds: string[]
}

export interface CoachPressQuote {
  id: string
  coachId: string
  date: string
  context: 'pre-match' | 'post-win' | 'post-loss' | 'trade' | 'draft' | 'mid-season'
  opponentClubId?: string
  quote: string
  tone: 'confident' | 'cautious' | 'defiant' | 'conceding' | 'deflecting' | 'analytical'
}

export interface AICoachProfile {
  id: string
  firstName: string
  lastName: string
  /** Age 42-65 */
  age: number
  background: CoachBackground
  tacticalPhilosophy: CoachTacticalPhilosophy
  recruitingPhilosophy: CoachRecruitingPhilosophy
  tradeStyle: CoachTradeStyle
  mediaPersonality: CoachMediaPersonality
  traits: {
    /** 0-100 */
    riskTolerance: number
    /** 0-100 — willingness to shift mid-season */
    adaptability: number
    /** 0-100 */
    youthPatience: number
    /** 0-100 */
    pressureHandling: number
    /** 0-100 */
    aggressionLevel: number
  }
  /** Coach's ideal gameplan settings */
  preferredGameplan: Partial<ClubGameplan>
  recruitingAgeMin: number
  recruitingAgeMax: number
  currentClubId: string | null
  tenureStartYear: number | null
  careerHistory: CoachCareerEntry[]
  /** Rolling last 20 */
  recentDecisions: CoachDecisionRecord[]
  /** Rolling last 10 */
  recentQuotes: CoachPressQuote[]
}

export interface CoachKnowledgeEntry {
  coachId: string
  /** 0-100 */
  familiarity: number
  tier: CoachFamiliarityTier
  revealedTraitKeys: string[]
  lastUpdatedYear: number
  lastUpdatedRound: number | null
  sourceLog: Array<{ type: 'match' | 'passive' | 'news'; year: number; gain: number }>
}

/** The blended effective personality after merging coach + club */
export interface EffectivePersonality {
  effectiveRiskTolerance: number
  effectiveTradeActivity: 'active' | 'moderate' | 'passive'
  effectiveDraftPhilosophy: 'best-available' | 'positional-need' | 'high-upside'
  effectiveCompetitiveWindow: 'win-now' | 'balanced' | 'rebuilding'
  blendedGameplan: Partial<ClubGameplan>
}
