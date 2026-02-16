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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RosterProfile {
  youthRatio: number   // aged < 24
  primeRatio: number   // aged 24-29
  veteranRatio: number // aged 30+
  avgOverall: number
}

function computeRosterProfile(
  players: Record<string, Player>,
  clubId: string,
): RosterProfile {
  const roster = Object.values(players).filter(
    (p) => p.clubId === clubId && !p.injury?.permanent,
  )
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
  // Top 4 with a prime-aged core → win-now
  if (ladderPosition <= 4 && profile.primeRatio >= 0.30) return 'win-now'
  // Top 8 with prime core and decent quality → win-now
  if (ladderPosition <= 8 && profile.primeRatio >= 0.30 && profile.avgOverall >= 50) return 'win-now'
  // Bottom 4 → rebuilding
  if (ladderPosition >= 15) return 'rebuilding'
  // Bottom half with very young list → rebuilding
  if (ladderPosition >= 11 && profile.youthRatio >= 0.40) return 'rebuilding'
  // Bottom half with low quality → rebuilding
  if (ladderPosition >= 11 && profile.avgOverall < 48) return 'rebuilding'
  // Everything else → balanced
  return 'balanced'
}

function alignDraftPhilosophy(
  window: 'win-now' | 'balanced' | 'rebuilding',
  rng: SeededRNG,
): 'best-available' | 'positional-need' | 'high-upside' {
  if (window === 'rebuilding') {
    return rng.chance(0.70) ? 'high-upside' : 'best-available'
  }
  if (window === 'win-now') {
    return rng.chance(0.50) ? 'best-available' : 'positional-need'
  }
  // balanced
  return rng.chance(0.50) ? 'positional-need' : 'best-available'
}

function alignTradeActivity(
  window: 'win-now' | 'balanced' | 'rebuilding',
  profile: RosterProfile,
): 'active' | 'moderate' | 'passive' {
  if (window === 'win-now') return 'active'
  if (window === 'rebuilding') {
    return profile.veteranRatio > 0.20 ? 'active' : 'passive'
  }
  return 'moderate'
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function evaluateAndUpdateAIStrategies(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  ladder: LadderEntry[],
  rng: SeededRNG,
  playerClubId: string,
  currentYear: number,
): { updatedClubs: Record<string, Club>; news: NewsItem[] } {
  // Build a position lookup from the sorted ladder
  const positionByClub = new Map<string, number>()
  // Ladder is already sorted by points desc; index+1 = position
  for (let i = 0; i < ladder.length; i++) {
    positionByClub.set(ladder[i].clubId, i + 1)
  }

  const updatedClubs: Record<string, Club> = {}
  const news: NewsItem[] = []
  const dateStr = `${currentYear}-10-01`

  for (const club of Object.values(clubs)) {
    const ladderPosition = positionByClub.get(club.id) ?? 9 // fallback mid-table
    const isFinalist = ladderPosition <= 8

    if (club.id === playerClubId) {
      // --- User's club: track position + board feedback only ---
      const updated: Club = {
        ...club,
        lastSeasonLadderPosition: ladderPosition,
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
        body: `${satisfaction.message} Your job security is at ${finalJobSecurity}%.`,
        category: 'general',
        clubIds: [club.id],
        playerIds: [],
      })

      updatedClubs[club.id] = updated
      continue
    }

    // --- AI club: evaluate and potentially update strategy ---
    const profile = computeRosterProfile(players, club.id)
    const newWindow = determineCompetitiveWindow(ladderPosition, profile)
    const oldWindow = club.aiPersonality.competitiveWindow
    const windowChanged = newWindow !== oldWindow

    const newDraftPhilosophy = alignDraftPhilosophy(newWindow, rng)
    const newTradeActivity = alignTradeActivity(newWindow, profile)

    const updated: Club = {
      ...club,
      lastSeasonLadderPosition: ladderPosition,
      aiPersonality: {
        ...club.aiPersonality,
        competitiveWindow: newWindow,
        draftPhilosophy: newDraftPhilosophy,
        tradeActivity: newTradeActivity,
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
        headline: `${club.name} shift to ${newWindow} strategy`,
        body: `After finishing ${ladderPosition}${ordinalSuffix(ladderPosition)} on the ladder, ${club.fullName} have decided to ${labels[newWindow]}. Previously they were in a '${oldWindow}' phase.`,
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
