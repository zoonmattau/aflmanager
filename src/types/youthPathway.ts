import type { ScoutingRegion } from './draft'
import type { PlayerPositionType } from './player'

// ---------------------------------------------------------------------------
// ID / enum types
// ---------------------------------------------------------------------------

export type YouthCompId = string

export type YouthCompState = 'VIC' | 'SA' | 'WA' | 'NSW/ACT' | 'QLD' | 'TAS' | 'NT'

export type NationalU18Team =
  | 'VIC Metro'
  | 'VIC Country'
  | 'SA'
  | 'WA'
  | 'NSW/ACT'
  | 'QLD'
  | 'Tasmania'
  | 'NT/Allies'

// ---------------------------------------------------------------------------
// Youth player
// ---------------------------------------------------------------------------

export interface YouthPlayerSeasonStats {
  gamesPlayed: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  bestOnGroundCount: number
  avgRating: number
  standoutGames: number
}

export interface YouthPlayer {
  id: string
  firstName: string
  lastName: string
  age: number              // 14–18
  ageGroup: 'u16' | 'u18'
  region: ScoutingRegion
  position: PlayerPositionType
  clubId: string
  compId: YouthCompId
  // 8 proxy attributes (0–100)
  athleticism: number
  footballIQ: number
  contested: number
  kicking: number
  marking: number
  goalkicking: number
  workRate: number
  leadership: number
  rawTalentScore: number  // 0–100 hidden talent driver
  discoveredByClubIds: string[]
  seasonStats: YouthPlayerSeasonStats
  yearInComp: number      // 1 or 2
  fate: 'draft' | 'state-league' | 'community'
}

// ---------------------------------------------------------------------------
// Youth club & competition
// ---------------------------------------------------------------------------

export interface YouthClub {
  id: string
  name: string
  abbreviation: string
  compId: YouthCompId
  colors: { primary: string; secondary: string }
  strengthRating: number  // 1–100
}

export interface YouthMatchResult {
  round: number
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
  playerPerformances: YouthPlayerMatchPerformance[]
}

export interface YouthPlayerMatchPerformance {
  playerId: string
  rating: number
  disposals: number
  goals: number
  marks: number
  tackles: number
  isBestOnGround: boolean
}

export interface YouthLadderEntry {
  clubId: string
  played: number
  wins: number
  losses: number
  draws: number
  points: number
  pointsFor: number
  pointsAgainst: number
  percentage: number
}

export interface YouthCompetition {
  id: YouthCompId
  name: string
  state: YouthCompState
  level: 'elite' | 'school' | 'local'
  ageGroup: 'u16' | 'u18' | 'both'
  clubs: YouthClub[]
  rounds: number
  season: {
    year: number
    completedRounds: number
    results: YouthMatchResult[]
    ladder: YouthLadderEntry[]
  }
}

// ---------------------------------------------------------------------------
// State rep & national tournament
// ---------------------------------------------------------------------------

export interface StateRepTeam {
  ageGroup: 'u16' | 'u18'
  teamName: NationalU18Team
  region: ScoutingRegion
  playerIds: string[]
  tournamentStats: Record<string, YouthPlayerSeasonStats>
}

export interface YouthTournamentMatch {
  round: number
  homeTeamName: NationalU18Team
  awayTeamName: NationalU18Team
  homeScore: number
  awayScore: number
  mvpPlayerId: string | null
  standoutPlayerIds: string[]
}

export interface YouthNationalTournament {
  year: number
  ageGroup: 'u16' | 'u18'
  teams: StateRepTeam[]
  matches: YouthTournamentMatch[]
  medalWinnerId: string | null
  allAustralianTeam: string[]  // 18 YouthPlayer IDs
  completed: boolean
}

// ---------------------------------------------------------------------------
// Scout assignment
// ---------------------------------------------------------------------------

export interface YouthScoutAssignment {
  scoutId: string
  compId: YouthCompId
  assignedRound: number
  discoveryCount: number
}

// ---------------------------------------------------------------------------
// Top-level pathway state
// ---------------------------------------------------------------------------

export interface YouthPathwayState {
  competitions: Record<YouthCompId, YouthCompetition>
  players: Record<string, YouthPlayer>
  tournaments: { u16: YouthNationalTournament | null; u18: YouthNationalTournament | null }
  scoutAssignments: YouthScoutAssignment[]
  convertedProspectIds: Record<string, string>  // youthPlayerId → draftProspectId
}
