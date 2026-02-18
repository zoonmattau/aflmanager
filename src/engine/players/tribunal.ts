import { SeededRNG } from '@/engine/core/rng'
import type { Club } from '@/types/club'
import type { Match } from '@/types/match'
import type {
  TribunalCase,
  TribunalIncidentType,
  TribunalSeverity,
  TribunalIntent,
  TribunalImpact,
  TribunalContactLevel,
  TribunalGrading,
  TribunalLegalRep,
  TribunalArgument,
  TribunalPlea,
  TribunalHearingResult,
} from '@/types/discipline'
import type { Player, PlayerSuspensionHistoryEntry } from '@/types/player'

// ---------------------------------------------------------------------------
// Incident templates
// ---------------------------------------------------------------------------

interface IncidentTemplate {
  incidentType: TribunalIncidentType
  summary: string
  minWeeks: number
  maxWeeks: number
  severity: TribunalSeverity
}

const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  {
    incidentType: 'high-contact',
    summary: 'High contact off the ball',
    minWeeks: 1,
    maxWeeks: 2,
    severity: 'medium',
  },
  {
    incidentType: 'rough-conduct',
    summary: 'Rough conduct in a marking contest',
    minWeeks: 1,
    maxWeeks: 3,
    severity: 'high',
  },
  {
    incidentType: 'dangerous-tackle',
    summary: 'Dangerous tackle likely to cause injury',
    minWeeks: 1,
    maxWeeks: 4,
    severity: 'high',
  },
  {
    incidentType: 'striking',
    summary: 'Striking incident reviewed by MRO',
    minWeeks: 2,
    maxWeeks: 5,
    severity: 'severe',
  },
  {
    incidentType: 'tripping',
    summary: 'Reckless trip in open play',
    minWeeks: 1,
    maxWeeks: 2,
    severity: 'low',
  },
  {
    incidentType: 'verbal-abuse',
    summary: 'Abusive language charge',
    minWeeks: 0,
    maxWeeks: 1,
    severity: 'low',
  },
]

// ---------------------------------------------------------------------------
// AFL Grading Matrix (Impact × Intent → base points)
// ---------------------------------------------------------------------------

const GRADING_MATRIX: Record<TribunalImpact, Record<TribunalIntent, number>> = {
  low:    { careless: 75,  reckless: 150, intentional: 200 },
  medium: { careless: 150, reckless: 200, intentional: 300 },
  high:   { careless: 200, reckless: 300, intentional: 450 },
  severe: { careless: 300, reckless: 450, intentional: 600 },
}

/** Points thresholds → weeks suspension */
const POINTS_TO_WEEKS: [number, number][] = [
  [100, 0],   // Reprimand/fine only
  [175, 1],
  [250, 2],
  [350, 3],
  [450, 4],
  [600, 5],
]

/** Carryover per prior offence (within last 2 seasons) */
const PRIOR_OFFENCE_CARRYOVER = 75

// ---------------------------------------------------------------------------
// Legal representation tiers
// ---------------------------------------------------------------------------

export const LEGAL_REP_OPTIONS: TribunalLegalRep[] = [
  { tier: 'none',           name: 'No Representation',  cost: 0,       successModifier: 0 },
  { tier: 'club-appointed', name: 'Club Lawyer',         cost: 15_000,  successModifier: 0.05 },
  { tier: 'specialist',     name: 'Sports Lawyer',       cost: 50_000,  successModifier: 0.12 },
  { tier: 'elite',          name: 'QC Barrister',        cost: 120_000, successModifier: 0.20 },
]

export function getLegalRepByTier(tier: TribunalLegalRep['tier']): TribunalLegalRep {
  return LEGAL_REP_OPTIONS.find((r) => r.tier === tier) ?? LEGAL_REP_OPTIONS[0]
}

// ---------------------------------------------------------------------------
// Contact level mapping per incident type
// ---------------------------------------------------------------------------

const CONTACT_LEVEL_WEIGHTS: Record<TribunalIncidentType, TribunalContactLevel[]> = {
  'high-contact':     ['high', 'head', 'head', 'body'],
  'rough-conduct':    ['body', 'body', 'high', 'groin'],
  'dangerous-tackle': ['body', 'body', 'high', 'head'],
  'striking':         ['head', 'head', 'high', 'body'],
  'tripping':         ['body', 'body', 'body', 'groin'],
  'verbal-abuse':     ['body', 'body', 'body', 'body'], // Contact level irrelevant
}

// ---------------------------------------------------------------------------
// Intent weights (influenced by player temperament)
// ---------------------------------------------------------------------------

function pickIntent(rng: SeededRNG, temperament: number): TribunalIntent {
  // Lower temperament = more likely intentional
  const intentionalChance = 0.15 + (100 - temperament) / 400 // 0.15 - 0.40
  const recklessChance = 0.35
  const roll = rng.next()
  if (roll < intentionalChance) return 'intentional'
  if (roll < intentionalChance + recklessChance) return 'reckless'
  return 'careless'
}

// ---------------------------------------------------------------------------
// Severity → Impact mapping
// ---------------------------------------------------------------------------

function severityToImpact(severity: TribunalSeverity): TribunalImpact {
  return severity as TribunalImpact // They map 1:1 (low/medium/high/severe)
}

// ---------------------------------------------------------------------------
// Core grading functions
// ---------------------------------------------------------------------------

export function computePriorRecord(
  player: Player,
  tribunalInbox: TribunalCase[],
): number {
  const history = player.suspensionHistory ?? []
  // Count resolved cases in last 2 seasons (rough: entries that resulted in suspension)
  let count = 0
  for (const entry of history) {
    if (entry.weeks > 0) count++
  }
  // Also count any already resolved cases in current inbox for this player
  for (const c of tribunalInbox) {
    if (c.playerId === player.id && c.status === 'resolved' && c.finalWeeks != null && c.finalWeeks > 0) {
      // Avoid double-counting if already in history
      if (!history.some((h) => h.issuedOn === c.createdAt && h.reason === c.incidentSummary)) {
        count++
      }
    }
  }
  return count
}

export function computeGrading(params: {
  incidentType: TribunalIncidentType
  impact: TribunalImpact
  intent: TribunalIntent
  contactLevel: TribunalContactLevel
  priorRecord: number
  enablePriorRecord: boolean
}): TribunalGrading {
  const { incidentType, impact, intent, contactLevel, priorRecord, enablePriorRecord } = params
  const basePoints = GRADING_MATRIX[impact][intent]
  const carryoverPoints = enablePriorRecord ? priorRecord * PRIOR_OFFENCE_CARRYOVER : 0
  const totalPoints = basePoints + carryoverPoints

  return {
    offenceType: incidentType,
    impact,
    intent,
    contactLevel,
    basePoints,
    carryoverPoints,
    totalPoints,
    earlyPleaDiscount: 25, // 25% standard early plea discount
  }
}

export function applyPleaDiscount(totalPoints: number, plea: TribunalPlea): number {
  if (plea === 'guilty-early') return Math.round(totalPoints * 0.75) // 25% off
  if (plea === 'guilty') return Math.round(totalPoints * 0.90)       // 10% off
  return totalPoints // not-guilty: no discount
}

export function pointsToWeeks(totalPoints: number): number {
  let weeks = 0
  for (const [threshold, w] of POINTS_TO_WEEKS) {
    if (totalPoints >= threshold) weeks = w
  }
  // Anything above 600 scales linearly
  if (totalPoints > 600) {
    weeks = 5 + Math.floor((totalPoints - 600) / 150)
  }
  return weeks
}

// ---------------------------------------------------------------------------
// Argument generation
// ---------------------------------------------------------------------------

const PROSECUTION_TEMPLATES: Record<TribunalIncidentType, string[]> = {
  'high-contact': [
    'The contact was clearly above the shoulders and constituted a reportable offence.',
    'The vision shows the player had time to adjust but elected to bump.',
    'The force of impact was disproportionate to any legitimate contest.',
    'The opponent sustained visible injury requiring medical attention.',
  ],
  'rough-conduct': [
    'The player made forceful contact that was not part of a legitimate football action.',
    'Vision shows deliberate contact well after the ball had left the contest.',
    'The action endangered the safety of the opponent without a legitimate football purpose.',
    'The player had ample time to pull out of the contest but chose to engage forcefully.',
  ],
  'dangerous-tackle': [
    'The tackle pinned the arms and drove the opponent headfirst into the ground.',
    'There was no attempt to mitigate the impact of the tackle.',
    'The player slung the opponent after the tackle was completed.',
    'The opponent was in a vulnerable position and the tackle technique was reckless.',
  ],
  'striking': [
    'The vision clearly shows a closed fist making contact with the opponent.',
    'The action was not part of any legitimate contest for the football.',
    'The strike was delivered with significant force, well away from the play.',
    'Multiple angles confirm the deliberate nature of the contact.',
  ],
  'tripping': [
    'The player extended their leg with no attempt to contest the football.',
    'The trip caused the opponent to fall heavily and risk injury.',
    'Vision shows the action was a clear trip with no mitigating factors.',
    'The player had no chance of reaching the ball when they extended their leg.',
  ],
  'verbal-abuse': [
    'Multiple witnesses confirmed the language used was abusive and inappropriate.',
    'The behaviour brought the game into disrepute and warrants sanction.',
    'The abuse was directed at an official, which the tribunal views with particular seriousness.',
    'The incident was captured clearly on broadcast microphones.',
  ],
}

const DEFENCE_TEMPLATES: Record<TribunalIncidentType, string[]> = {
  'high-contact': [
    'The player was attempting a legitimate football action and the contact was incidental.',
    'The opponent changed position at the last moment, making the high contact unavoidable.',
    'The player has an exemplary record and this was an isolated incident.',
    'The force of impact has been overstated — the opponent returned to the field shortly after.',
  ],
  'rough-conduct': [
    'The contact occurred in the course of legitimate play and was not unreasonable.',
    'The player was bracing for impact and the contact was a natural football action.',
    'No injury was sustained and the action did not warrant tribunal attention.',
    'The player showed immediate concern for the opponent, indicating lack of intent.',
  ],
  'dangerous-tackle': [
    'The tackle was a legitimate football action that went wrong in the contest.',
    'The momentum of the contest carried both players to the ground.',
    'The player attempted to pull out of the tackle but was unable to due to the pace of play.',
    'The opponent contributed to the awkward landing by twisting during the tackle.',
  ],
  'striking': [
    'The contact was open-handed and part of a legitimate attempt to break free from a hold.',
    'The player was being restrained and reacted instinctively to free himself.',
    'The impact was minimal and the vision is inconclusive regarding intent.',
    'The player was provoked by persistent physical attention throughout the match.',
  ],
  'tripping': [
    'The player was attempting to kick the ball and the trip was accidental.',
    'The contact was minor and did not endanger the opponent.',
    'It was a genuine attempt at the football that unfortunately caught the opponent.',
    'The player immediately checked on the opponent, showing no malicious intent.',
  ],
  'verbal-abuse': [
    'The player was frustrated in the heat of the moment and immediately apologised.',
    'The exact words have been disputed and cannot be confirmed from the evidence.',
    'The player has no prior record of this type of behaviour.',
    'The comments were heat-of-the-moment and not directed at any individual.',
  ],
}

export function generateArguments(
  incidentType: TribunalIncidentType,
  rng: SeededRNG,
): TribunalArgument[] {
  const args: TribunalArgument[] = []

  const prosTemplates = PROSECUTION_TEMPLATES[incidentType]
  const defTemplates = DEFENCE_TEMPLATES[incidentType]

  // Pick 2-3 prosecution arguments
  const prosCount = rng.nextInt(2, 3)
  const prosIndices = new Set<number>()
  while (prosIndices.size < prosCount && prosIndices.size < prosTemplates.length) {
    prosIndices.add(rng.nextInt(0, prosTemplates.length - 1))
  }
  for (const idx of prosIndices) {
    args.push({ side: 'prosecution', text: prosTemplates[idx] })
  }

  // Pick 2-3 defence arguments
  const defCount = rng.nextInt(2, 3)
  const defIndices = new Set<number>()
  while (defIndices.size < defCount && defIndices.size < defTemplates.length) {
    defIndices.add(rng.nextInt(0, defTemplates.length - 1))
  }
  for (const idx of defIndices) {
    args.push({ side: 'defence', text: defTemplates[idx] })
  }

  return args
}

// ---------------------------------------------------------------------------
// Probability computation
// ---------------------------------------------------------------------------

export function computeProbabilities(params: {
  grading: TribunalGrading
  evidenceScore: number
  legalRepModifier: number
  plea: TribunalPlea
}): { dismissed: number; reduced: number; upheld: number; increased: number } {
  const { grading, evidenceScore, legalRepModifier, plea } = params

  if (plea === 'guilty-early' || plea === 'guilty') {
    // Plea accepted: guaranteed outcome (upheld at discounted rate)
    return { dismissed: 0, reduced: 0, upheld: 1, increased: 0 }
  }

  // Not guilty plea: challenge outcome probabilities
  // Base probabilities from evidence + grading
  const evidenceFactor = (evidenceScore - 50) / 100 // -0.20 to +0.44
  const pointsFactor = Math.min(0.3, grading.totalPoints / 2000) // Higher points = harder to dismiss

  let dismissed = Math.max(0.05, 0.25 - evidenceFactor * 0.3 - pointsFactor + legalRepModifier)
  let reduced = Math.max(0.05, 0.35 - evidenceFactor * 0.15 + legalRepModifier * 0.5)
  let increased = Math.max(0.03, 0.10 + evidenceFactor * 0.15 - legalRepModifier * 0.3)
  let upheld = Math.max(0.10, 1 - dismissed - reduced - increased)

  // Normalize to sum to 1
  const total = dismissed + reduced + upheld + increased
  dismissed = dismissed / total
  reduced = reduced / total
  upheld = upheld / total
  increased = increased / total

  return {
    dismissed: Math.round(dismissed * 100) / 100,
    reduced: Math.round(reduced * 100) / 100,
    upheld: Math.round(upheld * 100) / 100,
    increased: Math.round(increased * 100) / 100,
  }
}

export function computeExpectedRange(params: {
  grading: TribunalGrading
  plea: TribunalPlea
  probabilities: { dismissed: number; reduced: number; upheld: number; increased: number }
}): { min: number; max: number } {
  const { grading, plea } = params
  const effectivePoints = applyPleaDiscount(grading.totalPoints, plea)
  const baseWeeks = pointsToWeeks(effectivePoints)

  if (plea === 'guilty-early' || plea === 'guilty') {
    return { min: baseWeeks, max: baseWeeks }
  }

  // Not-guilty: range from dismissed (0) to increased (+1)
  return {
    min: 0,
    max: Math.max(1, baseWeeks + 1),
  }
}

// ---------------------------------------------------------------------------
// Hearing date computation
// ---------------------------------------------------------------------------

function computeHearingDate(matchDate: string): string {
  const d = new Date(matchDate)
  // Hearing is Tuesday or Wednesday after the match
  const dayOfWeek = d.getDay()
  // Move to next Tuesday (day 2)
  let daysToAdd = (2 - dayOfWeek + 7) % 7
  if (daysToAdd === 0) daysToAdd = 7 // If match is on Tuesday, hearing is next Tuesday
  if (daysToAdd < 2) daysToAdd += 1  // Ensure at least 2 days gap
  d.setDate(d.getDate() + daysToAdd)
  return d.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampChance(value: number): number {
  return Math.max(0.0008, Math.min(0.05, value))
}

function pickTemplate(rng: SeededRNG): IncidentTemplate {
  const idx = rng.nextInt(0, INCIDENT_TEMPLATES.length - 1)
  return INCIDENT_TEMPLATES[idx]
}

function challengeOutcome(
  rng: SeededRNG,
  recommendedWeeks: number,
  clubRiskTolerance: Club['aiPersonality']['riskTolerance'],
  evidenceScore: number,
  legalRepModifier: number = 0,
): { finalWeeks: number; outcome: PlayerSuspensionHistoryEntry['outcome']; summary: string } {
  const riskBias =
    clubRiskTolerance === 'aggressive' ? 0.06
    : clubRiskTolerance === 'conservative' ? -0.04
    : 0
  const evidenceBias = (evidenceScore - 50) / 400
  const roll = rng.next() + riskBias + evidenceBias - legalRepModifier

  if (roll < 0.2) {
    return {
      finalWeeks: 0,
      outcome: 'dismissed',
      summary: 'Challenge successful. Charge dismissed.',
    }
  }
  if (roll < 0.56) {
    return {
      finalWeeks: Math.max(0, recommendedWeeks - 1),
      outcome: 'reduced',
      summary: 'Challenge partially successful. Penalty reduced.',
    }
  }
  if (roll < 0.9) {
    return {
      finalWeeks: recommendedWeeks,
      outcome: 'upheld',
      summary: 'Challenge unsuccessful. Original sanction upheld.',
    }
  }
  return {
    finalWeeks: recommendedWeeks + 1,
    outcome: 'increased',
    summary: 'Challenge backfired. Tribunal increased the penalty.',
  }
}

// ---------------------------------------------------------------------------
// Generate tribunal cases from matches (enhanced)
// ---------------------------------------------------------------------------

export function generateTribunalCasesFromMatches(params: {
  matches: Match[]
  players: Record<string, Player>
  userClubId: string
  date: string
  roundMarker: number
  phase: 'regular-season' | 'finals'
  rng: SeededRNG
  tribunalInbox?: TribunalCase[]
  enablePriorRecord?: boolean
}): TribunalCase[] {
  const {
    matches, players, userClubId, date, roundMarker, phase, rng,
    tribunalInbox = [],
    enablePriorRecord = true,
  } = params
  const created: TribunalCase[] = []
  const seenPlayers = new Set<string>()

  for (const match of matches) {
    if (!match.result) continue
    for (const stats of [...match.result.homePlayerStats, ...match.result.awayPlayerStats]) {
      const player = players[stats.playerId]
      if (!player || seenPlayers.has(player.id)) continue

      const temperamentRisk = (100 - player.personality.temperament) / 100
      const pressureRisk = player.attributes.pressure / 100
      const baseChance = 0.0014
      const freesRisk = Math.min(0.004, stats.freesAgainst * 0.0014)
      const tackleRisk = Math.min(0.003, stats.tackles * 0.00028)
      const fatigueRisk = player.fatigue >= 72 ? 0.0014 : 0
      const chance = clampChance(baseChance + temperamentRisk * 0.005 + pressureRisk * 0.0018 + freesRisk + tackleRisk + fatigueRisk)

      if (!rng.chance(chance)) continue

      const template = pickTemplate(rng)
      const evidenceScore = Math.round(
        Math.max(30, Math.min(94, 50 + stats.freesAgainst * 8 + stats.tackles * 1.3 + rng.nextInt(-16, 18))),
      )
      let recommendedWeeks = rng.nextInt(template.minWeeks, template.maxWeeks)
      if (evidenceScore >= 85 && recommendedWeeks > 0) recommendedWeeks += 1
      if (evidenceScore <= 42) recommendedWeeks = Math.max(0, recommendedWeeks - 1)

      // Enhanced: compute grading fields
      const intent = pickIntent(rng, player.personality.temperament)
      const impact = severityToImpact(template.severity)
      const contactLevels = CONTACT_LEVEL_WEIGHTS[template.incidentType]
      const contactLevel = contactLevels[rng.nextInt(0, contactLevels.length - 1)]
      const priorRecord = computePriorRecord(player, tribunalInbox)
      const grading = computeGrading({
        incidentType: template.incidentType,
        impact,
        intent,
        contactLevel,
        priorRecord,
        enablePriorRecord,
      })

      // Use grading points to derive recommended weeks
      const gradingWeeks = pointsToWeeks(grading.totalPoints)
      // Blend old template-based weeks with grading-based weeks (grading takes priority)
      recommendedWeeks = Math.max(recommendedWeeks, gradingWeeks)

      const hearingDate = computeHearingDate(date)
      const calendarEventId = crypto.randomUUID()

      created.push({
        id: crypto.randomUUID(),
        createdAt: date,
        roundMarker,
        decisionDeadlineMarker: roundMarker + 1,
        phase,
        matchId: match.id,
        playerId: player.id,
        clubId: player.clubId,
        incidentType: template.incidentType,
        severity: template.severity,
        incidentSummary: template.summary,
        evidenceScore,
        recommendedWeeks,
        finalWeeks: null,
        challenged: false,
        outcomeSummary: null,
        status: player.clubId === userClubId ? 'pending-user' : 'pending-ai',
        // Enhanced fields
        intent,
        impact,
        contactLevel,
        grading,
        priorRecord,
        hearingDate,
        calendarEventId,
      })
      seenPlayers.add(player.id)
    }
  }

  return created
}

// ---------------------------------------------------------------------------
// Resolve user tribunal case (enhanced with plea + legal rep)
// ---------------------------------------------------------------------------

export function resolveUserTribunalCase(params: {
  caseItem: TribunalCase
  decision: 'accept' | 'challenge'
  clubs: Record<string, Club>
  rng: SeededRNG
  plea?: TribunalPlea
  legalRep?: TribunalLegalRep | null
  attended?: boolean
}): TribunalCase {
  const { caseItem, decision, clubs, rng, attended = true } = params
  let plea = params.plea
  let legalRep = params.legalRep ?? null

  // Map old-style decisions to new plea system for backward compat
  if (!plea) {
    plea = decision === 'accept' ? 'guilty-early' : 'not-guilty'
  }
  if (!legalRep && plea === 'not-guilty') {
    legalRep = LEGAL_REP_OPTIONS[0] // No representation
  }

  const grading = caseItem.grading ?? computeGrading({
    incidentType: caseItem.incidentType,
    impact: (caseItem.impact ?? caseItem.severity) as TribunalImpact,
    intent: caseItem.intent ?? 'careless',
    contactLevel: caseItem.contactLevel ?? 'body',
    priorRecord: caseItem.priorRecord ?? 0,
    enablePriorRecord: true,
  })

  const arguments_ = generateArguments(caseItem.incidentType, rng)
  const legalRepModifier = legalRep?.successModifier ?? 0

  const probabilities = computeProbabilities({
    grading,
    evidenceScore: caseItem.evidenceScore,
    legalRepModifier,
    plea,
  })

  const expectedRange = computeExpectedRange({ grading, plea, probabilities })

  if (plea === 'guilty-early') {
    const discountedPoints = applyPleaDiscount(grading.totalPoints, 'guilty-early')
    const weeks = pointsToWeeks(discountedPoints)
    const hearingResult: TribunalHearingResult = {
      plea,
      legalRep,
      arguments: arguments_,
      grading,
      probabilities,
      expectedRange,
      attended,
    }
    return {
      ...caseItem,
      challenged: false,
      finalWeeks: weeks,
      outcomeSummary: weeks > 0
        ? `Early guilty plea accepted. Sanction: ${weeks} week${weeks === 1 ? '' : 's'} (25% discount applied).`
        : 'Early guilty plea accepted. Reprimand only (no suspension).',
      status: 'resolved',
      read: true,
      plea,
      legalRep,
      hearingResult,
      attended,
    }
  }

  if (plea === 'guilty') {
    const discountedPoints = applyPleaDiscount(grading.totalPoints, 'guilty')
    const weeks = pointsToWeeks(discountedPoints)
    const hearingResult: TribunalHearingResult = {
      plea,
      legalRep,
      arguments: arguments_,
      grading,
      probabilities,
      expectedRange,
      attended,
    }
    return {
      ...caseItem,
      challenged: false,
      finalWeeks: weeks,
      outcomeSummary: weeks > 0
        ? `Guilty plea accepted. Sanction: ${weeks} week${weeks === 1 ? '' : 's'} (10% discount applied).`
        : 'Guilty plea accepted. Reprimand only (no suspension).',
      status: 'resolved',
      read: true,
      plea,
      legalRep,
      hearingResult,
      attended,
    }
  }

  // Not guilty: full hearing
  const club = clubs[caseItem.clubId]
  const challenge = challengeOutcome(
    rng,
    caseItem.recommendedWeeks,
    club?.aiPersonality.riskTolerance ?? 'moderate',
    caseItem.evidenceScore,
    legalRepModifier,
  )

  const hearingResult: TribunalHearingResult = {
    plea,
    legalRep,
    arguments: arguments_,
    grading,
    probabilities,
    expectedRange,
    attended,
  }

  return {
    ...caseItem,
    challenged: true,
    finalWeeks: challenge.finalWeeks,
    outcomeSummary: challenge.summary,
    status: 'resolved',
    read: true,
    plea,
    legalRep,
    hearingResult,
    attended,
  }
}

// ---------------------------------------------------------------------------
// AI tribunal resolution (unchanged logic, enhanced data)
// ---------------------------------------------------------------------------

export function resolveAITribunalCases(params: {
  caseItems: TribunalCase[]
  clubs: Record<string, Club>
  rng: SeededRNG
}): TribunalCase[] {
  const { caseItems, clubs, rng } = params
  return caseItems.map((item) => {
    if (item.status !== 'pending-ai') return item
    const club = clubs[item.clubId]
    const riskTolerance = club?.aiPersonality.riskTolerance ?? 'moderate'
    const challengeChance =
      item.recommendedWeeks >= 3 ? 0.44
      : item.recommendedWeeks >= 2 ? 0.34
      : 0.2
    const riskAdj =
      riskTolerance === 'aggressive' ? 0.11
      : riskTolerance === 'conservative' ? -0.09
      : 0
    const willChallenge = rng.chance(Math.max(0.05, Math.min(0.82, challengeChance + riskAdj)))
    if (!willChallenge) {
      return {
        ...item,
        challenged: false,
        finalWeeks: item.recommendedWeeks,
        outcomeSummary: item.recommendedWeeks > 0
          ? `Accepted sanction: ${item.recommendedWeeks} week${item.recommendedWeeks === 1 ? '' : 's'}.`
          : 'Accepted sanction: no suspension.',
        status: 'resolved' as const,
      }
    }

    const challenge = challengeOutcome(rng, item.recommendedWeeks, riskTolerance, item.evidenceScore)
    return {
      ...item,
      challenged: true,
      finalWeeks: challenge.finalWeeks,
      outcomeSummary: challenge.summary,
      status: 'resolved' as const,
    }
  })
}

// ---------------------------------------------------------------------------
// Expiry & player outcome application (unchanged)
// ---------------------------------------------------------------------------

export function expirePendingUserTribunalCases(
  caseItems: TribunalCase[],
  roundMarker: number,
): TribunalCase[] {
  return caseItems.map((item) => {
    if (item.status !== 'pending-user') return item
    if (item.decisionDeadlineMarker > roundMarker) return item
    return {
      ...item,
      challenged: false,
      finalWeeks: item.recommendedWeeks,
      outcomeSummary: item.recommendedWeeks > 0
        ? `Deadline expired. Automatic sanction applied: ${item.recommendedWeeks} week${item.recommendedWeeks === 1 ? '' : 's'}.`
        : 'Deadline expired. Matter closed with no suspension.',
      status: 'expired' as const,
      read: false,
    }
  })
}

export function applyTribunalOutcomeToPlayer(
  player: Player,
  caseItem: TribunalCase,
): void {
  if (caseItem.finalWeeks === null) return

  if (!player.suspensionHistory) player.suspensionHistory = []
  const historyOutcome: PlayerSuspensionHistoryEntry['outcome'] =
    caseItem.status === 'expired' ? 'expired'
    : caseItem.finalWeeks === 0 ? 'dismissed'
    : caseItem.challenged ? (caseItem.finalWeeks > caseItem.recommendedWeeks ? 'increased' : caseItem.finalWeeks < caseItem.recommendedWeeks ? 'reduced' : 'upheld')
    : 'upheld'

  player.suspensionHistory.push({
    reason: caseItem.incidentSummary,
    incidentType: caseItem.incidentType,
    issuedOn: caseItem.createdAt,
    weeks: caseItem.finalWeeks,
    severity: caseItem.severity,
    challenged: caseItem.challenged,
    outcome: historyOutcome,
  })

  if (caseItem.finalWeeks <= 0) return

  const existingWeeks = Math.max(0, player.suspension?.weeksRemaining ?? 0)
  const totalWeeks = existingWeeks + caseItem.finalWeeks
  player.suspension = {
    reason: caseItem.incidentSummary,
    incidentType: caseItem.incidentType,
    issuedOn: caseItem.createdAt,
    totalWeeks,
    weeksRemaining: totalWeeks,
    severity: caseItem.severity,
  }
}

export function serveSuspensionWeeks(players: Record<string, Player>): void {
  for (const player of Object.values(players)) {
    if (!player.suspension) continue
    player.suspension.weeksRemaining = Math.max(0, player.suspension.weeksRemaining - 1)
    if (player.suspension.weeksRemaining <= 0) {
      player.suspension = null
    }
  }
}
