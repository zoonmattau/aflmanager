/**
 * Bracket draft state hook.
 *
 * Manages the transient editor state via useReducer.
 */

import { useReducer, useCallback } from 'react'
import type {
  BracketDraftState,
  DraftMatchNode,
  Connection,
} from './bracketUtils'
import {
  makeNodeId,
  makeConnectionId,
  autoLabel,
  createEmptyDraft,
  finalsFormatToDraft,
} from './bracketUtils'
import type { FinalsFormat } from '@/types/finals'

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type BracketAction =
  | { type: 'INIT_FROM_PRESET'; format: FinalsFormat }
  | { type: 'INIT_FROM_DRAFT'; draft: BracketDraftState }
  | { type: 'SET_QUALIFYING_TEAMS'; count: number }
  | { type: 'ADD_WEEK' }
  | { type: 'REMOVE_WEEK'; weekIndex: number }
  | { type: 'UPDATE_WEEK_LABEL'; weekIndex: number; label: string }
  | { type: 'ADD_MATCH'; weekIndex: number }
  | { type: 'REMOVE_MATCH'; nodeId: string }
  | {
      type: 'UPDATE_MATCH'
      nodeId: string
      updates: Partial<
        Pick<DraftMatchNode, 'label' | 'finalType' | 'isElimination'>
      >
    }
  | { type: 'SET_LADDER_SOURCE'; nodeId: string; slot: 'home' | 'away'; rank: number | null }
  | { type: 'ADD_CONNECTION'; connection: Connection }
  | { type: 'REMOVE_CONNECTION'; connectionId: string }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reindexWeeks(state: BracketDraftState): BracketDraftState {
  // Re-assign weekIndex, matchIndex, and nodeIds after structural changes
  const nodeIdMap = new Map<string, string>() // old id -> new id

  const weeks = state.weeks.map((week, wi) => ({
    ...week,
    matches: week.matches.map((match, mi) => {
      const newId = makeNodeId(wi, mi)
      if (match.id !== newId) {
        nodeIdMap.set(match.id, newId)
      }
      return { ...match, id: newId, weekIndex: wi, matchIndex: mi }
    }),
  }))

  // Update connection references
  const connections = state.connections
    .map((conn) => {
      const fromId = nodeIdMap.get(conn.from.nodeId) ?? conn.from.nodeId
      const toId = nodeIdMap.get(conn.to.nodeId) ?? conn.to.nodeId
      return {
        ...conn,
        id: makeConnectionId(fromId, conn.from.portType, toId, conn.to.portType),
        from: { ...conn.from, nodeId: fromId },
        to: { ...conn.to, nodeId: toId },
      }
    })
    // Remove connections that reference deleted nodes
    .filter((conn) => {
      const fromExists = weeks.some((w) =>
        w.matches.some((m) => m.id === conn.from.nodeId),
      )
      const toExists = weeks.some((w) =>
        w.matches.some((m) => m.id === conn.to.nodeId),
      )
      return fromExists && toExists
    })

  return { ...state, weeks, connections }
}

function bracketReducer(
  state: BracketDraftState,
  action: BracketAction,
): BracketDraftState {
  switch (action.type) {
    case 'INIT_FROM_PRESET':
      return finalsFormatToDraft(action.format)

    case 'INIT_FROM_DRAFT':
      return action.draft

    case 'SET_QUALIFYING_TEAMS':
      return { ...state, qualifyingTeams: action.count }

    case 'ADD_WEEK': {
      const newWeekIndex = state.weeks.length
      const newWeek = {
        label: `Finals Week ${newWeekIndex + 1}`,
        matches: [] as DraftMatchNode[],
      }
      return { ...state, weeks: [...state.weeks, newWeek] }
    }

    case 'REMOVE_WEEK': {
      const removedMatches = state.weeks[action.weekIndex]?.matches ?? []
      const removedIds = new Set(removedMatches.map((m) => m.id))

      const newWeeks = state.weeks.filter((_, i) => i !== action.weekIndex)
      const newConnections = state.connections.filter(
        (c) => !removedIds.has(c.from.nodeId) && !removedIds.has(c.to.nodeId),
      )

      return reindexWeeks({ ...state, weeks: newWeeks, connections: newConnections })
    }

    case 'UPDATE_WEEK_LABEL': {
      const weeks = state.weeks.map((w, i) =>
        i === action.weekIndex ? { ...w, label: action.label } : w,
      )
      return { ...state, weeks }
    }

    case 'ADD_MATCH': {
      const week = state.weeks[action.weekIndex]
      if (!week) return state

      const matchIndex = week.matches.length
      const nodeId = makeNodeId(action.weekIndex, matchIndex)
      const finalType: DraftMatchNode['finalType'] =
        action.weekIndex === state.weeks.length - 1 && matchIndex === 0
          ? 'GF'
          : 'EF'

      const newMatch: DraftMatchNode = {
        id: nodeId,
        weekIndex: action.weekIndex,
        matchIndex,
        label: autoLabel(finalType, matchIndex),
        finalType,
        isElimination: true,
        homeLadderRank: null,
        awayLadderRank: null,
      }

      const weeks = state.weeks.map((w, i) =>
        i === action.weekIndex
          ? { ...w, matches: [...w.matches, newMatch] }
          : w,
      )
      return { ...state, weeks }
    }

    case 'REMOVE_MATCH': {
      // Remove the match and any connections referencing it
      const newConnections = state.connections.filter(
        (c) =>
          c.from.nodeId !== action.nodeId && c.to.nodeId !== action.nodeId,
      )
      const weeks = state.weeks.map((w) => ({
        ...w,
        matches: w.matches.filter((m) => m.id !== action.nodeId),
      }))
      return reindexWeeks({ ...state, weeks, connections: newConnections })
    }

    case 'UPDATE_MATCH': {
      const weeks = state.weeks.map((w) => ({
        ...w,
        matches: w.matches.map((m) =>
          m.id === action.nodeId ? { ...m, ...action.updates } : m,
        ),
      }))
      return { ...state, weeks }
    }

    case 'SET_LADDER_SOURCE': {
      const weeks = state.weeks.map((w) => ({
        ...w,
        matches: w.matches.map((m) => {
          if (m.id !== action.nodeId) return m
          if (action.slot === 'home') {
            return { ...m, homeLadderRank: action.rank }
          }
          return { ...m, awayLadderRank: action.rank }
        }),
      }))

      // If setting a ladder rank, remove any connection to that slot
      let connections = state.connections
      if (action.rank !== null) {
        const portType = action.slot === 'home' ? 'home-in' : 'away-in'
        connections = connections.filter(
          (c) =>
            !(c.to.nodeId === action.nodeId && c.to.portType === portType),
        )
      }

      return { ...state, weeks, connections }
    }

    case 'ADD_CONNECTION': {
      // Remove any existing connection to the same input slot
      const connections = state.connections.filter(
        (c) =>
          !(
            c.to.nodeId === action.connection.to.nodeId &&
            c.to.portType === action.connection.to.portType
          ),
      )

      // Clear ladder rank on the target slot when adding a connection
      const targetSlot = action.connection.to.portType === 'home-in' ? 'home' : 'away'
      const weeks = state.weeks.map((w) => ({
        ...w,
        matches: w.matches.map((m) => {
          if (m.id !== action.connection.to.nodeId) return m
          if (targetSlot === 'home') return { ...m, homeLadderRank: null }
          return { ...m, awayLadderRank: null }
        }),
      }))

      return { ...state, weeks, connections: [...connections, action.connection] }
    }

    case 'REMOVE_CONNECTION':
      return {
        ...state,
        connections: state.connections.filter((c) => c.id !== action.connectionId),
      }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBracketDraft(initial?: BracketDraftState) {
  const [draft, dispatch] = useReducer(
    bracketReducer,
    initial ?? createEmptyDraft(),
  )

  const initFromPreset = useCallback(
    (format: FinalsFormat) => dispatch({ type: 'INIT_FROM_PRESET', format }),
    [],
  )

  const initFromDraft = useCallback(
    (d: BracketDraftState) => dispatch({ type: 'INIT_FROM_DRAFT', draft: d }),
    [],
  )

  const setQualifyingTeams = useCallback(
    (count: number) => dispatch({ type: 'SET_QUALIFYING_TEAMS', count }),
    [],
  )

  const addWeek = useCallback(() => dispatch({ type: 'ADD_WEEK' }), [])

  const removeWeek = useCallback(
    (weekIndex: number) => dispatch({ type: 'REMOVE_WEEK', weekIndex }),
    [],
  )

  const updateWeekLabel = useCallback(
    (weekIndex: number, label: string) =>
      dispatch({ type: 'UPDATE_WEEK_LABEL', weekIndex, label }),
    [],
  )

  const addMatch = useCallback(
    (weekIndex: number) => dispatch({ type: 'ADD_MATCH', weekIndex }),
    [],
  )

  const removeMatch = useCallback(
    (nodeId: string) => dispatch({ type: 'REMOVE_MATCH', nodeId }),
    [],
  )

  const updateMatch = useCallback(
    (
      nodeId: string,
      updates: Partial<
        Pick<DraftMatchNode, 'label' | 'finalType' | 'isElimination'>
      >,
    ) => dispatch({ type: 'UPDATE_MATCH', nodeId, updates }),
    [],
  )

  const setLadderSource = useCallback(
    (nodeId: string, slot: 'home' | 'away', rank: number | null) =>
      dispatch({ type: 'SET_LADDER_SOURCE', nodeId, slot, rank }),
    [],
  )

  const addConnection = useCallback(
    (connection: Connection) =>
      dispatch({ type: 'ADD_CONNECTION', connection }),
    [],
  )

  const removeConnection = useCallback(
    (connectionId: string) =>
      dispatch({ type: 'REMOVE_CONNECTION', connectionId }),
    [],
  )

  return {
    draft,
    dispatch,
    initFromPreset,
    initFromDraft,
    setQualifyingTeams,
    addWeek,
    removeWeek,
    updateWeekLabel,
    addMatch,
    removeMatch,
    updateMatch,
    setLadderSource,
    addConnection,
    removeConnection,
  }
}
