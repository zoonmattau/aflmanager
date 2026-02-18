import type { ClubFacilities } from './club'

export type FacilityUpgradeStatus = 'under-construction' | 'completed' | 'denied'

export interface ApprovalFactor {
  label: string
  modifier: number // e.g. +10, -5
}

export interface FacilityUpgradeRequest {
  id: string
  clubId: string
  facility: keyof ClubFacilities
  fromLevel: number
  toLevel: number
  cost: number
  status: FacilityUpgradeStatus
  requestedDate: string
  approvalProbability: number
  denialReason?: string
  constructionWeeksTotal: number
  constructionWeeksRemaining: number
  startedDate?: string
  completedDate?: string
}

export interface FacilityUpgradeTracker {
  requests: FacilityUpgradeRequest[]
  /** clubId of clubs currently under construction -> request id */
  activeConstructionByClub: Record<string, string>
  /** clubId:facility -> ISO date when cooldown expires (denied requests) */
  denialCooldowns: Record<string, string>
}
