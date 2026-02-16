export type TribunalIncidentType =
  | 'high-contact'
  | 'rough-conduct'
  | 'dangerous-tackle'
  | 'striking'
  | 'tripping'
  | 'verbal-abuse'

export type TribunalSeverity = 'low' | 'medium' | 'high' | 'severe'

export type TribunalCaseStatus =
  | 'pending-user'
  | 'pending-ai'
  | 'resolved'
  | 'expired'

export interface TribunalCase {
  id: string
  createdAt: string
  roundMarker: number
  decisionDeadlineMarker: number
  phase: 'regular-season' | 'finals'
  matchId: string
  playerId: string
  clubId: string
  incidentType: TribunalIncidentType
  severity: TribunalSeverity
  incidentSummary: string
  evidenceScore: number
  recommendedWeeks: number
  finalWeeks: number | null
  challenged: boolean
  outcomeSummary: string | null
  status: TribunalCaseStatus
  read?: boolean
}
