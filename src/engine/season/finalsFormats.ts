/**
 * Preset finals format definitions.
 *
 * Each format is fully data-driven — the finals engine interprets these
 * definitions to generate fixtures, resolve matchups, and determine the premier.
 */

import type {
  FinalsFormat,
  FinalsMatchupRule,
  FinalsWeekDefinition,
  TeamSource,
} from '@/types/finals'

// ── AFL Top 8 (current AFL system) ──────────────────────────────────────────

const aflTop8: FinalsFormat = {
  id: 'afl-top-8',
  name: 'AFL Top 8',
  description: 'The current AFL finals system. Top 8 qualify, with qualifying and elimination finals giving top 4 a double chance.',
  qualifyingTeams: 8,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Finals Week 1',
      matchups: [
        {
          label: 'QF1',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
        {
          label: 'EF1',
          finalType: 'EF',
          home: { type: 'ladder', rank: 5 },
          away: { type: 'ladder', rank: 8 },
          isElimination: true,
        },
        {
          label: 'QF2',
          finalType: 'QF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 3 },
          isElimination: false,
        },
        {
          label: 'EF2',
          finalType: 'EF',
          home: { type: 'ladder', rank: 6 },
          away: { type: 'ladder', rank: 7 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Finals Week 2',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'loser' },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 2, outcome: 'loser' },
          away: { type: 'result', weekRef: 1, matchRef: 3, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Finals Week 3',
      matchups: [
        {
          label: 'PF1',
          finalType: 'PF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'PF2',
          finalType: 'PF',
          home: { type: 'result', weekRef: 1, matchRef: 2, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 4,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 3, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 3, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── AFL Top 10 (wildcard weekend system) ────────────────────────────────────

const aflTop10: FinalsFormat = {
  id: 'afl-top-10',
  name: 'AFL Top 10',
  description: 'New AFL top 10 finals system. Wildcard weekend (7v10, 8v9), then qualifying finals for top 4 (double chance) and elimination finals for 5th and 6th, followed by semis, prelims, and grand final.',
  qualifyingTeams: 10,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Wildcard Weekend',
      matchups: [
        {
          label: 'WC1',
          finalType: 'EF',
          home: { type: 'ladder', rank: 7 },
          away: { type: 'ladder', rank: 10 },
          isElimination: true,
        },
        {
          label: 'WC2',
          finalType: 'EF',
          home: { type: 'ladder', rank: 8 },
          away: { type: 'ladder', rank: 9 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Qualifying & Elimination Finals',
      matchups: [
        {
          label: 'QF1',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: false,
        },
        {
          label: 'QF2',
          finalType: 'QF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
        {
          label: 'EF1',
          finalType: 'EF',
          home: { type: 'ladder', rank: 5 },
          away: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'EF2',
          finalType: 'EF',
          home: { type: 'ladder', rank: 6 },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Semi Finals',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'loser' },
          away: { type: 'result', weekRef: 2, matchRef: 2, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'loser' },
          away: { type: 'result', weekRef: 2, matchRef: 3, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 4,
      label: 'Preliminary Finals',
      matchups: [
        {
          label: 'PF1',
          finalType: 'PF',
          home: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 3, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'PF2',
          finalType: 'PF',
          home: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          away: { type: 'result', weekRef: 3, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 5,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 4, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 4, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Page-McIntyre Top 4 ─────────────────────────────────────────────────────

const pageMcIntyreTop4: FinalsFormat = {
  id: 'page-mcintyre-top-4',
  name: 'Page-McIntyre Top 4',
  description: 'Classic 4-team finals. 1st vs 2nd (double chance), 3rd vs 4th (elimination), then preliminary and grand final.',
  qualifyingTeams: 4,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Finals Week 1',
      matchups: [
        {
          label: 'QF',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: false,
        },
        {
          label: 'EF',
          finalType: 'EF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 4 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Preliminary Final',
      matchups: [
        {
          label: 'PF',
          finalType: 'PF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'loser' },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Top 6 ─────────────────────────────────────────────────────────────────

const top6: FinalsFormat = {
  id: 'top-6',
  name: 'Top 6',
  description: 'Six teams qualify. Top 2 get a bye to week 2, then semis, prelims, and grand final.',
  qualifyingTeams: 6,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Elimination Finals',
      matchups: [
        {
          label: 'EF1',
          finalType: 'EF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 6 },
          isElimination: true,
        },
        {
          label: 'EF2',
          finalType: 'EF',
          home: { type: 'ladder', rank: 4 },
          away: { type: 'ladder', rank: 5 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Semi Finals',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Straight Knockout ──────────────────────────────────────────────────────

const straightKnockout: FinalsFormat = {
  id: 'straight-knockout',
  name: 'Straight Knockout',
  description: 'Top 8 play sudden-death knockout. No double chances — lose and you are out.',
  qualifyingTeams: 8,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Quarter Finals',
      matchups: [
        {
          label: 'QF1',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 8 },
          isElimination: true,
        },
        {
          label: 'QF2',
          finalType: 'QF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 7 },
          isElimination: true,
        },
        {
          label: 'QF3',
          finalType: 'QF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 6 },
          isElimination: true,
        },
        {
          label: 'QF4',
          finalType: 'QF',
          home: { type: 'ladder', rank: 4 },
          away: { type: 'ladder', rank: 5 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Semi Finals',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 2, outcome: 'winner' },
          away: { type: 'result', weekRef: 1, matchRef: 3, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Round Robin ─────────────────────────────────────────────────────────────

const roundRobin: FinalsFormat = {
  id: 'round-robin',
  name: 'Round Robin Top 4',
  description: 'Top 4 play each other once, then the top 2 from the round-robin play the Grand Final.',
  qualifyingTeams: 4,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Round Robin Week 1',
      matchups: [
        {
          label: 'RR1',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
        {
          label: 'RR2',
          finalType: 'SF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 3 },
          isElimination: false,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Round Robin Week 2',
      matchups: [
        {
          label: 'RR3',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 3 },
          isElimination: false,
        },
        {
          label: 'RR4',
          finalType: 'SF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Round Robin Week 3',
      matchups: [
        {
          label: 'RR5',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: false,
        },
        {
          label: 'RR6',
          finalType: 'SF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
      ],
    },
    {
      weekNumber: 4,
      label: 'Grand Final',
      matchups: [
        // For round-robin, the GF is between the top 2 ranked after the round-robin.
        // The engine resolves this via a special "round-robin standings" calculation.
        // We use ladder rank 1 & 2 as placeholders — the engine will re-rank after RR.
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Exports ────────────────────────────────────────────────────────────────

export const FINALS_FORMATS: FinalsFormat[] = [
  aflTop8,
  aflTop10,
  pageMcIntyreTop4,
  top6,
  straightKnockout,
  roundRobin,
]

export function getFinalsFormatById(id: string, customFormat?: FinalsFormat): FinalsFormat {
  if (id === 'custom' && customFormat) return customFormat
  return FINALS_FORMATS.find((f) => f.id === id) ?? aflTop8
}

/**
 * Returns true when the finals structure gives top-4 clubs a week-1
 * non-elimination path while clubs ranked 5-8 are in week-1 elimination games.
 */
export function hasTopFourDoubleChanceAdvantage(format: FinalsFormat): boolean {
  if (format.qualifyingTeams < 8) return false

  const firstWeek = [...format.weeks].sort((a, b) => a.weekNumber - b.weekNumber)[0]
  if (!firstWeek) return false

  const weekOneEliminationByRank = new Map<number, boolean[]>()
  for (const matchup of firstWeek.matchups) {
    for (const source of [matchup.home, matchup.away]) {
      if (source.type !== 'ladder' || source.rank == null) continue
      const rank = source.rank
      if (rank < 1 || rank > format.qualifyingTeams) continue
      const list = weekOneEliminationByRank.get(rank) ?? []
      list.push(matchup.isElimination)
      weekOneEliminationByRank.set(rank, list)
    }
  }

  for (let rank = 1; rank <= 4; rank++) {
    const rows = weekOneEliminationByRank.get(rank)
    if (!rows || rows.length === 0) return false
    if (rows.some((isElim) => isElim)) return false
  }

  for (let rank = 5; rank <= 8; rank++) {
    const rows = weekOneEliminationByRank.get(rank)
    if (!rows || rows.length === 0) return false
    if (rows.some((isElim) => !isElim)) return false
  }

  return true
}

// ── Dynamic knockout bracket generator ────────────────────────────────────

function nextPowerOf2(n: number): number {
  let v = 1
  while (v < n) v *= 2
  return v
}

/**
 * Standard seeded bracket ordering.
 * For an 8-team bracket: [[1,8],[4,5],[2,7],[3,6]]
 * Ensures that if all higher seeds win, 1 meets 2 in the final.
 */
function seededBracketOrder(slots: number): Array<[number, number]> {
  if (slots === 1) return []
  if (slots === 2) return [[1, 2]]

  const pairs: Array<[number, number]> = []
  const recurse = (seeds: number[]): number[] => {
    if (seeds.length <= 2) return seeds
    const half = seeds.length / 2
    const top: number[] = []
    const bot: number[] = []
    for (let i = 0; i < half; i++) {
      top.push(seeds[i])
      bot.push(seeds[seeds.length - 1 - i])
    }
    return [...recurse(top), ...recurse(bot)]
  }
  const ordered = recurse(Array.from({ length: slots }, (_, i) => i + 1))
  for (let i = 0; i < ordered.length; i += 2) {
    pairs.push([ordered[i], ordered[i + 1]])
  }
  return pairs
}

function getFinalType(roundsTotal: number, currentRound: number): FinalsMatchupRule['finalType'] {
  if (currentRound === roundsTotal) return 'GF'
  if (currentRound === roundsTotal - 1) return roundsTotal > 2 ? 'PF' : 'GF'
  if (currentRound === roundsTotal - 2) return 'SF'
  if (currentRound === 1) return 'QF'
  return 'EF'
}

function getWeekLabel(roundsTotal: number, currentRound: number): string {
  if (currentRound === roundsTotal) return 'Grand Final'
  const type = getFinalType(roundsTotal, currentRound)
  const labels: Record<string, string> = {
    QF: 'Quarter Finals',
    EF: 'Elimination Finals',
    SF: 'Semi Finals',
    PF: 'Preliminary Finals',
    GF: 'Grand Final',
  }
  return labels[type] ?? `Finals Week ${currentRound}`
}

/**
 * Generates a straight-knockout seeded bracket for N qualifying teams.
 * Higher seeds get byes when N is not a power of 2.
 */
export function generateStandardKnockout(n: number): FinalsFormat {
  const clamped = Math.max(2, Math.min(18, n))
  const totalSlots = nextPowerOf2(clamped)
  const byes = totalSlots - clamped
  const totalRounds = Math.round(Math.log2(totalSlots))

  const bracketPairs = seededBracketOrder(totalSlots)

  // Track which seeds get byes: the top `byes` seeds
  const byeSeeds = new Set<number>()
  for (let i = 1; i <= byes; i++) byeSeeds.add(i)

  const weeks: FinalsWeekDefinition[] = []
  // Map: bracket slot index -> { weekNumber, matchIndex } for result references
  type SlotRef = { weekNumber: number; matchIndex: number }
  const slotToRef = new Map<number, SlotRef>()

  // Round 1: play non-bye matchups, bye seeds advance directly
  const round1Matchups: FinalsMatchupRule[] = []
  const round1AdvancingByeSeeds: Array<{ seed: number; slotIndex: number }> = []

  for (let i = 0; i < bracketPairs.length; i++) {
    const [seedA, seedB] = bracketPairs[i]
    const aIsBye = byeSeeds.has(seedA) || seedA > clamped
    const bIsBye = byeSeeds.has(seedB) || seedB > clamped

    if (aIsBye && bIsBye) {
      // Both are byes - higher seed advances (shouldn't happen normally)
      round1AdvancingByeSeeds.push({ seed: Math.min(seedA, seedB), slotIndex: i })
    } else if (aIsBye || bIsBye) {
      // One is a bye - the real seed advances directly
      const realSeed = aIsBye ? seedB : seedA
      if (realSeed <= clamped) {
        round1AdvancingByeSeeds.push({ seed: realSeed, slotIndex: i })
      }
    } else {
      // Both are real teams - they play
      const matchIndex = round1Matchups.length
      const ft = getFinalType(totalRounds, 1)
      round1Matchups.push({
        label: `${ft}${matchIndex + 1}`,
        finalType: ft,
        home: { type: 'ladder', rank: seedA },
        away: { type: 'ladder', rank: seedB },
        isElimination: true,
      })
      slotToRef.set(i, { weekNumber: 1, matchIndex })
    }
  }

  if (round1Matchups.length > 0) {
    weeks.push({
      weekNumber: 1,
      label: getWeekLabel(totalRounds, 1),
      matchups: round1Matchups,
    })
  }

  // Build subsequent rounds
  for (let round = 2; round <= totalRounds; round++) {
    const weekNumber = round1Matchups.length > 0 ? round : round - 1
    const matchupsThisRound: FinalsMatchupRule[] = []
    // Number of matchups halves each round
    const prevPairCount = bracketPairs.length / Math.pow(2, round - 2)
    const pairCount = prevPairCount / 2

    for (let m = 0; m < pairCount; m++) {
      // Map back to original bracket pair indices for this round
      const origSlotA = m * 2 * Math.pow(2, round - 2)
      const origSlotB = (m * 2 + 1) * Math.pow(2, round - 2)

      function resolveAdvancer(origSlot: number, prevRound: number): TeamSource {
        // Check if this slot was a bye in a previous round
        const byeEntry = round1AdvancingByeSeeds.find((b) => {
          // A bye seed at slotIndex maps to the same bracket position
          const slotRange = Math.pow(2, prevRound - 1)
          return b.slotIndex >= origSlot && b.slotIndex < origSlot + slotRange
        })
        if (byeEntry) return { type: 'ladder', rank: byeEntry.seed }

        // Check if previous round produced a result at this slot
        // Look for the slot reference from the previous round
        for (let s = origSlot; s < origSlot + Math.pow(2, prevRound - 1); s++) {
          const ref = slotToRef.get(s)
          if (ref && ref.weekNumber === weekNumber - 1) {
            return { type: 'result', weekRef: ref.weekNumber, matchRef: ref.matchIndex, outcome: 'winner' }
          }
        }
        // Fall back: check any previous round
        for (let s = origSlot; s < origSlot + Math.pow(2, prevRound - 1); s++) {
          const ref = slotToRef.get(s)
          if (ref) {
            return { type: 'result', weekRef: ref.weekNumber, matchRef: ref.matchIndex, outcome: 'winner' }
          }
        }
        return { type: 'ladder', rank: 1 } // fallback
      }

      const home = resolveAdvancer(origSlotA, round)
      const away = resolveAdvancer(origSlotB, round)

      const ft = getFinalType(totalRounds, round)
      const matchIndex = matchupsThisRound.length
      matchupsThisRound.push({
        label: round === totalRounds && pairCount === 1 ? 'GF' : `${ft}${matchIndex + 1}`,
        finalType: round === totalRounds && pairCount === 1 ? 'GF' : ft,
        home,
        away,
        isElimination: true,
      })
      // Store for next round
      slotToRef.set(origSlotA, { weekNumber, matchIndex })
    }

    weeks.push({
      weekNumber,
      label: getWeekLabel(totalRounds, round),
      matchups: matchupsThisRound,
    })
  }

  // Compact week numbers (remove gaps from bye rounds)
  const finalWeeks = weeks.filter((w) => w.matchups.length > 0)
  const weekRemap = new Map<number, number>()
  finalWeeks.forEach((w, i) => {
    weekRemap.set(w.weekNumber, i + 1)
    w.weekNumber = i + 1
  })
  // Update result references
  for (const week of finalWeeks) {
    for (const matchup of week.matchups) {
      for (const src of [matchup.home, matchup.away]) {
        if (src.type === 'result' && src.weekRef != null) {
          src.weekRef = weekRemap.get(src.weekRef) ?? src.weekRef
        }
      }
    }
  }

  return {
    id: `knockout-${clamped}`,
    name: `${clamped}-Team Knockout`,
    description: `Straight knockout for ${clamped} qualifying teams. Higher seeds receive byes where needed.`,
    qualifyingTeams: clamped,
    grandFinalVenue: 'MCG',
    weeks: finalWeeks,
  }
}

/**
 * Returns the effective finals format reflecting the qualifying teams setting.
 * For presets: if the slider matches the preset, use it; otherwise generate a knockout.
 * For custom: use the custom format as-is.
 */
export function getEffectiveFinalsFormat(
  finalsFormat: string,
  finalsQualifyingTeams: number,
  customFinalsFormat?: FinalsFormat,
): FinalsFormat {
  if (finalsFormat === 'custom' && customFinalsFormat) return customFinalsFormat
  const preset = FINALS_FORMATS.find((f) => f.id === finalsFormat)
  if (preset && preset.qualifyingTeams === finalsQualifyingTeams) return preset
  // If qualifying teams differ from preset, generate a dynamic knockout
  if (finalsQualifyingTeams >= 2) return generateStandardKnockout(finalsQualifyingTeams)
  return preset ?? aflTop8
}
