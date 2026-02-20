import type { Match } from '@/types/match'
import type { MatchReport, MilestoneRecord } from '@/types/history'

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

export interface PostMatchReviewPayload {
  userMatch: Match
  matchReport: MatchReport | null
  milestones: MilestoneRecord[]
  ladderSnapshot: LadderSnapshot | null
}
