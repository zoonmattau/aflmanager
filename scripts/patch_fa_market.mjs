import { readFileSync, writeFileSync } from 'fs'

const file = 'M:/projects/afloffseason/src/engine/contracts/freeAgencyMarket.ts'
let src = readFileSync(file, 'utf8')
// This file uses LF
const NL = '\n'

// ── 1. Add isPlayerRFA to import ─────────────────────────────────────────────
const importOld = `import { processEndOfSeasonContracts } from '@/engine/contracts/freeAgency'`
const importNew = `import { processEndOfSeasonContracts, isPlayerRFA } from '@/engine/contracts/freeAgency'`

if (src.includes('isPlayerRFA')) {
  console.log('isPlayerRFA already imported')
} else {
  src = src.replace(importOld, importNew)
  console.log('Added isPlayerRFA import')
}

// ── 2. Add RFAMatchingRight to imports ─────────────────────────────────────
const typeImportOld = `import type { Player } from '@/types/player'`
const typeImportNew = `import type { Player } from '@/types/player'
import type { RFAMatchingRight } from '@/types/contract'`

if (src.includes('RFAMatchingRight')) {
  console.log('RFAMatchingRight already imported')
} else {
  src = src.replace(typeImportOld, typeImportNew)
  console.log('Added RFAMatchingRight import')
}

// ── 3. Update buildFreeAgentMarket listing creation isRestricted field ──────
const listingOld = `      isRestricted: player.contract.isRestricted && player.age < 27,`
const listingNew = `      isRestricted: isPlayerRFA(player, _currentYear),`

if (src.includes(listingNew)) {
  console.log('buildFreeAgentMarket isRestricted already updated')
} else if (!src.includes(listingOld)) {
  console.error('ERROR: cannot find isRestricted in buildFreeAgentMarket')
  process.exit(1)
} else {
  src = src.replace(listingOld, listingNew)
  console.log('Updated buildFreeAgentMarket isRestricted')
}

// ── 4. Change _currentYear parameter name from unused to used ────────────────
const paramOld = `  _currentYear: number,`
const paramNew = `  currentYear: number,`

// Only change in buildFreeAgentMarket function signature
const buildFAIdx = src.indexOf('export function buildFreeAgentMarket(')
if (buildFAIdx >= 0) {
  const endOfBuildFA = src.indexOf('): FreeAgencyMarketState {', buildFAIdx) + 26
  const buildFADef = src.slice(buildFAIdx, endOfBuildFA)
  const updatedDef = buildFADef.replace(paramOld, paramNew)
    .replace('_currentYear', 'currentYear')
  if (buildFADef !== updatedDef) {
    src = src.slice(0, buildFAIdx) + updatedDef + src.slice(endOfBuildFA)
    console.log('Renamed _currentYear to currentYear in buildFreeAgentMarket')
  } else {
    console.log('currentYear param already renamed (or pattern not found)')
  }
}

// Fix the isPlayerRFA call to use the right variable name
src = src.replace(
  `      isRestricted: isPlayerRFA(player, _currentYear),`,
  `      isRestricted: isPlayerRFA(player, currentYear),`,
)

// ── 5. Update resolveMarket to accept playerClubId + return pendingMatchingRights ──
const resolveOld = `export function resolveMarket(
  market: FreeAgencyMarketState,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  rng: SeededRNG,
  currentYear: number,
): {
  market: FreeAgencyMarketState
  updatedPlayers: Record<string, Player>
  compensationPicks: CompensationPick[]
  news: NewsItem[]
}`

const resolveNew = `export function resolveMarket(
  market: FreeAgencyMarketState,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  rng: SeededRNG,
  currentYear: number,
  playerClubId?: string,
): {
  market: FreeAgencyMarketState
  updatedPlayers: Record<string, Player>
  compensationPicks: CompensationPick[]
  news: NewsItem[]
  pendingMatchingRights: RFAMatchingRight[]
}`

if (src.includes('pendingMatchingRights: RFAMatchingRight[]')) {
  console.log('resolveMarket signature already updated')
} else if (!src.includes(resolveOld)) {
  console.error('ERROR: cannot find resolveMarket signature')
  process.exit(1)
} else {
  src = src.replace(resolveOld, resolveNew)
  console.log('Updated resolveMarket signature')
}

// ── 6. Update resolveMarket body: add pendingMatchingRights array + RFA logic ──
// Add array after "const news: NewsItem[] = []"
const newsArrayOld = `  const compensationPicks: CompensationPick[] = []
  const news: NewsItem[] = []

  const resolvedListings = market.listings.map((listing) => {
    if (listing.bids.length === 0) {
      return { ...listing, status: 'unsigned' as const }
    }

    const player = updatedPlayers[listing.playerId]
    if (!player) return { ...listing, status: 'unsigned' as const }

    // Compute preference scores for all bids`

const newsArrayNew = `  const compensationPicks: CompensationPick[] = []
  const news: NewsItem[] = []
  const pendingMatchingRights: RFAMatchingRight[] = []

  const resolvedListings = market.listings.map((listing) => {
    if (listing.bids.length === 0) {
      return { ...listing, status: 'unsigned' as const }
    }

    const player = updatedPlayers[listing.playerId]
    if (!player) return { ...listing, status: 'unsigned' as const }

    // Compute preference scores for all bids`

if (src.includes('pendingMatchingRights: RFAMatchingRight[]') && src.includes('pendingMatchingRights = []')) {
  console.log('pendingMatchingRights array already present')
} else if (!src.includes(newsArrayOld)) {
  console.error('ERROR: cannot find news array in resolveMarket body')
  process.exit(1)
} else {
  src = src.replace(newsArrayOld, newsArrayNew)
  console.log('Added pendingMatchingRights array')
}

// ── 7. Add RFA matching rights check before the signing application ──────────
// Find the "Apply signing" comment and add RFA matching rights check before it
const applySigningOld = `    // Apply signing
    const yearByYear = [...winner.yearByYear]
    updatedPlayers[listing.playerId] = {
      ...updatedPlayers[listing.playerId],
      clubId: winner.clubId,
      contract: {
        yearsRemaining: winner.years,
        aav: winner.aav,
        yearByYear,
        isRestricted: false,
      },
      morale: Math.min(100, (updatedPlayers[listing.playerId].morale ?? 50) + 10),
    }`

const applySigningNew = `    // RFA matching rights check
    if (
      listing.isRestricted &&
      listing.previousClubId &&
      listing.previousClubId !== winner.clubId &&
      listing.previousClubId !== ''
    ) {
      const holdingClub = listing.previousClubId

      if (holdingClub === playerClubId) {
        // User holds matching rights — defer signing, create pending matching right
        const rightId = generateId('rfa', rng)
        pendingMatchingRights.push({
          id: rightId,
          playerId: listing.playerId,
          playerName: listing.playerName,
          holdingClubId: holdingClub,
          offeringClubId: winner.clubId,
          aav: winner.aav,
          years: winner.years,
          yearByYear: [...winner.yearByYear],
          offeredAt: \`\${currentYear}-11-01\`,
          status: 'pending',
        })
        return { ...listing, bids: scoredBids, status: 'matching-pending' as const }
      } else {
        // AI holds matching rights — auto-decide using player valuation
        const playerValue = calculatePlayerValue(player)
        const shouldMatch = playerValue * 1.05 >= winner.aav  // match if value justifies it
        if (shouldMatch) {
          // AI matches — sign to previous club
          updatedPlayers[listing.playerId] = {
            ...updatedPlayers[listing.playerId],
            clubId: holdingClub,
            contract: {
              yearsRemaining: winner.years,
              aav: winner.aav,
              yearByYear: [...winner.yearByYear],
              isRestricted: false,
            },
            morale: Math.min(100, (updatedPlayers[listing.playerId].morale ?? 50) + 8),
          }
          const matchClubName = clubs[holdingClub]?.name ?? holdingClub
          news.push({
            id: generateId('news', rng),
            date: \`\${currentYear}-11-01\`,
            headline: \`\${listing.playerName} retained — \${matchClubName} matches offer\`,
            body: \`\${matchClubName} has exercised its matching rights to retain restricted free agent \${listing.playerName} on a \${winner.years}-year deal worth $\${winner.aav.toLocaleString()} per year.\`,
            category: 'contract',
            clubIds: [holdingClub, winner.clubId],
            playerIds: [listing.playerId],
          })
          return { ...listing, bids: scoredBids, status: 'signed' as const, signedClubId: holdingClub }
        }
        // AI declines — fall through to normal signing below
      }
    }

    // Apply signing
    const yearByYear = [...winner.yearByYear]
    updatedPlayers[listing.playerId] = {
      ...updatedPlayers[listing.playerId],
      clubId: winner.clubId,
      contract: {
        yearsRemaining: winner.years,
        aav: winner.aav,
        yearByYear,
        isRestricted: false,
      },
      morale: Math.min(100, (updatedPlayers[listing.playerId].morale ?? 50) + 10),
    }`

if (src.includes('RFA matching rights check')) {
  console.log('RFA matching rights check already present')
} else if (!src.includes(applySigningOld)) {
  console.error('ERROR: cannot find "Apply signing" section')
  process.exit(1)
} else {
  src = src.replace(applySigningOld, applySigningNew)
  console.log('Added RFA matching rights check to resolveMarket')
}

// ── 8. Update the final return statement of resolveMarket ───────────────────
const returnOld = `  return {
    market: { listings: resolvedListings, compensationPicks, resolved: true },
    updatedPlayers,
    compensationPicks,
    news,
  }
}`

const returnNew = `  return {
    market: { listings: resolvedListings, compensationPicks, resolved: true },
    updatedPlayers,
    compensationPicks,
    news,
    pendingMatchingRights,
  }
}`

if (src.includes('pendingMatchingRights,')) {
  console.log('return statement already updated')
} else if (!src.includes(returnOld)) {
  console.error('ERROR: cannot find resolveMarket return statement')
  process.exit(1)
} else {
  src = src.replace(returnOld, returnNew)
  console.log('Updated resolveMarket return statement')
}

writeFileSync(file, src, 'utf8')
console.log('SUCCESS: freeAgencyMarket.ts patched')
