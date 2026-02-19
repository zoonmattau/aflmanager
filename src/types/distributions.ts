/**
 * AFL-style financial distribution system types.
 * Configurable per save via GameSettings.aflDistributions.
 */

/** How the ladder prize pool is allocated across positions */
export type DistributionModel = 'linear' | 'tiered' | 'flat'

/** A position band with a flat prize amount (used when distributionModel === 'tiered') */
export interface LadderPrizeTier {
  /** First position in this band (1-based, inclusive) */
  minPosition: number
  /** Last position in this band (1-based, inclusive) */
  maxPosition: number
  /** Prize paid to every club finishing in this band */
  amount: number
}

/**
 * Full configuration for AFL-style financial distributions.
 * All monetary values are pre-inflation (the engine applies inflationIndex at runtime).
 */
export interface AflDistributionConfig {
  // ---- Ladder prize pool ----
  /** Prize for finishing 1st on the ladder */
  ladderFirst: number
  /** Prize for finishing last (bottom) on the ladder */
  ladderLast: number
  /** Method for distributing prizes across all ladder positions */
  distributionModel: DistributionModel
  /** Tiers used when distributionModel === 'tiered' */
  ladderTiers: LadderPrizeTier[]

  // ---- Finals performance bonuses ----
  /** Enable bonuses for finals wins */
  finalsEnabled: boolean
  /** Extra $ per finals win (e.g. $150,000 per win) */
  finalsWinBonus: number
  /** Additional bonus for winning the premiership */
  premiershipBonus: number
  /** Bonus for reaching the Grand Final as runner-up */
  runnerUpBonus: number

  // ---- Equalisation payments ----
  /** Enable equalisation payments to bottom-ranked clubs */
  equalisationEnabled: boolean
  /** Number of clubs at the bottom who receive equalisation (e.g. bottom 6) */
  equalisationThreshold: number
  /** Extra $ paid to each club in the equalisation bracket */
  equalisationPayment: number

  // ---- Travel compensation ----
  /** Enable per-game travel compensation */
  travelCompEnabled: boolean
  /** Compensation $ per away game played */
  travelPerAwayGame: number

  // ---- Performance improvement grants ----
  /** Enable grants for most-improved clubs */
  performanceGrantEnabled: boolean
  /** Number of top improvers (by ladder positions gained) who receive the grant */
  performanceGrantPositions: number
  /** $ amount awarded to each qualifying most-improved club */
  performanceGrantAmount: number
}

/** Full breakdown of all distribution components paid to a single club in one season */
export interface DistributionBreakdown {
  /** Prize for finishing at this ladder position */
  ladderPrize: number
  /** Total bonus from winning finals matches */
  finalsWinBonus: number
  /** Extra bonus for winning the premiership */
  premiershipBonus: number
  /** Bonus for being the grand final runner-up */
  runnerUpBonus: number
  /** Equalisation payment (bottom-ranked clubs only) */
  equalisationPayment: number
  /** Travel compensation based on away games played */
  travelCompensation: number
  /** Performance improvement grant */
  performanceGrant: number
  /** Sum of all components */
  total: number
}
