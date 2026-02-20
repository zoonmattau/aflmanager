// ---------------------------------------------------------------------------
// Betting system types — simulated in-game feature, no real money involved
// ---------------------------------------------------------------------------

export interface MatchBettingMarket {
  matchId: string
  roundIndex: number
  isFinal: boolean
  homeClubId: string
  awayClubId: string
  generatedDate: string

  // Head-to-head (winner)
  homeOdds: number
  awayOdds: number

  // Line / handicap (home perspective; positive = home gives points)
  line: number
  homeLineOdds: number
  awayLineOdds: number

  // Total points (optional — controlled by bettingTotalPointsMarkets setting)
  totalLine: number | null
  overOdds: number | null
  underOdds: number | null

  // Settlement
  settled: boolean
  resultOutcome: 'home' | 'away' | null
}

export interface ClubFuturesOdds {
  premiership: number
  top8: number
  top4: number
  woodenSpoon: number
}

export interface ClubFuturesSnapshot {
  lastUpdated: string
  /** clubId → decimal odds */
  premiership: Record<string, number>
  top8: Record<string, number>
  top4: Record<string, number>
  woodenSpoon: Record<string, number>
}

export interface AwardOddsSnapshot {
  lastUpdated: string
  /** playerId → decimal odds */
  brownlow: Record<string, number>
  coleman: Record<string, number>
  risingStar: Record<string, number>
}

export interface OddsMovement {
  date: string
  odds: number
}

export interface BettingMarketsState {
  lastUpdated: string
  /** matchId → market */
  matchMarkets: Record<string, MatchBettingMarket>
  futures: ClubFuturesSnapshot
  awards: AwardOddsSnapshot
  /** Odds history for key markets (kept to last 10 entries per entity) */
  oddsHistory: {
    premiership: Record<string, OddsMovement[]>
    top8: Record<string, OddsMovement[]>
    coleman: Record<string, OddsMovement[]>
    brownlow: Record<string, OddsMovement[]>
  }
}

export interface BettingSettings {
  enabled: boolean
  ageGateAccepted: boolean
  /** Bookmaker overround / margin as a fraction, e.g. 0.05 = 5% */
  margin: number
  totalPointsMarkets: boolean
}

export const DEFAULT_BETTING_SETTINGS: BettingSettings = {
  enabled: false,
  ageGateAccepted: false,
  margin: 0.05,
  totalPointsMarkets: false,
}

export function defaultBettingMarkets(): BettingMarketsState {
  const now = new Date().toISOString().split('T')[0]!
  return {
    lastUpdated: now,
    matchMarkets: {},
    futures: { lastUpdated: now, premiership: {}, top8: {}, top4: {}, woodenSpoon: {} },
    awards: { lastUpdated: now, brownlow: {}, coleman: {}, risingStar: {} },
    oddsHistory: { premiership: {}, top8: {}, coleman: {}, brownlow: {} },
  }
}
