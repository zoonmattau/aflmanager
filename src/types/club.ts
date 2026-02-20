export type GuernseyPattern =
  | 'solid' | 'vertical-stripes' | 'horizontal-hoops'
  | 'v-stripe' | 'chevron' | 'sash' | 'yoke' | 'halves'

export interface GuernseyStyle {
  homePattern: GuernseyPattern
  awayPattern: GuernseyPattern
  homeColors: [string, string]
  awayColors: [string, string]
}

export interface ClubColors {
  primary: string    // hex
  secondary: string  // hex
  tertiary?: string  // hex
}

export interface ClubFacilities {
  trainingGround: number    // 1-5
  gym: number               // 1-5
  medicalCentre: number     // 1-5
  recoveryPool: number      // 1-5
  analysisSuite: number     // 1-5
  youthAcademy: number      // 1-5
}

export interface ClubFinances {
  salaryCap: number
  currentSpend: number
  revenue: number
  expenses: number
  balance: number
  /** Running match-day gate total accumulated during the season */
  matchDayAccumulated?: number
  /** Per-match broadcast revenue accumulated separately from gate */
  broadcastAccumulated?: number
  /** Gate revenue from finals matches */
  finalsRevenueAccumulated?: number
  /** Marquee/blockbuster special events bonus revenue */
  specialEventsAccumulated?: number
  /** Performance momentum modifier from recent form (-0.10 to +0.15) */
  momentumModifier?: number
  /** Membership campaign and tracking data (legacy) */
  membershipData?: MembershipData
  /** Full membership tier state (replaces membershipData) */
  membershipState?: ClubMembershipState
  /** Last season's revenue breakdown */
  seasonRevenue?: import('@/engine/clubs/clubManagement').RevenueBreakdown
  /** Last season's expense breakdown */
  seasonExpenses?: import('@/engine/clubs/clubManagement').ExpenseBreakdown
  /** Net profit/loss from last season */
  seasonPnL?: number
  /** Breakdown of AFL distribution components received last season */
  distributionBreakdown?: import('@/types/distributions').DistributionBreakdown
  /** Active and historical loans taken by the club */
  loans?: import('@/types/finance').ClubLoan[]
}

export interface DraftPick {
  year: number
  round: number
  originalClubId: string   // Club that originally held this pick
  currentClubId: string    // Club that currently owns it
  pickNumber?: number      // Assigned during draft order
}

export interface RuckNomination {
  primaryRuckId: string | null
  backupRuckId: string | null
  aroundTheGround: boolean
}

export interface ClubLeadership {
  captainId: string | null
  viceCaptainId: string | null
  leadershipGroupIds: string[]  // 4-6 additional leaders
}

export interface ClubCulture {
  score: number              // 0-100
  momentum: number           // -20 to +20
  stability: number          // 0-100
  leadershipFactor: number   // 0-100
  ageBalance: number         // 0-100
  lastUpdatedRound: number
}

export type ClubIdentityType =
  | 'youth-development'
  | 'star-chasing'
  | 'defensive-powerhouse'

export interface ClubIdentity {
  current: ClubIdentityType
  previous: ClubIdentityType | null
  scores: Record<ClubIdentityType, number> // 0-100
  momentum: number // -20 to +20
  fanExpectation: 'patience' | 'progress' | 'finals' | 'contend'
  lastEvolvedYear: number
}

export type TacticalIdentity =
  | 'fast-movement'
  | 'contested'
  | 'defensive'
  | 'stoppage-focused'
  | 'corridor-heavy'

/** How forwards set up and move to create leads */
export type ForwardLeadingPattern = 'straight' | 'diagonal' | 'hold-spread' | 'rotate'

/** Direction the ruckman targets at centre bounces and ball-ups */
export type TapDirection = 'forward' | 'backward' | 'read-and-react'

/** How players position around the ball at non-centre stoppages */
export type StoppageMovement = 'flood-back' | 'push-forward' | 'balanced' | 'numbers'

/** How frequently the team switches play across the ground */
export type SwitchFrequency = 'often' | 'normal' | 'rarely'

/** Detailed in-play movement and disposal rules */
export interface PlayStyleRules {
  /** How forwards set up and lead */
  forwardLeading: ForwardLeadingPattern
  /** Preferred tap direction at stoppages */
  tapDirection: TapDirection
  /** Movement discipline at general play stoppages */
  stoppageMovement: StoppageMovement
  /** How often the team switches play wide */
  switchFrequency: SwitchFrequency
  /** Players don't reverse direction — maintain forward momentum */
  noUTurns: boolean
  /** Prefer handpassing to a player running past rather than to a stationary target */
  handbballToRunner: boolean
  /** Avoid kicking backward or across the face of goal in the forward 50 */
  noKickBackAcrossGoal: boolean
}

export interface ClubGameplan {
  offensiveStyle: 'attacking' | 'balanced' | 'defensive'
  tempo: 'fast' | 'medium' | 'slow'
  aggression: 'high' | 'medium' | 'low'
  kickInTactic: 'play-on-short' | 'play-on-long' | 'set-up-short' | 'set-up-long'
  centreTactic: 'spread' | 'cluster' | 'balanced'
  stoppageTactic: 'spread' | 'cluster' | 'balanced'
  defensiveLine: 'press' | 'hold' | 'run' | 'zone'
  midfieldLine: 'press' | 'hold' | 'run' | 'zone'
  forwardLine: 'press' | 'hold' | 'run' | 'zone'
  ruckNomination: RuckNomination
  rotations: 'low' | 'medium' | 'high'
  targetKHRatio?: number
  /** Detailed in-play movement and disposal rules */
  playStyle?: PlayStyleRules
}

export interface ClubHallOfFameEntry {
  playerId: string
  playerName: string
  inductedYear: number
  retiredYear: number
  ageAtRetirement: number
  gamesPlayed: number
  goals: number
  primaryPosition: import('./player').PlayerPositionType
}

// ---------------------------------------------------------------------------
// Media pressure
// ---------------------------------------------------------------------------

export type PressureStoryType =
  | 'losing-streak'
  | 'blowout-loss'
  | 'controversial-trade'
  | 'player-unrest'
  | 'discipline'

export interface MediaPressureStory {
  id: string
  type: PressureStoryType
  headline: string
  severity: 'minor' | 'moderate' | 'major'
  points: number
  expiresRound: number
}

export interface MediaPressure {
  score: number                     // 0-100
  lastScore: number                 // score from previous update, for trend
  activeStories: MediaPressureStory[]
}

// ---------------------------------------------------------------------------
// Budget allocation
// ---------------------------------------------------------------------------

export type BudgetDepartment = 'facilities' | 'coaching' | 'recruiting' | 'medical' | 'scouting' | 'marketing'

export interface ClubBudgetAllocation {
  facilities: number   // 5-50, percentage
  coaching: number     // 5-50, percentage
  recruiting: number   // 5-50, percentage
  medical: number      // 5-50, percentage
  scouting: number     // 5-50, percentage
  /** Marketing & fan engagement — affects membership growth, sponsorship, and fan satisfaction */
  marketing: number    // 5-50, percentage
}

// ---------------------------------------------------------------------------
// Sponsorship & membership
// ---------------------------------------------------------------------------

export type SponsorshipTier = 'naming-rights' | 'major' | 'secondary' | 'minor'
export type SponsorshipCategory =
  | 'telecoms' | 'automotive' | 'beer' | 'finance' | 'insurance'
  | 'retail' | 'tech' | 'energy' | 'travel' | 'food'

export type SponsorshipSlot = 'major' | 'guernsey' | 'stadium' | 'digital'

export interface SponsorshipDeal {
  id: string
  companyName: string
  tier: SponsorshipTier
  category: SponsorshipCategory
  annualValue: number        // nominal $
  yearsRemaining: number     // counts down each season
  totalYears: number
  performanceBonus: number   // extra $ if top-4 finish
  signedYear: number
  slot: SponsorshipSlot
  satisfaction: number       // 0–100; starts at 70 on signing
  reputationRequirement?: number
  exclusiveCategory?: SponsorshipCategory
}

export interface SponsorshipOffer {
  id: string
  clubId: string             // which club the offer is for
  companyName: string
  tier: SponsorshipTier
  category: SponsorshipCategory
  annualValue: number
  years: number
  performanceBonus: number
  expiresYear: number        // player must decide before this year starts
  slot: SponsorshipSlot
  reputationRequirement?: number
  exclusiveCategory?: SponsorshipCategory
  counterStatus?: 'pending' | 'accepted' | 'rejected'
  counterAnnualValue?: number
  counterYears?: number
}

export interface MembershipData {
  totalMembers: number
  target: number
  campaignBudgetSpent: number  // amount spent on campaigns this offseason
  trendLastSeason: number      // +/- vs prior year
}

export type MembershipTierId =
  | 'reserved-seat' | 'general-admission' | 'interstate'
  | 'digital' | 'family' | 'premium'

export interface MembershipTierConfig {
  id: MembershipTierId
  label: string
  description: string
  basePrice: number        // default $ price
  minPrice: number
  maxPrice: number
}

export interface MembershipTierState {
  tierId: MembershipTierId
  price: number            // manager-set price
  count: number            // current members in this tier
  lastSeasonCount: number  // for trend display
}

/** A manager-created custom membership tier (offseason only). */
export interface CustomMembershipTier {
  id: string               // UUID
  label: string
  description: string
  price: number
  count: number
  lastSeasonCount: number
  minPrice: number
  maxPrice: number
}

export interface ClubMembershipState {
  tiers: MembershipTierState[]
  customTiers?: CustomMembershipTier[]
  campaignBudget: number   // $ to spend on acquisition campaign
  seasonTarget: number     // manager-set target total
  fanSatisfaction: number  // 0-100; drives acquisition/churn
  trendLastSeason: number  // net delta last season (signed)
  history: Array<{ year: number; total: number; revenue: number }>
}

export interface Club {
  id: string
  name: string              // e.g. "Richmond"
  fullName: string          // e.g. "Richmond Tigers"
  abbreviation: string      // e.g. "RICH"
  mascot: string            // e.g. "Tigers"
  logoUrl?: string
  homeGround: string        // e.g. "MCG"
  state?: string            // e.g. "VIC", "SA", "QLD", "NSW", "WA"
  established: number       // founding year
  premierships: number      // VFL/AFL premiership count
  tier: 'large' | 'medium' | 'small'  // for scheduling priority
  colors: ClubColors
  facilities: ClubFacilities
  finances: ClubFinances
  draftPicks: DraftPick[]
  gameplan: ClubGameplan
  tacticalIdentity: TacticalIdentity
  leadership: ClubLeadership
  culture?: ClubCulture
  identity?: ClubIdentity
  fanSatisfaction?: number
  lastSeasonLadderPosition?: number  // 1-18, undefined for first season
  hallOfFame?: ClubHallOfFameEntry[]
  notes?: string
  secondaryHomeGrounds?: string[]
  guernseyStyle?: GuernseyStyle
  rivalryClubIds?: string[]
  budgetAllocation?: ClubBudgetAllocation
  mediaPressure?: MediaPressure
  /** AI personality for non-player clubs */
  aiPersonality: {
    competitiveWindow: 'win-now' | 'balanced' | 'rebuilding'
    draftPhilosophy: 'best-available' | 'positional-need' | 'high-upside'
    riskTolerance: 'aggressive' | 'moderate' | 'conservative'
    tradeActivity: 'active' | 'moderate' | 'passive'
  }
  /** Active commercial sponsorship deals */
  sponsorshipDeals?: SponsorshipDeal[]
  /** Real-world historical profile (only populated when using real AFL clubs) */
  historicalData?: import('@/data/clubHistory').ClubHistoricalData
}
