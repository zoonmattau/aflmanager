import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { GameSettings, NewsItem } from '@/types/game'
import type { SeededRNG } from '@/engine/core/rng'
import {
  calculatePlayerValue,
  evaluateOffer,
  roundSalary,
} from '@/engine/contracts/negotiation'
import { validateContractOffer } from '@/engine/salary/salaryCapEngine'
import { buildYearByYearFromStructure } from '@/engine/contracts/contractStructures'
import { MINIMUM_SALARY } from '@/engine/core/constants'
import { resolveListConstraints, canAddToSeniorList } from '@/engine/rules/listRules'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOverall(player: Player): number {
  const values = Object.values(player.attributes) as number[]
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

function getClubPlayers(
  players: Record<string, Player>,
  clubId: string,
): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId)
}

function getPositionalCounts(
  players: Record<string, Player>,
  clubId: string,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const group = p.position.primary
    counts[group] = (counts[group] ?? 0) + 1
  }
  return counts
}

function generateId(prefix: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = `${prefix}_`
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)]
  }
  return id
}

// ---------------------------------------------------------------------------
// 1. processAIReSignings
// ---------------------------------------------------------------------------

/**
 * AI clubs attempt to re-sign their expiring players during mid-season.
 * Each AI club scores expiring players and offers the top 60-80% new contracts.
 */
export function processAIReSignings(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  playerClubId: string,
  currentRound: number,
  currentDate: string,
  settings: GameSettings,
): {
  signings: { playerId: string; clubId: string }[]
  news: NewsItem[]
} {
  const signings: { playerId: string; clubId: string }[] = []
  const news: NewsItem[] = []

  for (const club of Object.values(clubs)) {
    // Skip user's club
    if (club.id === playerClubId) continue

    // Find expiring players (1 or 2 years remaining)
    const clubRoster = getClubPlayers(players, club.id)
    const expiring = clubRoster.filter(
      (p) => p.contract.yearsRemaining <= 2 && p.contract.yearsRemaining > 0,
    )

    if (expiring.length === 0) continue

    // Score each expiring player
    const scored = expiring.map((player) => {
      const overall = getOverall(player)
      const ageCurve = player.age <= 30 ? 1.0 : Math.max(0.4, 1.0 - (player.age - 30) * 0.1)

      // Positional need
      const posCounts = getPositionalCounts(players, club.id)
      const posCount = posCounts[player.position.primary] ?? 0
      const positionalNeed = posCount <= 3 ? 1.0 : posCount <= 5 ? 0.6 : 0.3

      // Window alignment
      let windowAlignment = 0.5
      switch (club.aiPersonality.competitiveWindow) {
        case 'win-now':
          windowAlignment = player.age >= 24 && player.age <= 30 ? 1.0 : 0.3
          break
        case 'rebuilding':
          windowAlignment = player.age <= 25 ? 1.0 : 0.3
          break
        case 'balanced':
          windowAlignment = 0.7
          break
      }

      const score = overall * 0.35 + ageCurve * 25 + positionalNeed * 20 + windowAlignment * 20
      return { player, score }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    // Re-sign the top 60-80%
    const reSignPct = 0.6 + rng.next() * 0.2
    const reSignCount = Math.max(1, Math.ceil(scored.length * reSignPct))

    for (let i = 0; i < reSignCount && i < scored.length; i++) {
      const { player } = scored[i]
      const marketValue = calculatePlayerValue(player)

      // Offer at 90-115% of market value based on window
      let offerMultiplier = 1.0
      switch (club.aiPersonality.competitiveWindow) {
        case 'win-now': offerMultiplier = 1.05 + rng.next() * 0.10; break
        case 'balanced': offerMultiplier = 0.95 + rng.next() * 0.10; break
        case 'rebuilding': offerMultiplier = 0.90 + rng.next() * 0.10; break
      }

      const offerAav = roundSalary(Math.max(MINIMUM_SALARY, marketValue * offerMultiplier))

      // Cap check
      if (settings.salaryCap) {
        const allPlayers = Object.values(players)
        const currentSalary = player.contract.yearByYear[0] ?? 0
        const capResult = validateContractOffer(
          allPlayers, club.id, offerAav, currentSalary,
          settings.salaryCapAmount, settings.realism.softCapSpending,
        )
        if (!capResult.allowed) continue
      }

      // Determine contract years
      let contractYears: number
      if (player.age <= 24) contractYears = rng.nextInt(3, 5)
      else if (player.age <= 28) contractYears = rng.nextInt(2, 4)
      else if (player.age <= 31) contractYears = rng.nextInt(1, 3)
      else contractYears = rng.nextInt(1, 2)

      // Evaluate using the engine's evaluateOffer
      const yearByYear = buildYearByYearFromStructure(offerAav, contractYears, 'escalating')
      const result = evaluateOffer(
        player,
        { years: contractYears, aav: offerAav, yearByYear, clubId: club.id },
        club.id,
        rng,
        { playerLoyaltyEnabled: settings.realism.playerLoyalty },
      )

      if (result.accepted) {
        // Apply the contract
        player.contract = {
          yearsRemaining: contractYears,
          aav: offerAav,
          yearByYear,
          isRestricted: false,
        }

        signings.push({ playerId: player.id, clubId: club.id })

        const fullName = `${player.firstName} ${player.lastName}`
        news.push({
          id: generateId('news', rng),
          date: currentDate,
          headline: `${fullName} re-signs with ${club.name}`,
          body: `${fullName} has re-signed with ${club.name} on a ${contractYears}-year deal worth $${offerAav.toLocaleString()} per year.`,
          category: 'contract',
          clubIds: [club.id],
          playerIds: [player.id],
        })
      }
    }
  }

  return { signings, news }
}

// ---------------------------------------------------------------------------
// 2. processAIFreeAgentBidding
// ---------------------------------------------------------------------------

/**
 * Enhanced replacement for processAIFreeAgency in offseasonFlow.ts.
 * AI clubs bid on free agents with consideration for cap space, positional need,
 * competitive window, and clause compatibility.
 */
export function processAIFreeAgentBidding(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  freeAgentIds: string[],
  rng: SeededRNG,
  playerClubId: string,
  settings: GameSettings,
  currentDate: string,
): {
  updatedPlayers: Record<string, Player>
  signings: { playerId: string; newClubId: string }[]
  news: NewsItem[]
} {
  // Clone players
  const updatedPlayers: Record<string, Player> = {}
  for (const [id, p] of Object.entries(players)) {
    updatedPlayers[id] = {
      ...p,
      contract: { ...p.contract, yearByYear: [...p.contract.yearByYear] },
    }
  }

  const signings: { playerId: string; newClubId: string }[] = []
  const newsItems: NewsItem[] = []

  const aiClubs = Object.values(clubs).filter((c) => c.id !== playerClubId)
  const constraints = resolveListConstraints(settings)

  for (const faId of freeAgentIds) {
    const freeAgent = updatedPlayers[faId]
    if (!freeAgent) continue
    if (freeAgent.clubId === 'retired') continue

    const marketValue = calculatePlayerValue(freeAgent)
    const overall = getOverall(freeAgent)

    // Skip very low-rated players
    if (overall < 25) continue

    // Collect bids
    const bids: { clubId: string; bidValue: number }[] = []

    for (const club of aiClubs) {
      // List space check
      if (!canAddToSeniorList(updatedPlayers, club.id, constraints)) continue

      // Cap check
      if (settings.salaryCap) {
        const allPlayers = Object.values(updatedPlayers)
        const capResult = validateContractOffer(
          allPlayers, club.id, marketValue, 0,
          settings.salaryCapAmount, settings.realism.softCapSpending,
        )
        if (!capResult.allowed) continue
      }

      // Positional need
      const posCounts = getPositionalCounts(updatedPlayers, club.id)
      const primaryCount = posCounts[freeAgent.position.primary] ?? 0
      const hasNeed = primaryCount < 4

      // Base interest
      let interest = 0.15
      if (hasNeed) interest += 0.25

      // Competitive window alignment
      switch (club.aiPersonality.competitiveWindow) {
        case 'win-now':
          interest += freeAgent.age >= 24 && freeAgent.age <= 30 ? 0.2 : -0.1
          break
        case 'rebuilding':
          interest += freeAgent.age <= 25 ? 0.2 : -0.15
          break
        case 'balanced':
          interest += 0.05
          break
      }

      if (!rng.chance(Math.max(0.05, Math.min(0.9, interest)))) continue

      // Generate bid
      const bidMultiplier = 0.85 + rng.next() * 0.35
      const bidAmount = roundSalary(Math.max(MINIMUM_SALARY, marketValue * bidMultiplier))

      // Verify bid fits cap
      if (settings.salaryCap) {
        const allPlayers = Object.values(updatedPlayers)
        const bidCapResult = validateContractOffer(
          allPlayers, club.id, bidAmount, 0,
          settings.salaryCapAmount, settings.realism.softCapSpending,
        )
        if (!bidCapResult.allowed) continue
      }

      bids.push({ clubId: club.id, bidValue: bidAmount })
    }

    if (bids.length === 0) continue

    // Loyalty tiebreaker: +10% to current club
    for (const bid of bids) {
      if (bid.clubId === freeAgent.clubId) {
        bid.bidValue = Math.round(bid.bidValue * 1.10)
      }
    }

    // Highest bid wins
    bids.sort((a, b) => b.bidValue - a.bidValue)
    const winningBid = bids[0]

    // Contract years
    let contractYears: number
    if (freeAgent.age <= 24) contractYears = rng.nextInt(3, 4)
    else if (freeAgent.age <= 28) contractYears = rng.nextInt(2, 3)
    else if (freeAgent.age <= 31) contractYears = rng.nextInt(1, 2)
    else contractYears = 1

    const yearByYear = buildYearByYearFromStructure(
      winningBid.bidValue, contractYears, 'escalating',
    )

    // Update player
    updatedPlayers[freeAgent.id] = {
      ...updatedPlayers[freeAgent.id],
      clubId: winningBid.clubId,
      contract: {
        yearsRemaining: contractYears,
        aav: winningBid.bidValue,
        yearByYear,
        isRestricted: false,
      },
    }

    signings.push({ playerId: freeAgent.id, newClubId: winningBid.clubId })

    const clubName = clubs[winningBid.clubId]?.name ?? winningBid.clubId
    const fullName = `${freeAgent.firstName} ${freeAgent.lastName}`

    newsItems.push({
      id: generateId('news', rng),
      date: currentDate,
      headline: `${fullName} signs with ${clubName}`,
      body: `Free agent ${fullName} has signed a ${contractYears}-year deal worth $${winningBid.bidValue.toLocaleString()} per year with ${clubName}. The ${freeAgent.age}-year-old ${freeAgent.position.primary} was one of the most sought-after players on the open market.`,
      category: 'contract',
      clubIds: [winningBid.clubId],
      playerIds: [freeAgent.id],
    })
  }

  return { updatedPlayers, signings, news: newsItems }
}
