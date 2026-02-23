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
  | 'spoil'
  | 'out-of-bounds'
  | 'ball-up'
  | 'out-on-full'

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
  isStoppage: boolean   // goal, injury, or ball-up → pause playback
  stoppageType?: 'goal' | 'injury' | 'ball-up'
  goalPlayerId?: string
  injuryPlayerId?: string
  commentary: string
  /** Monotonically incrementing ID that groups consecutive same-team possessions into a chain. */
  chainId: number
}
