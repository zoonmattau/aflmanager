import type { GameHistory, DraftHistoryEntry } from '@/types/history'
import type { CompletedTrade } from '@/types/game'
import type { GameSettings } from '@/types/game'
import type { Player, PlayerAttributes } from '@/types/player'
import type { Club } from '@/types/club'
import { resolveListConstraints, validateClubList, mustDelist } from '@/engine/rules/listRules'
import { getListCounts } from '@/engine/contracts/freeAgency'
import { calculateClubSalaryTotal } from '@/engine/contracts/negotiation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

function getOverall(player: Player): number {
  let total = 0
  for (const key of ALL_ATTRIBUTE_KEYS) {
    total += player.attributes[key]
  }
  return total / ALL_ATTRIBUTE_KEYS.length
}

function getAgeFactor(age: number): number {
  if (age < 25) return 1.3
  if (age <= 30) return 1.0
  return 0.7
}

// ---------------------------------------------------------------------------
// Trade Grades
// ---------------------------------------------------------------------------

export type TradeGradeLetter = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F'

export interface TradeGrade {
  tradeId: string
  clubAGrade: TradeGradeLetter
  clubBGrade: TradeGradeLetter
  clubAName: string
  clubBName: string
  assessment: string
  clubADiff: number
  clubBDiff: number
}

function gradeFromDiff(diff: number): TradeGradeLetter {
  if (diff >= 15) return 'A+'
  if (diff >= 8) return 'A'
  if (diff >= 3) return 'B+'
  if (diff >= -3) return 'B'
  if (diff >= -8) return 'C'
  if (diff >= -15) return 'D'
  return 'F'
}

/**
 * Grade a completed trade retrospectively based on the current overall of
 * the players exchanged, weighted by age factor.
 */
export function gradeTradeRetrospective(
  trade: CompletedTrade,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
): TradeGrade {
  // Value received by Club A (players that went TO A)
  let valueReceivedByA = 0
  let valueGivenByA = 0

  for (const pid of trade.playersToA) {
    const p = players[pid]
    if (p) valueReceivedByA += getOverall(p) * getAgeFactor(p.age)
  }
  for (const pid of trade.playersToB) {
    const p = players[pid]
    if (p) valueGivenByA += getOverall(p) * getAgeFactor(p.age)
  }

  const diffA = valueReceivedByA - valueGivenByA
  const diffB = -diffA

  const clubAName = clubs[trade.clubA]?.name ?? trade.clubA
  const clubBName = clubs[trade.clubB]?.name ?? trade.clubB

  let assessment: string
  if (Math.abs(diffA) < 3) {
    assessment = 'A balanced trade that worked out fairly for both sides.'
  } else if (diffA > 0) {
    assessment = `${clubAName} got the better end of this deal.`
  } else {
    assessment = `${clubBName} got the better end of this deal.`
  }

  return {
    tradeId: trade.id,
    clubAGrade: gradeFromDiff(diffA),
    clubBGrade: gradeFromDiff(diffB),
    clubAName,
    clubBName,
    assessment,
    clubADiff: Math.round(diffA * 10) / 10,
    clubBDiff: Math.round(diffB * 10) / 10,
  }
}

// ---------------------------------------------------------------------------
// Draft Steals
// ---------------------------------------------------------------------------

export interface DraftSteal {
  playerId: string
  playerName: string
  pickNumber: number
  clubId: string
  stealScore: number
  currentOverall: number
}

/**
 * Find the best "draft steals" — late picks who turned out much better
 * than their draft position suggested.
 */
export function findDraftSteals(
  history: GameHistory,
  players: Record<string, Player>,
  limit: number = 10,
): DraftSteal[] {
  const steals: DraftSteal[] = []

  for (const entry of history.draftHistory) {
    if (entry.pickNumber <= 20) continue

    const player = players[entry.playerId]
    if (!player) continue

    const currentOverall = getOverall(player)
    const expectedBaseline = 70 - entry.pickNumber * 0.5
    const stealScore = currentOverall - expectedBaseline

    if (stealScore > 0) {
      steals.push({
        playerId: entry.playerId,
        playerName: entry.playerName,
        pickNumber: entry.pickNumber,
        clubId: entry.clubId,
        stealScore,
        currentOverall: Math.round(currentOverall),
      })
    }
  }

  steals.sort((a, b) => b.stealScore - a.stealScore)
  return steals.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Offseason Summary
// ---------------------------------------------------------------------------

export interface RetireeSummary {
  playerId: string
  playerName: string
  clubId: string
  careerGames: number
  careerGoals: number
}

export interface OffseasonSummary {
  year: number
  premierClubId: string | null
  premierClubName: string
  grandFinalScore: { home: number; away: number } | null
  retirements: RetireeSummary[]
  trades: (CompletedTrade & { grade?: TradeGrade })[]
  draftPicks: DraftHistoryEntry[]
  draftSteals: DraftSteal[]
  listAudit: ClubListAuditEntry[]
  tradeReview: TradeReviewEntry[]
  draftReview: DraftReviewEntry[]
  draftReaches: DraftSteal[]
}

export interface ClubListAuditEntry {
  clubId: string
  clubName: string
  senior: number
  rookie: number
  total: number
  maxSenior: number
  maxRookie: number
  maxTotal: number
  listErrors: number
  listWarnings: number
  mustDelistCount: number
  capSpend: number
  capLimit: number
  capSpace: number
  overCap: boolean
  grade: TradeGradeLetter
}

export interface TradeReviewEntry {
  clubId: string
  clubName: string
  tradeCount: number
  netValueDiff: number
  avgValueDiff: number
  grade: TradeGradeLetter
}

export interface DraftReviewEntry {
  clubId: string
  clubName: string
  pickCount: number
  avgValueDiff: number
  grade: TradeGradeLetter
}

function gradeFromValueDiff(diff: number): TradeGradeLetter {
  if (diff >= 10) return 'A+'
  if (diff >= 6) return 'A'
  if (diff >= 3) return 'B+'
  if (diff >= 1) return 'B'
  if (diff >= -1) return 'C'
  if (diff >= -4) return 'D'
  return 'F'
}

function expectedDraftOverall(pickNumber: number): number {
  const baseline = 73 - pickNumber * 0.48
  return Math.max(42, baseline)
}

/**
 * Build a structured summary of an offseason for rendering.
 */
export function buildOffseasonSummary(
  year: number,
  history: GameHistory,
  tradeHistory: CompletedTrade[],
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  settings: GameSettings,
): OffseasonSummary {
  // Find the season record for this year
  const seasonRecord = history.seasons.find((s) => s.year === year)

  // Retirements: prefer explicit legacy entries for this year (stable snapshots).
  const retirements: RetireeSummary[] = (history.retirementLegacies ?? [])
    .filter((entry) => entry.retiredYear === year)
    .map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      clubId: entry.retiredFromClubId,
      careerGames: entry.gamesPlayed,
      careerGoals: entry.goals,
    }))
    .sort((a, b) => b.careerGames - a.careerGames)
    .slice(0, 20)

  // Trades from the current offseason (filter by year in date)
  const yearStr = String(year)
  const currentTrades = tradeHistory
    .filter((t) => t.date.startsWith(yearStr))
    .map((trade) => ({
      ...trade,
      grade: gradeTradeRetrospective(trade, players, clubs),
    }))

  // Draft picks for this year
  const draftPicks = history.draftHistory.filter((d) => d.year === year)

  const constraints = resolveListConstraints(settings)
  const listAudit: ClubListAuditEntry[] = Object.values(clubs).map((club) => {
    const counts = getListCounts(players, club.id)
    const validation = validateClubList(players, club.id, constraints)
    const delistCount = mustDelist(players, club.id, constraints)
    const clubPlayers = Object.values(players).filter((p) => p.clubId === club.id)
    const capSpend = Math.round(calculateClubSalaryTotal(clubPlayers, club.id))
    const capLimit = settings.salaryCapAmount
    const capSpace = capLimit - capSpend
    const overCap = settings.salaryCap && capSpace < 0
    const penalty = validation.errors.length * 5 + delistCount * 2 + (overCap ? 5 : 0)
    const score = 8 - penalty

    return {
      clubId: club.id,
      clubName: club.name,
      senior: counts.senior,
      rookie: counts.rookie,
      total: counts.total,
      maxSenior: constraints.maxSenior,
      maxRookie: constraints.maxRookie,
      maxTotal: constraints.maxTotal,
      listErrors: validation.errors.length,
      listWarnings: validation.warnings.length,
      mustDelistCount: delistCount,
      capSpend,
      capLimit,
      capSpace,
      overCap,
      grade: gradeFromValueDiff(score),
    }
  }).sort((a, b) => {
    if (a.listErrors !== b.listErrors) return b.listErrors - a.listErrors
    if (a.mustDelistCount !== b.mustDelistCount) return b.mustDelistCount - a.mustDelistCount
    return a.clubName.localeCompare(b.clubName)
  })

  const tradeReviewMap = new Map<string, { tradeCount: number; net: number }>()
  for (const trade of currentTrades) {
    if (!trade.grade) continue
    const a = tradeReviewMap.get(trade.clubA) ?? { tradeCount: 0, net: 0 }
    a.tradeCount += 1
    a.net += trade.grade.clubADiff
    tradeReviewMap.set(trade.clubA, a)

    const b = tradeReviewMap.get(trade.clubB) ?? { tradeCount: 0, net: 0 }
    b.tradeCount += 1
    b.net += trade.grade.clubBDiff
    tradeReviewMap.set(trade.clubB, b)
  }

  const tradeReview: TradeReviewEntry[] = Object.values(clubs)
    .map((club) => {
      const data = tradeReviewMap.get(club.id) ?? { tradeCount: 0, net: 0 }
      const avg = data.tradeCount > 0 ? data.net / data.tradeCount : 0
      return {
        clubId: club.id,
        clubName: club.name,
        tradeCount: data.tradeCount,
        netValueDiff: Math.round(data.net * 10) / 10,
        avgValueDiff: Math.round(avg * 10) / 10,
        grade: gradeFromValueDiff(avg),
      }
    })
    .sort((a, b) => b.avgValueDiff - a.avgValueDiff)

  const draftValueRows = draftPicks
    .map((pick) => {
      const player = players[pick.playerId]
      if (!player) return null
      const actual = getOverall(player)
      const expected = expectedDraftOverall(pick.pickNumber)
      const diff = actual - expected
      return {
        playerId: pick.playerId,
        playerName: pick.playerName,
        clubId: pick.clubId,
        pickNumber: pick.pickNumber,
        valueDiff: diff,
        currentOverall: Math.round(actual),
      }
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))

  const draftByClub = new Map<string, { sum: number; count: number }>()
  for (const row of draftValueRows) {
    const agg = draftByClub.get(row.clubId) ?? { sum: 0, count: 0 }
    agg.sum += row.valueDiff
    agg.count += 1
    draftByClub.set(row.clubId, agg)
  }

  const draftReview: DraftReviewEntry[] = Object.values(clubs)
    .map((club) => {
      const agg = draftByClub.get(club.id) ?? { sum: 0, count: 0 }
      const avg = agg.count > 0 ? agg.sum / agg.count : 0
      return {
        clubId: club.id,
        clubName: club.name,
        pickCount: agg.count,
        avgValueDiff: Math.round(avg * 10) / 10,
        grade: gradeFromValueDiff(avg),
      }
    })
    .sort((a, b) => b.avgValueDiff - a.avgValueDiff)

  const draftSteals: DraftSteal[] = draftValueRows
    .filter((row) => row.valueDiff > 2 || (row.pickNumber >= 20 && row.valueDiff > 1))
    .sort((a, b) => b.valueDiff - a.valueDiff)
    .slice(0, 10)
    .map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      pickNumber: row.pickNumber,
      clubId: row.clubId,
      stealScore: Math.round(row.valueDiff * 10) / 10,
      currentOverall: row.currentOverall,
    }))

  const draftReaches: DraftSteal[] = draftValueRows
    .filter((row) => row.valueDiff < -3 || (row.pickNumber <= 20 && row.valueDiff < -2))
    .sort((a, b) => a.valueDiff - b.valueDiff)
    .slice(0, 10)
    .map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      pickNumber: row.pickNumber,
      clubId: row.clubId,
      stealScore: Math.round(row.valueDiff * 10) / 10,
      currentOverall: row.currentOverall,
    }))

  return {
    year,
    premierClubId: seasonRecord?.premierClubId ?? null,
    premierClubName: seasonRecord
      ? (clubs[seasonRecord.premierClubId]?.name ?? seasonRecord.premierClubId)
      : 'TBD',
    grandFinalScore: seasonRecord?.grandFinalScore ?? null,
    retirements,
    trades: currentTrades,
    draftPicks,
    draftSteals,
    listAudit,
    tradeReview,
    draftReview,
    draftReaches,
  }
}
