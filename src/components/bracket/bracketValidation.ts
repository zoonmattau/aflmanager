/**
 * Bracket validation logic.
 *
 * Pure function that checks a BracketDraftState for errors and warnings.
 */

import type { BracketDraftState, DraftMatchNode } from './bracketUtils'

export interface ValidationError {
  type: 'error' | 'warning'
  message: string
  nodeId?: string
}

export function validateBracketDraft(
  draft: BracketDraftState,
): ValidationError[] {
  const errors: ValidationError[] = []

  // Must have at least one week with matches
  const totalMatches = draft.weeks.reduce((sum, w) => sum + w.matches.length, 0)
  if (totalMatches === 0) {
    errors.push({ type: 'error', message: 'Bracket must have at least one match.' })
    return errors
  }

  // Exactly one GF match, must be in the last week
  const allMatches: DraftMatchNode[] = draft.weeks.flatMap((w) => w.matches)
  const gfMatches = allMatches.filter((m) => m.finalType === 'GF')
  if (gfMatches.length === 0) {
    errors.push({ type: 'error', message: 'Bracket must have exactly one Grand Final match.' })
  } else if (gfMatches.length > 1) {
    errors.push({ type: 'error', message: `Found ${gfMatches.length} Grand Final matches — only one allowed.` })
  } else {
    const gf = gfMatches[0]
    const lastWeekIndex = draft.weeks.length - 1
    if (gf.weekIndex !== lastWeekIndex) {
      errors.push({
        type: 'error',
        message: 'Grand Final must be in the last week.',
        nodeId: gf.id,
      })
    }
  }

  // Every match input slot must have a source (ladder rank or connection)
  for (const match of allMatches) {
    const homeConn = draft.connections.find(
      (c) => c.to.nodeId === match.id && c.to.portType === 'home-in',
    )
    const awayConn = draft.connections.find(
      (c) => c.to.nodeId === match.id && c.to.portType === 'away-in',
    )

    if (!homeConn && match.homeLadderRank === null) {
      errors.push({
        type: 'error',
        message: `${match.label}: Home slot has no source (ladder rank or connection).`,
        nodeId: match.id,
      })
    }
    if (!awayConn && match.awayLadderRank === null) {
      errors.push({
        type: 'error',
        message: `${match.label}: Away slot has no source (ladder rank or connection).`,
        nodeId: match.id,
      })
    }
  }

  // Connections must flow forward (earlier week → later week)
  for (const conn of draft.connections) {
    const fromNode = allMatches.find((m) => m.id === conn.from.nodeId)
    const toNode = allMatches.find((m) => m.id === conn.to.nodeId)
    if (fromNode && toNode && fromNode.weekIndex >= toNode.weekIndex) {
      errors.push({
        type: 'error',
        message: `Connection from ${fromNode.label} to ${toNode.label} goes backward — must flow to a later week.`,
      })
    }
  }

  // No duplicate connections to the same input
  const inputKeys = new Set<string>()
  for (const conn of draft.connections) {
    const key = `${conn.to.nodeId}:${conn.to.portType}`
    if (inputKeys.has(key)) {
      errors.push({
        type: 'error',
        message: `Duplicate connection to the same input slot.`,
      })
    }
    inputKeys.add(key)
  }

  // Ladder ranks must be within qualifying teams range
  for (const match of allMatches) {
    if (match.homeLadderRank !== null && match.homeLadderRank > draft.qualifyingTeams) {
      errors.push({
        type: 'warning',
        message: `${match.label}: Home rank (${match.homeLadderRank}) exceeds qualifying teams (${draft.qualifyingTeams}).`,
        nodeId: match.id,
      })
    }
    if (match.awayLadderRank !== null && match.awayLadderRank > draft.qualifyingTeams) {
      errors.push({
        type: 'warning',
        message: `${match.label}: Away rank (${match.awayLadderRank}) exceeds qualifying teams (${draft.qualifyingTeams}).`,
        nodeId: match.id,
      })
    }
  }

  // Warning: unconnected outputs on non-final-week matches
  const lastWeekIndex = draft.weeks.length - 1
  for (const match of allMatches) {
    if (match.weekIndex === lastWeekIndex) continue
    const hasWinnerOut = draft.connections.some(
      (c) => c.from.nodeId === match.id && c.from.portType === 'winner-out',
    )
    if (!hasWinnerOut) {
      errors.push({
        type: 'warning',
        message: `${match.label}: Winner output is not connected to a later match.`,
        nodeId: match.id,
      })
    }
  }

  return errors
}

export function hasBlockingErrors(errors: ValidationError[]): boolean {
  return errors.some((e) => e.type === 'error')
}
