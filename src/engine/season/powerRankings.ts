import type { Club } from '@/types/club'
import type { Match } from '@/types/match'
import type { Player } from '@/types/player'
import type { LadderEntry, PowerRankingEntry, PowerRankingSnapshot, Season } from '@/types/season'

interface ComputePowerRankingsInput {
  year: number
  round: number
  date: string
  clubs: Record<string, Club>
  players: Record<string, Player>
  ladder: LadderEntry[]
  season: Season
  matchResults: Match[]
  previousSnapshot?: PowerRankingSnapshot | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function averageAttributes(player: Player): number {
  const values = Object.values(player.attributes).filter((v) => typeof v === 'number')
  if (values.length === 0) return 50
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getClubTravelFatigue(match: Match, clubId: string): number {
  const fatigue = match.result?.simulationContext?.travelFatigue
  if (!fatigue) return 0
  if (match.homeClubId === clubId) return fatigue.home
  if (match.awayClubId === clubId) return fatigue.away
  return 0
}

function getClubMatches(matchResults: Match[], clubId: string): Match[] {
  return matchResults
    .filter((match) => match.result && (match.homeClubId === clubId || match.awayClubId === clubId))
    .sort((a, b) => b.round - a.round)
}

function getOpponentStrength(ladderByClub: Map<string, LadderEntry>, clubId: string): number {
  const entry = ladderByClub.get(clubId)
  if (!entry) return 50
  const ladderRankScore = clamp(entry.points * 4.5, 0, 100)
  const percentageScore = clamp(((entry.percentage - 70) / 70) * 100, 0, 100)
  return clamp(ladderRankScore * 0.55 + percentageScore * 0.45, 20, 95)
}

function getUpcomingOpponents(clubId: string, season: Season, currentRoundIdx: number, lookAhead: number): string[] {
  const opponents: string[] = []
  for (let i = currentRoundIdx; i < season.rounds.length && opponents.length < lookAhead; i++) {
    const round = season.rounds[i]
    const fixture = round.fixtures.find((f) => f.homeClubId === clubId || f.awayClubId === clubId)
    if (!fixture) continue
    opponents.push(fixture.homeClubId === clubId ? fixture.awayClubId : fixture.homeClubId)
  }
  return opponents
}

function getClubTalentScore(players: Player[]): number {
  if (players.length === 0) return 50
  const top22 = [...players]
    .map((player) => averageAttributes(player))
    .sort((a, b) => b - a)
    .slice(0, 22)
  if (top22.length === 0) return 50
  return clamp((top22.reduce((sum, value) => sum + value, 0) / top22.length) * 1.05, 25, 95)
}

function getClubInjuryScore(players: Player[]): number {
  if (players.length === 0) return 50
  let totalImpact = 0
  let unavailableImpact = 0
  for (const player of players) {
    const impact = clamp(averageAttributes(player), 45, 99)
    totalImpact += impact
    const injured = !!player.injury
    const suspended = (player.suspension?.weeksRemaining ?? 0) > 0
    if (!injured && !suspended) continue
    if (injured) {
      const weeks = player.injury?.weeksRemaining ?? 0
      const severityMultiplier = weeks >= 8 ? 1.1 : weeks >= 4 ? 1 : 0.82
      unavailableImpact += impact * severityMultiplier
    } else if (suspended) {
      unavailableImpact += impact * 0.9
    }
  }
  if (totalImpact <= 0) return 50
  const unavailablePct = clamp(unavailableImpact / totalImpact, 0, 1)
  return clamp(100 - unavailablePct * 100, 10, 100)
}

function getFormScore(
  clubId: string,
  recentMatches: Match[],
  ladderByClub: Map<string, LadderEntry>,
): { formScore: number; scheduleDifficulty: number; travelLoad: number } {
  if (recentMatches.length === 0) {
    return { formScore: 50, scheduleDifficulty: 50, travelLoad: 0 }
  }

  const weights = [1, 0.85, 0.7, 0.55, 0.4]
  let weightedScore = 0
  let totalWeight = 0
  let opponentStrengthTotal = 0
  let travelTotal = 0

  for (let i = 0; i < Math.min(5, recentMatches.length); i++) {
    const match = recentMatches[i]
    const result = match.result
    if (!result) continue
    const weight = weights[i] ?? 0.35
    const isHome = match.homeClubId === clubId
    const scored = isHome ? result.homeTotalScore : result.awayTotalScore
    const conceded = isHome ? result.awayTotalScore : result.homeTotalScore
    const margin = scored - conceded
    const outcomeBase = scored > conceded ? 66 : scored < conceded ? 34 : 50
    const opponentId = isHome ? match.awayClubId : match.homeClubId
    const opponentStrength = getOpponentStrength(ladderByClub, opponentId)
    const travelFatigue = getClubTravelFatigue(match, clubId)

    const marginAdjustment = clamp(margin, -60, 60) * 0.25
    const opponentAdjustment = (opponentStrength - 50) * 0.15
    const travelAdjustment = travelFatigue * 1.6

    const matchScore = clamp(outcomeBase + marginAdjustment + opponentAdjustment - travelAdjustment, 0, 100)
    weightedScore += matchScore * weight
    totalWeight += weight
    opponentStrengthTotal += opponentStrength
    travelTotal += travelFatigue
  }

  const formScore = totalWeight > 0 ? weightedScore / totalWeight : 50
  const scheduleDifficulty = opponentStrengthTotal / Math.min(5, recentMatches.length)
  const travelLoad = clamp((travelTotal / Math.min(5, recentMatches.length)) * 10, 0, 100)

  return {
    formScore: clamp(formScore, 0, 100),
    scheduleDifficulty: clamp(scheduleDifficulty, 0, 100),
    travelLoad,
  }
}

export function computeWeeklyPowerRankings(input: ComputePowerRankingsInput): PowerRankingSnapshot {
  const ladderByClub = new Map(input.ladder.map((entry) => [entry.clubId, entry]))
  const previousRankByClub = new Map(
    (input.previousSnapshot?.entries ?? []).map((entry) => [entry.clubId, entry.rank]),
  )

  const entries: PowerRankingEntry[] = Object.keys(input.clubs).map((clubId) => {
    const clubPlayers = Object.values(input.players).filter((player) => player.clubId === clubId)
    const recentMatches = getClubMatches(input.matchResults, clubId)
    const recent = getFormScore(clubId, recentMatches, ladderByClub)
    const upcomingOpponents = getUpcomingOpponents(clubId, input.season, input.round, 2)
    const upcomingDifficulty = upcomingOpponents.length > 0
      ? upcomingOpponents
        .map((opponentId) => getOpponentStrength(ladderByClub, opponentId))
        .reduce((sum, value) => sum + value, 0) / upcomingOpponents.length
      : 50

    const scheduleDifficulty = clamp(recent.scheduleDifficulty * 0.7 + upcomingDifficulty * 0.3, 0, 100)
    const talentScore = getClubTalentScore(clubPlayers)
    const injuryScore = getClubInjuryScore(clubPlayers)
    const travelLoad = recent.travelLoad

    const baseScore =
      recent.formScore * 0.44 +
      talentScore * 0.22 +
      injuryScore * 0.2 +
      (100 - travelLoad) * 0.14
    const scheduleAdjustment = (scheduleDifficulty - 50) * 0.12
    const score = clamp(baseScore + scheduleAdjustment, 0, 100)

    return {
      clubId,
      rank: 0,
      previousRank: previousRankByClub.get(clubId) ?? null,
      movement: 0,
      score: Math.round(score * 10) / 10,
      formScore: Math.round(recent.formScore * 10) / 10,
      injuryScore: Math.round(injuryScore * 10) / 10,
      fixtureDifficulty: Math.round(scheduleDifficulty * 10) / 10,
      travelLoad: Math.round(travelLoad * 10) / 10,
    }
  })

  entries.sort((a, b) => b.score - a.score || b.formScore - a.formScore || a.clubId.localeCompare(b.clubId))
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    entry.rank = i + 1
    entry.movement = entry.previousRank ? entry.previousRank - entry.rank : 0
  }

  return {
    year: input.year,
    round: input.round,
    date: input.date,
    entries,
  }
}
