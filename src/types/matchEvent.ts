export type TacticalEventType =
  | 'quarter-break'
  | 'injury'
  | 'momentum-shift'
  | 'close-game'
  | 'blowout'
  | 'tag-failing'

export interface TacticalEvent {
  id: string
  type: TacticalEventType
  quarter: number
  title: string
  description: string
  urgency: 'info' | 'warning' | 'critical'
  relatedPlayerId?: string
}

export type MidMatchDecisionType =
  | 'change-tempo'
  | 'change-aggression'
  | 'change-defensive-style'
  | 'activate-sub'
  | 'tag-switch'
  | 'move-player-forward'
  | 'move-player-back'
  | 'protect-lead'
  | 'chase-game'
  | 'stay-course'

export interface MidMatchDecision {
  id: string
  type: MidMatchDecisionType
  label: string
  description: string
  params?: {
    tempo?: 'fast' | 'medium' | 'slow'
    aggression?: 'high' | 'medium' | 'low'
    offensiveStyle?: 'attacking' | 'balanced' | 'defensive'
    defensiveLine?: 'press' | 'zone' | 'hold' | 'run'
    activateSubForPlayerId?: string
    tagTargetPlayerId?: string
    movePlayerId?: string
    moveDirection?: 'forward' | 'back'
  }
}

export interface MidMatchAdjustment {
  quarter: number
  decisionType: MidMatchDecisionType
  description: string
}

export interface QuarterInjury {
  playerId: string
  playerName: string
  clubId: string
  quarter: number
  injuryType: string
  weeksOut: number
  severity: 'minor' | 'moderate' | 'major' | 'severe'
}

export interface LiveMatchDisplayState {
  phase: 'pre-match' | 'simulating-quarter' | 'quarter-break' | 'complete'
  homeClubId: string
  awayClubId: string
  venue: string
  weather: string
  groundCondition: string
  quartersCompleted: number
  homeScores: Array<{ goals: number; behinds: number; total: number }>
  awayScores: Array<{ goals: number; behinds: number; total: number }>
  homeTotalScore: number
  awayTotalScore: number
  keyEvents: Array<{
    quarter: number
    minute: number
    type: string
    description: string
    playerId?: string
    clubId: string
  }>
  tacticalEvents: TacticalEvent[]
  availableDecisions: MidMatchDecision[]
  quarterInjuries: QuarterInjury[]
  subAvailable: boolean
  subActivated: boolean
  adjustmentsMade: MidMatchAdjustment[]
  attendance?: number
}
