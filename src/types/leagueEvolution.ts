/**
 * League Evolution types
 *
 * Tracks AFL House-controlled expansion, contraction, relocation, and merger
 * events that occur between seasons when the `aflHouseExpansionEvolution`
 * realism toggle is enabled.
 */

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface LeagueExpansionEvent {
  id: string
  type: 'expansion'
  /** Season year in which the event was evaluated/scheduled. */
  year: number
  /** Season year in which the event takes effect (usually year + 1). */
  appliedYear: number
  newClubId: string
  newClubName: string
  newClubFullName: string
  city: string
  description: string
}

export interface LeagueContractionEvent {
  id: string
  type: 'contraction'
  year: number
  appliedYear: number
  clubId: string
  clubName: string
  clubFullName: string
  /** Number of players dispersed to the unsigned pool. */
  dispersedPlayerCount: number
  description: string
}

export interface LeagueRelocationEvent {
  id: string
  type: 'relocation'
  year: number
  appliedYear: number
  clubId: string
  oldName: string
  newName: string
  newFullName: string
  newAbbreviation: string
  oldHomeGround: string
  newHomeGround: string
  newCity: string
  description: string
}

export interface LeagueMergerEvent {
  id: string
  type: 'merger'
  year: number
  appliedYear: number
  club1Id: string
  club1Name: string
  club1FullName: string
  club2Id: string
  club2Name: string
  club2FullName: string
  /** The club whose identity (name, colors, ground) survives. */
  survivingClubId: string
  /** The club that is dissolved and removed from the competition. */
  dissolvedClubId: string
  survivingClubName: string
  survivingClubFullName: string
  /** Players from the dissolved club transferred to the surviving club's list. */
  absorbedPlayerCount: number
  /** Players from the dissolved club released to the unsigned pool. */
  dispersedPlayerCount: number
  description: string
}

export type LeagueEvolutionEvent =
  | LeagueExpansionEvent
  | LeagueContractionEvent
  | LeagueRelocationEvent
  | LeagueMergerEvent

// ---------------------------------------------------------------------------
// History container
// ---------------------------------------------------------------------------

export interface LeagueEvolutionHistory {
  /** All applied events across all seasons. */
  events: LeagueEvolutionEvent[]
}

// ---------------------------------------------------------------------------
// Potential expansion market definitions
// ---------------------------------------------------------------------------

export interface ExpansionMarket {
  id: string
  city: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  homeGround: string
  tier: 'large' | 'medium' | 'small'
  primaryColor: string
  secondaryColor: string
  /** True if this market has already been used (club exists). */
  used?: boolean
}

export const EXPANSION_MARKETS: ExpansionMarket[] = [
  {
    id: 'tasmania',
    city: 'Hobart',
    name: 'Tasmania',
    fullName: 'Tasmania Devils',
    abbreviation: 'TAS',
    mascot: 'Devils',
    homeGround: 'Blundstone Arena',
    tier: 'small',
    primaryColor: '#003087',
    secondaryColor: '#C8102E',
  },
  {
    id: 'auckland',
    city: 'Auckland',
    name: 'Auckland',
    fullName: 'Auckland Hawks',
    abbreviation: 'AKL',
    mascot: 'Hawks',
    homeGround: 'Eden Park',
    tier: 'small',
    primaryColor: '#1C4B35',
    secondaryColor: '#FFD700',
  },
  {
    id: 'wollongong',
    city: 'Wollongong',
    name: 'Illawarra',
    fullName: 'Illawarra Eagles',
    abbreviation: 'ILL',
    mascot: 'Eagles',
    homeGround: 'WIN Stadium',
    tier: 'small',
    primaryColor: '#003087',
    secondaryColor: '#FFFFFF',
  },
  {
    id: 'darwin',
    city: 'Darwin',
    name: 'Northern Territory',
    fullName: 'NT Thunder',
    abbreviation: 'NTT',
    mascot: 'Thunder',
    homeGround: 'TIO Stadium',
    tier: 'small',
    primaryColor: '#FF6B00',
    secondaryColor: '#000000',
  },
]
