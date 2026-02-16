export type VenueState = 'VIC' | 'SA' | 'WA' | 'QLD' | 'NSW' | 'TAS' | 'NT' | 'ACT'

export interface Venue {
  id: string
  name: string
  city: string
  state: VenueState
  capacity: number
  revenueMultiplier: number
  hgaBonus: number
  isNeutral: boolean
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
