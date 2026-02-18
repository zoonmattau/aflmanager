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

export type TribunalPlea = 'guilty-early' | 'guilty' | 'not-guilty'
export type TribunalIntent = 'careless' | 'reckless' | 'intentional'
export type TribunalImpact = 'low' | 'medium' | 'high' | 'severe'
export type TribunalContactLevel = 'body' | 'high' | 'groin' | 'head'

export interface TribunalGrading {
  offenceType: TribunalIncidentType
  impact: TribunalImpact
  intent: TribunalIntent
  contactLevel: TribunalContactLevel
  basePoints: number
  carryoverPoints: number
  totalPoints: number
  earlyPleaDiscount: number   // Percentage reduction (typically 25%)
}

export interface TribunalLegalRep {
  tier: 'none' | 'club-appointed' | 'specialist' | 'elite'
  name: string
  cost: number
  successModifier: number     // -0.10 to +0.20 added to challenge roll
}

export interface TribunalArgument {
  side: 'prosecution' | 'defence'
  text: string
}

export interface TribunalHearingResult {
  plea: TribunalPlea
  legalRep: TribunalLegalRep | null
  arguments: TribunalArgument[]
  grading: TribunalGrading
  probabilities: {
    dismissed: number
    reduced: number
    upheld: number
    increased: number
  }
  expectedRange: { min: number; max: number }
  attended: boolean
}

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

  // Enhanced tribunal fields (optional for backward compat)
  intent?: TribunalIntent
  impact?: TribunalImpact
  contactLevel?: TribunalContactLevel
  grading?: TribunalGrading
  plea?: TribunalPlea
  legalRep?: TribunalLegalRep | null
  hearingResult?: TribunalHearingResult | null
  hearingDate?: string
  priorRecord?: number
  attended?: boolean
  calendarEventId?: string
}
