/**
 * Bracket builder utilities.
 *
 * Converts between the rich draft editor state and the engine-compatible FinalsFormat.
 */

import type {
  FinalsFormat,
  FinalsWeekDefinition,
  FinalsMatchupRule,
  TeamSource,
} from '@/types/finals'

// ---------------------------------------------------------------------------
// Draft state types (richer than FinalsFormat for UI editing)
// ---------------------------------------------------------------------------

export interface DraftMatchNode {
  id: string // e.g. "w0m0"
  weekIndex: number
  matchIndex: number
  label: string // e.g. "QF1"
  finalType: 'QF' | 'EF' | 'SF' | 'PF' | 'GF'
  isElimination: boolean
  homeLadderRank: number | null // null = comes from a connection
  awayLadderRank: number | null
}

export type PortType = 'winner-out' | 'loser-out' | 'home-in' | 'away-in'

export interface Connection {
  id: string
  from: { nodeId: string; portType: 'winner-out' | 'loser-out' }
  to: { nodeId: string; portType: 'home-in' | 'away-in' }
}

export interface DraftWeek {
  label: string
  matches: DraftMatchNode[]
}

export interface BracketDraftState {
  qualifyingTeams: number
  weeks: DraftWeek[]
  connections: Connection[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeNodeId(weekIndex: number, matchIndex: number): string {
  return `w${weekIndex}m${matchIndex}`
}

export function makeConnectionId(
  fromNodeId: string,
  fromPort: string,
  toNodeId: string,
  toPort: string,
): string {
  return `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`
}

const FINAL_TYPE_LABELS: Record<string, string> = {
  QF: 'QF',
  EF: 'EF',
  SF: 'SF',
  PF: 'PF',
  GF: 'GF',
}

export function autoLabel(
  finalType: DraftMatchNode['finalType'],
  matchIndex: number,
): string {
  const base = FINAL_TYPE_LABELS[finalType] ?? finalType
  if (finalType === 'GF') return 'GF'
  return `${base}${matchIndex + 1}`
}

// ---------------------------------------------------------------------------
// Conversion: FinalsFormat → BracketDraftState
// ---------------------------------------------------------------------------

export function finalsFormatToDraft(format: FinalsFormat): BracketDraftState {
  const connections: Connection[] = []
  const weeks: DraftWeek[] = format.weeks.map((week, wi) => ({
    label: week.label,
    matches: week.matchups.map((matchup, mi) => {
      const nodeId = makeNodeId(wi, mi)

      // Check if home/away come from connections (result type)
      let homeLadderRank: number | null = null
      let awayLadderRank: number | null = null

      if (matchup.home.type === 'ladder') {
        homeLadderRank = matchup.home.rank ?? null
      } else if (matchup.home.type === 'result') {
        // Create a connection from the source match to this match's home-in
        const srcWeekIndex = (matchup.home.weekRef ?? 1) - 1 // weekRef is 1-based
        const srcMatchIndex = matchup.home.matchRef ?? 0
        const srcNodeId = makeNodeId(srcWeekIndex, srcMatchIndex)
        const srcPort =
          matchup.home.outcome === 'loser' ? 'loser-out' : 'winner-out'
        const conn: Connection = {
          id: makeConnectionId(srcNodeId, srcPort, nodeId, 'home-in'),
          from: {
            nodeId: srcNodeId,
            portType: srcPort as 'winner-out' | 'loser-out',
          },
          to: { nodeId, portType: 'home-in' },
        }
        connections.push(conn)
      }

      if (matchup.away.type === 'ladder') {
        awayLadderRank = matchup.away.rank ?? null
      } else if (matchup.away.type === 'result') {
        const srcWeekIndex = (matchup.away.weekRef ?? 1) - 1
        const srcMatchIndex = matchup.away.matchRef ?? 0
        const srcNodeId = makeNodeId(srcWeekIndex, srcMatchIndex)
        const srcPort =
          matchup.away.outcome === 'loser' ? 'loser-out' : 'winner-out'
        const conn: Connection = {
          id: makeConnectionId(srcNodeId, srcPort, nodeId, 'away-in'),
          from: {
            nodeId: srcNodeId,
            portType: srcPort as 'winner-out' | 'loser-out',
          },
          to: { nodeId, portType: 'away-in' },
        }
        connections.push(conn)
      }

      return {
        id: nodeId,
        weekIndex: wi,
        matchIndex: mi,
        label: matchup.label,
        finalType: matchup.finalType,
        isElimination: matchup.isElimination,
        homeLadderRank,
        awayLadderRank,
      }
    }),
  }))

  return {
    qualifyingTeams: format.qualifyingTeams,
    weeks,
    connections,
  }
}

// ---------------------------------------------------------------------------
// Conversion: BracketDraftState → FinalsFormat
// ---------------------------------------------------------------------------

export function draftToFinalsFormat(draft: BracketDraftState): FinalsFormat {
  const weeks: FinalsWeekDefinition[] = draft.weeks.map((week, wi) => ({
    weekNumber: wi + 1,
    label: week.label,
    matchups: week.matches.map((match) => {
      const home = resolveSlotSource(draft, match.id, 'home-in', match.homeLadderRank)
      const away = resolveSlotSource(draft, match.id, 'away-in', match.awayLadderRank)

      return {
        label: match.label,
        finalType: match.finalType,
        home,
        away,
        isElimination: match.isElimination,
      } satisfies FinalsMatchupRule
    }),
  }))

  return {
    id: 'custom',
    name: 'Custom',
    description: 'Custom finals format created with the bracket builder.',
    qualifyingTeams: draft.qualifyingTeams,
    weeks,
    grandFinalVenue: 'MCG',
  }
}

function resolveSlotSource(
  draft: BracketDraftState,
  nodeId: string,
  portType: 'home-in' | 'away-in',
  ladderRank: number | null,
): TeamSource {
  // Check if there's a connection feeding into this slot
  const conn = draft.connections.find(
    (c) => c.to.nodeId === nodeId && c.to.portType === portType,
  )

  if (conn) {
    // Find the source node to get its weekIndex and matchIndex
    const srcNode = findNodeById(draft, conn.from.nodeId)
    if (srcNode) {
      return {
        type: 'result',
        weekRef: srcNode.weekIndex + 1, // engine uses 1-based weekRef
        matchRef: srcNode.matchIndex,
        outcome: conn.from.portType === 'loser-out' ? 'loser' : 'winner',
      }
    }
  }

  // Fall back to ladder source
  return {
    type: 'ladder',
    rank: ladderRank ?? 1,
  }
}

function findNodeById(
  draft: BracketDraftState,
  nodeId: string,
): DraftMatchNode | null {
  for (const week of draft.weeks) {
    for (const match of week.matches) {
      if (match.id === nodeId) return match
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Empty default draft
// ---------------------------------------------------------------------------

export function createEmptyDraft(): BracketDraftState {
  return {
    qualifyingTeams: 8,
    weeks: [
      {
        label: 'Finals Week 1',
        matches: [
          {
            id: 'w0m0',
            weekIndex: 0,
            matchIndex: 0,
            label: 'QF1',
            finalType: 'QF',
            isElimination: true,
            homeLadderRank: 1,
            awayLadderRank: 2,
          },
        ],
      },
      {
        label: 'Grand Final',
        matches: [
          {
            id: 'w1m0',
            weekIndex: 1,
            matchIndex: 0,
            label: 'GF',
            finalType: 'GF',
            isElimination: true,
            homeLadderRank: null,
            awayLadderRank: null,
          },
        ],
      },
    ],
    connections: [
      {
        id: 'w0m0:winner-out->w1m0:home-in',
        from: { nodeId: 'w0m0', portType: 'winner-out' },
        to: { nodeId: 'w1m0', portType: 'home-in' },
      },
    ],
  }
}
