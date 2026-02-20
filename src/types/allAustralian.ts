export type AAPositionGroup = 'DEF' | 'MID' | 'RUC' | 'FWD'

export type AATeamSlotLabel =
  | 'Left Back Pocket'
  | 'Full-back'
  | 'Right Back Pocket'
  | 'Left Half-back'
  | 'Centre Half-back'
  | 'Right Half-back'
  | 'Left Wing'
  | 'Centre'
  | 'Right Wing'
  | 'Ruck-Rover'
  | 'Rover'
  | 'Ruck'
  | 'Left Half-forward'
  | 'Centre Half-forward'
  | 'Right Half-forward'
  | 'Left Forward Pocket'
  | 'Full-forward'
  | 'Right Forward Pocket'
  | 'Interchange'

export interface AllAustralianNomination {
  playerId: string
  playerName: string
  clubId: string
  positionGroup: AAPositionGroup
  primaryPosition: string        // e.g. 'CHB', 'IM', 'RK', 'FF'
  score: number                  // composite selection score
  gamesPlayed: number
  avgDisposals: number
  avgGoals: number
  avgMarks: number
  avgTackles: number
  avgClearances: number
  avgIntercepts: number
  avgHitouts: number
  avgContested: number
  avgInsideFifties: number
  avgRebound50s: number
  overallRating: number
}

export interface AllAustralianTeamMember {
  playerId: string
  playerName: string
  clubId: string
  positionGroup: AAPositionGroup
  slotLabel: AATeamSlotLabel
  isCaptain: boolean
  score: number
}

/** Live state during the current season */
export interface AllAustralianState {
  year: number
  squad: AllAustralianNomination[]       // 40-man squad announced at end of H&A
  squadAnnouncedRound: number
  team?: AllAustralianTeamMember[]       // final 22 named during finals
  teamAnnouncedRound?: number
  captainId?: string
}

/** Permanent history entry stored after each season */
export interface AllAustralianHistoryEntry {
  year: number
  squad: AllAustralianNomination[]
  squadAnnouncedRound: number
  team: AllAustralianTeamMember[]
  teamAnnouncedRound: number
  captainId?: string
}
