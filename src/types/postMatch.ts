import type { Match } from '@/types/match'
import type { MatchReport, MilestoneRecord } from '@/types/history'
import type { PlayerMoment } from '@/types/player'

export interface LadderSnapshot {
  homeRank: number
  awayRank: number
  homePoints: number
  awayPoints: number
  homePercentage: number
  awayPercentage: number
  homePositionBefore: number
  awayPositionBefore: number
}

/** A player who carried excessive fatigue into the match and underperformed. */
export interface OvertrainingImpactEntry {
  playerId: string
  playerName: string
  /** Fatigue reading captured before post-match effects were applied. */
  preMatchFatigue: number
  matchRating: number
  severity: 'mild' | 'heavy'
}

export interface PostMatchReviewPayload {
  userMatch: Match
  matchReport: MatchReport | null
  milestones: MilestoneRecord[]
  ladderSnapshot: LadderSnapshot | null
  /** Career-moment highlights for user-club players generated this match. */
  playerMoments?: { playerId: string; moment: PlayerMoment }[]
  /**
   * Players who had high pre-match fatigue AND underperformed (rating < 7.5).
   * Used to surface cause-and-effect explanations in the post-match review.
   */
  overtrainingImpact?: OvertrainingImpactEntry[]
}
