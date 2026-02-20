export type FieldZone = 'back50' | 'backHalf' | 'midfield' | 'forwardHalf' | 'forward50'

export type PossessionType =
  | 'kick'
  | 'handball'
  | 'mark'
  | 'tackle'
  | 'clearance'
  | 'contest'
  | 'free-for'
  | 'goal'
  | 'behind'
  | 'injury'
  | 'interchange'

export interface MatchTick {
  tickIndex: number
  quarter: number
  minute: number        // 0–30
  zone: FieldZone
  possessionType: PossessionType
  clubId: string        // team with the ball / associated with event
  playerId?: string
  playerName?: string
  homeScore: number     // running total at this tick
  awayScore: number
  isStoppage: boolean   // goal or injury → pause playback
  stoppageType?: 'goal' | 'injury'
  goalPlayerId?: string
  injuryPlayerId?: string
  commentary: string
}
