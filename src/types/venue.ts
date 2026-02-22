export type VenueState = 'VIC' | 'SA' | 'WA' | 'QLD' | 'NSW' | 'TAS' | 'NT' | 'ACT'

export interface VenueDimensions {
  length: number // metres, oval length (goal-to-goal)
  width: number  // metres, oval width (centre)
}

/** Additive adjustments to base weather probability weights (positive = more likely, negative = less likely). */
export interface VenueWeatherBias {
  wind: number
  wet: number
  hot: number
  humid: number
}

export interface Venue {
  id: string
  name: string
  city: string
  state: VenueState
  capacity: number
  revenueMultiplier: number
  hgaBonus: number
  isNeutral: boolean
  /** Multiplier applied to goal accuracy (0.7–1.3). >1.0 = high-scoring ground. */
  scoringCoefficient: number
  /** >1.0 = kick-dominant ground, <1.0 = handball-heavy. Affects possession style and stat ratios. */
  kickToHandballRatio: number
  /** Multiplier on total possessions per quarter (0.85–1.15). Big open grounds generate more disposals. */
  disposalCoefficient: number
  /** Multiplier on marking chance (0.80–1.20). Open grounds with space allow more marks. */
  markCoefficient: number
  /** Multiplier on contested possession and tackle rates (0.80–1.20). Compact grounds create more congestion. */
  contestedCoefficient: number
  /** Per-venue weather probability biases (additive to base weights). */
  weatherBias: VenueWeatherBias
  dimensions: VenueDimensions
}

export interface ClubVenueConfig {
  primaryVenueId: string
  secondaryVenueId: string | null
  homeGamesAtPrimary: number
  homeGamesAtSecondary: number
  soldHomeGames: SoldHomeGame[]
}

export interface SoldHomeGame {
  venueId: string
  payment: number
}

export interface VenueAssignment {
  roundNumber: number
  fixtureIndex: number
  venueId: string
  isHomeGround: boolean
  isSecondaryHome: boolean
  isSoldGame: boolean
  expectedAttendance: number
  matchRevenue: number
}

export interface SeasonVenueState {
  allocations: Record<string, ClubVenueConfig>
  assignments: VenueAssignment[]
  accumulatedRevenue: Record<string, number>
}

export interface VenueNegotiationOffer {
  id: string
  venueId: string
  venueName: string
  payment: number
  fanPenalty: number
  description: string
}

// ── Venue Rule System ──────────────────────────────────────────────────────────

/** Quota constraint on home games at a club's secondary (or any named) venue per season. */
export interface ClubVenueQuotaRule {
  /** AFL club ID this rule applies to */
  clubId: string
  /** Maximum home games at the club's secondary venue per season (null = no cap) */
  secondaryVenueMax: number | null
  /** Additional per-venue caps: venueId → max games per season */
  additionalVenueMaxByVenueId?: Record<string, number>
}

/** Constraint on which venue a specific matchup must (or must not) use. */
export interface MatchupVenueRule {
  /** Club listed as HOME for this rule to apply */
  homeClubId: string
  /** The specific away opponent */
  awayClubId: string
  /** If set, this venueId is required for this matchup */
  requiredVenueId?: string
  /** VenueIds that are forbidden for this matchup */
  forbiddenVenueIds?: string[]
  /** Human-readable reason */
  note?: string
  /** Whether the user can override this rule via custom settings */
  overridable?: boolean
}

/** Complete set of venue constraints for a season. */
export interface VenueRuleSet {
  clubQuotaRules: ClubVenueQuotaRule[]
  matchupRules: MatchupVenueRule[]
}

export type VenueViolationType =
  | 'secondary-quota-exceeded'   // Club exceeded secondary venue cap
  | 'additional-quota-exceeded'  // Club exceeded a named-venue cap
  | 'required-venue-missing'     // Matchup requires a specific venue but got another
  | 'forbidden-venue-used'       // Matchup cannot use this venue but does

export interface VenueViolation {
  type: VenueViolationType
  /** 'error' blocks saves; 'warning' is advisory */
  severity: 'error' | 'warning'
  /** -1 = season-level (quota), ≥1 = specific round */
  round: number
  /** -1 = season-level (quota), ≥0 = specific fixture */
  fixtureIndex: number
  homeClubId: string
  awayClubId: string
  venueId: string
  /** For required-venue-missing: the venue that should have been used */
  requiredVenueId?: string
  /** Note from the violated rule */
  ruleNote?: string
  message: string
}

export interface VenueAuditResult {
  violations: VenueViolation[]
  /** true only if there are no 'error'-severity violations */
  isValid: boolean
  stats: {
    /** homeClubId → venueId → home game count at that venue */
    gamesByVenueByClub: Record<string, Record<string, number>>
    /** homeClubId → total home games */
    homeGamesByClub: Record<string, number>
  }
}
