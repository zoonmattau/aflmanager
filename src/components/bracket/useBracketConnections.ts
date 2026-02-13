/**
 * Bracket wiring hook.
 *
 * Click-to-connect state machine: idle → wiring → idle
 */

import { useState, useCallback } from 'react'
import type { Connection, BracketDraftState } from './bracketUtils'
import { makeConnectionId } from './bracketUtils'
import type { PortPosition } from './useBracketLayout'

export type WiringState =
  | { mode: 'idle' }
  | {
      mode: 'wiring'
      fromNodeId: string
      fromPort: 'winner-out' | 'loser-out'
      fromPosition: PortPosition
    }

export function useBracketConnections(
  draft: BracketDraftState,
  addConnection: (conn: Connection) => void,
) {
  const [wiring, setWiring] = useState<WiringState>({ mode: 'idle' })
  const [mousePos, setMousePos] = useState<PortPosition>({ x: 0, y: 0 })

  const startWiring = useCallback(
    (
      nodeId: string,
      portType: 'winner-out' | 'loser-out',
      position: PortPosition,
    ) => {
      setWiring({ mode: 'wiring', fromNodeId: nodeId, fromPort: portType, fromPosition: position })
    },
    [],
  )

  const cancelWiring = useCallback(() => {
    setWiring({ mode: 'idle' })
  }, [])

  const completeWiring = useCallback(
    (toNodeId: string, toPort: 'home-in' | 'away-in') => {
      if (wiring.mode !== 'wiring') return

      // Validate: target must be in a later week
      const fromNode = draft.weeks
        .flatMap((w) => w.matches)
        .find((m) => m.id === wiring.fromNodeId)
      const toNode = draft.weeks
        .flatMap((w) => w.matches)
        .find((m) => m.id === toNodeId)

      if (!fromNode || !toNode || fromNode.weekIndex >= toNode.weekIndex) {
        setWiring({ mode: 'idle' })
        return
      }

      const conn: Connection = {
        id: makeConnectionId(wiring.fromNodeId, wiring.fromPort, toNodeId, toPort),
        from: { nodeId: wiring.fromNodeId, portType: wiring.fromPort },
        to: { nodeId: toNodeId, portType: toPort },
      }

      addConnection(conn)
      setWiring({ mode: 'idle' })
    },
    [wiring, draft.weeks, addConnection],
  )

  const updateMousePos = useCallback((pos: PortPosition) => {
    setMousePos(pos)
  }, [])

  const isValidTarget = useCallback(
    (nodeId: string, portType: 'home-in' | 'away-in'): boolean => {
      if (wiring.mode !== 'wiring') return false

      // Can't connect to self
      if (nodeId === wiring.fromNodeId) return false

      // Target must be in a later week
      const fromNode = draft.weeks
        .flatMap((w) => w.matches)
        .find((m) => m.id === wiring.fromNodeId)
      const toNode = draft.weeks
        .flatMap((w) => w.matches)
        .find((m) => m.id === nodeId)

      if (!fromNode || !toNode) return false
      if (fromNode.weekIndex >= toNode.weekIndex) return false

      // Check if target slot already has a ladder source
      if (portType === 'home-in' && toNode.homeLadderRank !== null) return false
      if (portType === 'away-in' && toNode.awayLadderRank !== null) return false

      return true
    },
    [wiring, draft.weeks],
  )

  return {
    wiring,
    mousePos,
    startWiring,
    cancelWiring,
    completeWiring,
    updateMousePos,
    isValidTarget,
  }
}
