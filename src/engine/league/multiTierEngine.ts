import { simulateRound } from '@/engine/season/advanceRound'
import { createInitialLadder, generateFixture } from '@/engine/season/fixtureGenerator'
import { sortLadderEntries } from '@/engine/season/ladderSorting'
import type { Club } from '@/types/club'
import type { LeagueConfig } from '@/types/expansion'
import type { GameSettings, NewsItem } from '@/types/game'
import type { Match } from '@/types/match'
import type { Player } from '@/types/player'
import type { LadderEntry, Season } from '@/types/season'

export interface MultiTierCompetitionState {
  tier: number
  name: string
  clubIds: string[]
  season: Season
  ladder: LadderEntry[]
  matchResults: Match[]
}

export interface MultiTierState {
  enabled: boolean
  currentRound: number
  competitions: MultiTierCompetitionState[]
}

function buildTierMap(leagueConfig: LeagueConfig, allClubIds: string[]): Record<string, number> {
  const configured = leagueConfig.clubTierMap ?? {}
  const tierCount = Math.max(1, leagueConfig.tierCount ?? 1)
  const map: Record<string, number> = {}

  const assigned = new Set<string>()
  for (const [clubId, tier] of Object.entries(configured)) {
    if (!allClubIds.includes(clubId)) continue
    map[clubId] = Math.max(1, Math.min(tierCount, tier))
    assigned.add(clubId)
  }

  const remaining = allClubIds.filter((id) => !assigned.has(id))
  if (remaining.length === 0) return map
  const splitSize = Math.ceil(allClubIds.length / tierCount)
  for (let i = 0; i < remaining.length; i++) {
    map[remaining[i]] = Math.min(tierCount, Math.floor(i / splitSize) + 1)
  }
  return map
}

function buildTierClubLists(leagueConfig: LeagueConfig, clubs: Record<string, Club>): Array<{ tier: number; clubIds: string[] }> {
  const clubIds = leagueConfig.activeClubIds.length > 0 ? leagueConfig.activeClubIds : Object.keys(clubs)
  const tierCount = Math.max(1, leagueConfig.tierCount ?? 1)
  const map = buildTierMap(leagueConfig, clubIds)
  const buckets: Array<{ tier: number; clubIds: string[] }> = []
  for (let tier = 1; tier <= tierCount; tier++) {
    const ids = clubIds.filter((id) => map[id] === tier)
    if (ids.length >= 2) buckets.push({ tier, clubIds: ids })
  }
  return buckets
}

export function initializeMultiTierState(params: {
  clubs: Record<string, Club>
  leagueConfig: LeagueConfig
  settings: GameSettings
  seed: number
}): MultiTierState | null {
  const { clubs, leagueConfig, settings, seed } = params
  if (!leagueConfig.enablePromotionRelegation) return null
  if ((leagueConfig.tierCount ?? 1) < 2) return null
  const tiers = buildTierClubLists(leagueConfig, clubs)
  if (tiers.length < 2) return null

  const competitions: MultiTierCompetitionState[] = []
  for (const tierInfo of tiers) {
    const tierClubs: Record<string, Club> = {}
    for (const id of tierInfo.clubIds) {
      const club = clubs[id]
      if (club) tierClubs[id] = club
    }
    const tierSeason = generateFixture({
      clubs: tierClubs,
      seed: seed + tierInfo.tier * 1009,
      settings,
    })
    competitions.push({
      tier: tierInfo.tier,
      name: `Tier ${tierInfo.tier}`,
      clubIds: [...tierInfo.clubIds],
      season: tierSeason,
      ladder: createInitialLadder(tierInfo.clubIds),
      matchResults: [],
    })
  }

  return {
    enabled: true,
    currentRound: 0,
    competitions,
  }
}

function updateLadderForMatches(
  ladder: LadderEntry[],
  matches: Match[],
  settings: GameSettings,
): LadderEntry[] {
  const ptsWin = settings.ladderPoints.pointsForWin ?? 4
  const ptsDraw = settings.ladderPoints.pointsForDraw ?? 2
  const ptsLoss = settings.ladderPoints.pointsForLoss ?? 0
  const next = ladder.map((entry) => ({ ...entry }))

  for (const match of matches) {
    if (!match.result) continue
    const home = next.find((e) => e.clubId === match.homeClubId)
    const away = next.find((e) => e.clubId === match.awayClubId)
    if (!home || !away) continue

    home.played += 1
    away.played += 1
    home.pointsFor += match.result.homeTotalScore
    home.pointsAgainst += match.result.awayTotalScore
    away.pointsFor += match.result.awayTotalScore
    away.pointsAgainst += match.result.homeTotalScore

    if (match.result.homeTotalScore > match.result.awayTotalScore) {
      home.wins += 1
      home.points += ptsWin
      away.losses += 1
      away.points += ptsLoss
    } else if (match.result.awayTotalScore > match.result.homeTotalScore) {
      away.wins += 1
      away.points += ptsWin
      home.losses += 1
      home.points += ptsLoss
    } else {
      home.draws += 1
      away.draws += 1
      home.points += ptsDraw
      away.points += ptsDraw
    }

    home.percentage = home.pointsAgainst > 0 ? (home.pointsFor / home.pointsAgainst) * 100 : 0
    away.percentage = away.pointsAgainst > 0 ? (away.pointsFor / away.pointsAgainst) * 100 : 0
  }

  return sortLadderEntries(next, settings.ladderSorting)
}

export function simulateMultiTierRound(params: {
  multiTierState: MultiTierState
  clubs: Record<string, Club>
  players: Record<string, Player>
  settings: GameSettings
  roundIndex: number
  rngSeed: number
}): MultiTierState {
  const { multiTierState, clubs, players, settings, roundIndex, rngSeed } = params
  if (!multiTierState.enabled) return multiTierState

  const competitions = multiTierState.competitions.map((comp) => {
    const round = comp.season.rounds[roundIndex]
    if (!round) return comp
    const sim = simulateRound({
      round,
      roundIndex,
      players,
      clubs,
      rngSeed: rngSeed + comp.tier * 73,
      playerClubId: '',
      matchRules: settings.matchRules,
    })
    const nextLadder = updateLadderForMatches(comp.ladder, sim.matches, settings)
    return {
      ...comp,
      ladder: nextLadder,
      matchResults: [...comp.matchResults, ...sim.matches],
    }
  })

  return {
    ...multiTierState,
    currentRound: Math.max(multiTierState.currentRound, roundIndex + 1),
    competitions,
  }
}

export function applyPromotionRelegation(params: {
  multiTierState: MultiTierState | null
  leagueConfig: LeagueConfig
  clubs: Record<string, Club>
  currentYear: number
  currentDate: string
}): {
  leagueConfig: LeagueConfig
  news: NewsItem[]
} {
  const { multiTierState, leagueConfig, clubs, currentYear, currentDate } = params
  if (!multiTierState || !leagueConfig.enablePromotionRelegation || multiTierState.competitions.length < 2) {
    return { leagueConfig, news: [] }
  }

  const nextConfig: LeagueConfig = {
    ...leagueConfig,
    activeClubIds: [...leagueConfig.activeClubIds],
    expansionPlans: leagueConfig.expansionPlans.map((p) => ({ ...p })),
    clubTierMap: { ...(leagueConfig.clubTierMap ?? {}) },
  }
  const news: NewsItem[] = []
  const competitions = [...multiTierState.competitions].sort((a, b) => a.tier - b.tier)
  const configuredSpots = Math.max(0, leagueConfig.promotionRelegationSpots ?? 0)
  if (configuredSpots <= 0) {
    return { leagueConfig: nextConfig, news }
  }

  for (let i = 0; i < competitions.length - 1; i++) {
    const upper = competitions[i]
    const lower = competitions[i + 1]
    if (upper.ladder.length < 1 || lower.ladder.length < 1) continue

    const maxMovements = Math.min(configuredSpots, upper.ladder.length, lower.ladder.length)
    if (maxMovements <= 0) continue

    const promotedIds = lower.ladder.slice(0, maxMovements).map((e) => e.clubId)
    const relegatedIds = upper.ladder.slice(-maxMovements).map((e) => e.clubId)
    const promotedSet = new Set(promotedIds)
    const relegatedSet = new Set(relegatedIds)
    const overlap = promotedIds.some((id) => relegatedSet.has(id)) || relegatedIds.some((id) => promotedSet.has(id))
    if (overlap) continue

    for (const clubId of relegatedIds) {
      nextConfig.clubTierMap![clubId] = lower.tier
    }
    for (const clubId of promotedIds) {
      nextConfig.clubTierMap![clubId] = upper.tier
    }

    const promotedNames = promotedIds.map((id) => clubs[id]?.fullName ?? id)
    const relegatedNames = relegatedIds.map((id) => clubs[id]?.fullName ?? id)
    news.push({
      id: crypto.randomUUID(),
      date: currentDate,
      headline: `Promotion/Relegation confirmed for ${currentYear + 1}`,
      body:
        `Promoted to Tier ${upper.tier}: ${promotedNames.join(', ')}. ` +
        `Relegated to Tier ${lower.tier}: ${relegatedNames.join(', ')}.`,
      category: 'general',
      clubIds: [...promotedIds, ...relegatedIds],
      playerIds: [],
    })
  }

  return { leagueConfig: nextConfig, news }
}
