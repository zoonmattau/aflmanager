import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import type { NewsItem } from '@/types/game'
import type { SeededRNG } from '@/engine/core/rng'
import { averageAttributes } from '@/engine/contracts/negotiation'
import {
  generateBoardExpectation,
  evaluateBoardSatisfaction,
  applyFanSatisfactionToJobSecurity,
} from '@/engine/clubs/clubManagement'
import {
  evolveClubIdentity,
  getClubIdentity,
  getClubIdentityLabel,
  getFanExpectationLabel,
} from '@/engine/clubs/identity'

interface RosterProfile {
  youthRatio: number
  primeRatio: number
  veteranRatio: number
  avgOverall: number
}

function computeRosterProfile(
  players: Record<string, Player>,
  clubId: string,
): RosterProfile {
  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length === 0) {
    return { youthRatio: 0, primeRatio: 0, veteranRatio: 0, avgOverall: 0 }
  }

  let youth = 0
  let prime = 0
  let veteran = 0
  let totalOverall = 0
  for (const p of roster) {
    if (p.age < 24) youth++
    else if (p.age <= 29) prime++
    else veteran++
    totalOverall += averageAttributes(p.attributes)
  }

  const count = roster.length
  return {
    youthRatio: youth / count,
    primeRatio: prime / count,
    veteranRatio: veteran / count,
    avgOverall: totalOverall / count,
  }
}

function determineCompetitiveWindow(
  ladderPosition: number,
  profile: RosterProfile,
): 'win-now' | 'balanced' | 'rebuilding' {
  if (ladderPosition <= 4 && profile.primeRatio >= 0.30) return 'win-now'
  if (ladderPosition <= 8 && profile.primeRatio >= 0.30 && profile.avgOverall >= 50) return 'win-now'
  if (ladderPosition >= 15) return 'rebuilding'
  if (ladderPosition >= 11 && profile.youthRatio >= 0.40) return 'rebuilding'
  if (ladderPosition >= 11 && profile.avgOverall < 48) return 'rebuilding'
  return 'balanced'
}

function alignDraftPhilosophy(
  window: 'win-now' | 'balanced' | 'rebuilding',
  rng: SeededRNG,
): 'best-available' | 'positional-need' | 'high-upside' {
  if (window === 'rebuilding') return rng.chance(0.70) ? 'high-upside' : 'best-available'
  if (window === 'win-now') return rng.chance(0.50) ? 'best-available' : 'positional-need'
  return rng.chance(0.50) ? 'positional-need' : 'best-available'
}

function alignTradeActivity(
  window: 'win-now' | 'balanced' | 'rebuilding',
  profile: RosterProfile,
): 'active' | 'moderate' | 'passive' {
  if (window === 'win-now') return 'active'
  if (window === 'rebuilding') return profile.veteranRatio > 0.20 ? 'active' : 'passive'
  return 'moderate'
}

export function evaluateAndUpdateAIStrategies(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  ladder: LadderEntry[],
  rng: SeededRNG,
  playerClubId: string,
  currentYear: number,
): { updatedClubs: Record<string, Club>; news: NewsItem[] } {
  const positionByClub = new Map<string, number>()
  for (let i = 0; i < ladder.length; i++) {
    positionByClub.set(ladder[i].clubId, i + 1)
  }

  const updatedClubs: Record<string, Club> = {}
  const news: NewsItem[] = []
  const dateStr = `${currentYear}-10-01`

  for (const club of Object.values(clubs)) {
    const ladderPosition = positionByClub.get(club.id) ?? 9
    const isFinalist = ladderPosition <= 8
    const identityUpdate = evolveClubIdentity({
      club,
      players,
      ladderPosition,
      rng,
      currentYear,
    })

    if (club.id === playerClubId) {
      const updated: Club = {
        ...club,
        lastSeasonLadderPosition: ladderPosition,
        identity: identityUpdate.identity,
      }

      const expectation = generateBoardExpectation(club, ladderPosition, rng)
      const satisfaction = evaluateBoardSatisfaction(expectation, ladderPosition, isFinalist)
      const finalJobSecurity = applyFanSatisfactionToJobSecurity(
        satisfaction.jobSecurity,
        club.fanSatisfaction,
      )

      news.push({
        id: crypto.randomUUID(),
        date: dateStr,
        headline: `${club.name} board reviews ${currentYear} season`,
        body:
          `${satisfaction.message} Your job security is at ${finalJobSecurity}%. ` +
          `Fan expectation heading into next year: ${getFanExpectationLabel(identityUpdate.identity.fanExpectation)}.`,
        category: 'general',
        clubIds: [club.id],
        playerIds: [],
      })

      if (identityUpdate.changed) {
        news.push({
          id: crypto.randomUUID(),
          date: dateStr,
          headline: `${club.name} identity shift: ${getClubIdentityLabel(identityUpdate.identity.current)}`,
          body:
            `${club.fullName} have shifted from ${getClubIdentityLabel(identityUpdate.identity.previous ?? identityUpdate.identity.current)} ` +
            `to ${getClubIdentityLabel(identityUpdate.identity.current)} based on list profile and season trajectory.`,
          category: 'general',
          clubIds: [club.id],
          playerIds: [],
        })
      }

      updatedClubs[club.id] = updated
      continue
    }

    const profile = computeRosterProfile(players, club.id)
    const newWindow = determineCompetitiveWindow(ladderPosition, profile)
    const oldWindow = club.aiPersonality.competitiveWindow
    const windowChanged = newWindow !== oldWindow

    const newDraftPhilosophy = alignDraftPhilosophy(newWindow, rng)
    const newTradeActivity = alignTradeActivity(newWindow, profile)
    const currentIdentity = identityUpdate.identity.current

    const adjustedDraftPhilosophy =
      currentIdentity === 'youth-development'
        ? (rng.chance(0.65) ? 'high-upside' : 'positional-need')
        : currentIdentity === 'star-chasing'
          ? (rng.chance(0.60) ? 'best-available' : 'positional-need')
          : 'positional-need'
    const adjustedTradeActivity =
      currentIdentity === 'star-chasing'
        ? 'active'
        : currentIdentity === 'youth-development'
          ? (profile.veteranRatio > 0.18 ? 'active' : 'moderate')
          : newTradeActivity
    const adjustedRiskTolerance =
      currentIdentity === 'defensive-powerhouse'
        ? (rng.chance(0.70) ? 'conservative' : 'moderate')
        : currentIdentity === 'star-chasing'
          ? (rng.chance(0.55) ? 'aggressive' : club.aiPersonality.riskTolerance)
          : club.aiPersonality.riskTolerance
    const identityAwareWindow =
      currentIdentity === 'youth-development' && newWindow === 'win-now'
        ? 'balanced'
        : currentIdentity === 'star-chasing' && newWindow === 'rebuilding'
          ? 'balanced'
          : newWindow

    const updated: Club = {
      ...club,
      lastSeasonLadderPosition: ladderPosition,
      identity: identityUpdate.identity,
      aiPersonality: {
        ...club.aiPersonality,
        competitiveWindow: identityAwareWindow,
        draftPhilosophy: adjustedDraftPhilosophy ?? newDraftPhilosophy,
        tradeActivity: adjustedTradeActivity,
        riskTolerance: adjustedRiskTolerance,
      },
    }

    if (windowChanged) {
      const labels: Record<string, string> = {
        'win-now': 'go all-in for a premiership',
        balanced: 'pursue a balanced approach',
        rebuilding: 'begin a list rebuild',
      }
      news.push({
        id: crypto.randomUUID(),
        date: dateStr,
        headline: `${club.name} shift to ${identityAwareWindow} strategy`,
        body: `After finishing ${ladderPosition}${ordinalSuffix(ladderPosition)} on the ladder, ${club.fullName} have decided to ${labels[identityAwareWindow]}. Previously they were in a '${oldWindow}' phase.`,
        category: 'general',
        clubIds: [club.id],
        playerIds: [],
      })
    }

    if (identityUpdate.changed) {
      const previousIdentity = identityUpdate.identity.previous ?? getClubIdentity(club, currentYear).current
      news.push({
        id: crypto.randomUUID(),
        date: dateStr,
        headline: `${club.name} identity shift: ${getClubIdentityLabel(identityUpdate.identity.current)}`,
        body:
          `${club.fullName} have moved from ${getClubIdentityLabel(previousIdentity)} to ` +
          `${getClubIdentityLabel(identityUpdate.identity.current)}. Fan expectation now: ` +
          `${getFanExpectationLabel(identityUpdate.identity.fanExpectation)}.`,
        category: 'general',
        clubIds: [club.id],
        playerIds: [],
      })
    }

    updatedClubs[club.id] = updated
  }

  return { updatedClubs, news }
}

function ordinalSuffix(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  if (mod10 === 1) return 'st'
  if (mod10 === 2) return 'nd'
  if (mod10 === 3) return 'rd'
  return 'th'
}
