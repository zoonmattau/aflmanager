import { SeededRNG } from '@/engine/core/rng'
import type { Club } from '@/types/club'
import type { Match } from '@/types/match'
import type { TribunalCase, TribunalIncidentType, TribunalSeverity } from '@/types/discipline'
import type { Player, PlayerSuspensionHistoryEntry } from '@/types/player'

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
): { finalWeeks: number; outcome: PlayerSuspensionHistoryEntry['outcome']; summary: string } {
  const riskBias =
    clubRiskTolerance === 'aggressive' ? 0.06
    : clubRiskTolerance === 'conservative' ? -0.04
    : 0
  const evidenceBias = (evidenceScore - 50) / 400
  const roll = rng.next() + riskBias + evidenceBias

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

export function generateTribunalCasesFromMatches(params: {
  matches: Match[]
  players: Record<string, Player>
  userClubId: string
  date: string
  roundMarker: number
  phase: 'regular-season' | 'finals'
  rng: SeededRNG
}): TribunalCase[] {
  const { matches, players, userClubId, date, roundMarker, phase, rng } = params
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
      })
      seenPlayers.add(player.id)
    }
  }

  return created
}

export function resolveUserTribunalCase(params: {
  caseItem: TribunalCase
  decision: 'accept' | 'challenge'
  clubs: Record<string, Club>
  rng: SeededRNG
}): TribunalCase {
  const { caseItem, decision, clubs, rng } = params
  if (decision === 'accept') {
    return {
      ...caseItem,
      challenged: false,
      finalWeeks: caseItem.recommendedWeeks,
      outcomeSummary: caseItem.recommendedWeeks > 0
        ? `Club accepted sanction: ${caseItem.recommendedWeeks} week${caseItem.recommendedWeeks === 1 ? '' : 's'}.`
        : 'Club accepted sanction: financial warning only.',
      status: 'resolved',
      read: true,
    }
  }

  const club = clubs[caseItem.clubId]
  const challenge = challengeOutcome(
    rng,
    caseItem.recommendedWeeks,
    club?.aiPersonality.riskTolerance ?? 'moderate',
    caseItem.evidenceScore,
  )
  return {
    ...caseItem,
    challenged: true,
    finalWeeks: challenge.finalWeeks,
    outcomeSummary: challenge.summary,
    status: 'resolved',
    read: true,
  }
}

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
        status: 'resolved',
      }
    }

    const challenge = challengeOutcome(rng, item.recommendedWeeks, riskTolerance, item.evidenceScore)
    return {
      ...item,
      challenged: true,
      finalWeeks: challenge.finalWeeks,
      outcomeSummary: challenge.summary,
      status: 'resolved',
    }
  })
}

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
      status: 'expired',
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

