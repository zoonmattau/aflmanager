import type { GameHistory, DraftHistoryEntry } from '@/types/history'
import type { CompletedTrade } from '@/types/game'
import type { Player, PlayerAttributes } from '@/types/player'
import type { Club } from '@/types/club'

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
): OffseasonSummary {
  // Find the season record for this year
  const seasonRecord = history.seasons.find((s) => s.year === year)

  // Retirements: players with clubId === 'retired'
  const retirements: RetireeSummary[] = Object.values(players)
    .filter((p) => p.clubId === 'retired' && p.careerStats.gamesPlayed > 0)
    .slice(0, 20)
    .map((p) => ({
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      clubId: p.clubId,
      careerGames: p.careerStats.gamesPlayed,
      careerGoals: p.careerStats.goals,
    }))
    .sort((a, b) => b.careerGames - a.careerGames)

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

  // Draft steals (only meaningful after 2+ seasons)
  const draftSteals = history.seasons.length >= 2
    ? findDraftSteals(history, players)
    : []

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
  }
}
