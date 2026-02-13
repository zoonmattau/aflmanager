/**
 * BracketGrid — flex container with SVG overlay for bracket connections.
 */

import { useCallback, type RefObject } from 'react'
import type { BracketDraftState, Connection, DraftMatchNode } from './bracketUtils'
import { WeekColumnEditor } from './WeekColumnEditor'
import { ConnectorLines } from './ConnectorLines'
import type { PortKey, PortPosition } from './useBracketLayout'
import type { WiringState } from './useBracketConnections'

interface BracketGridProps {
  draft: BracketDraftState
  containerRef: RefObject<HTMLDivElement | null>
  portPositions: Map<PortKey, PortPosition>
  wiringState: WiringState
  mousePos: PortPosition
  isValidTarget: (nodeId: string, portType: 'home-in' | 'away-in') => boolean
  onRegisterPort: (key: string, element: HTMLElement | null) => void
  onOutputClick: (
    nodeId: string,
    portType: 'winner-out' | 'loser-out',
    position: PortPosition,
  ) => void
  onInputClick: (nodeId: string, portType: 'home-in' | 'away-in') => void
  onCancelWiring: () => void
  onUpdateMousePos: (pos: PortPosition) => void
  onUpdateMatch: (
    nodeId: string,
    updates: Partial<Pick<DraftMatchNode, 'label' | 'finalType' | 'isElimination'>>,
  ) => void
  onSetLadderSource: (nodeId: string, slot: 'home' | 'away', rank: number | null) => void
  onRemoveMatch: (nodeId: string) => void
  onRemoveConnection: (connectionId: string) => void
  onAddMatch: (weekIndex: number) => void
  onRemoveWeek: (weekIndex: number) => void
  onUpdateWeekLabel: (weekIndex: number, label: string) => void
}

export function BracketGrid({
  draft,
  containerRef,
  portPositions,
  wiringState,
  mousePos,
  isValidTarget,
  onRegisterPort,
  onOutputClick,
  onInputClick,
  onCancelWiring,
  onUpdateMousePos,
  onUpdateMatch,
  onSetLadderSource,
  onRemoveMatch,
  onRemoveConnection,
  onAddMatch,
  onRemoveWeek,
  onUpdateWeekLabel,
}: BracketGridProps) {
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (wiringState.mode !== 'wiring') return
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      onUpdateMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    },
    [wiringState.mode, containerRef, onUpdateMousePos],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Cancel wiring when clicking on empty space
      if (wiringState.mode === 'wiring') {
        // Only cancel if the click target is the container itself or its immediate backdrop
        const target = e.target as HTMLElement
        if (target === containerRef.current || target.hasAttribute('data-bracket-grid')) {
          onCancelWiring()
        }
      }
    },
    [wiringState.mode, containerRef, onCancelWiring],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && wiringState.mode === 'wiring') {
        onCancelWiring()
      }
    },
    [wiringState.mode, onCancelWiring],
  )

  const containerEl = containerRef.current
  const containerWidth = containerEl?.scrollWidth ?? 800
  const containerHeight = containerEl?.scrollHeight ?? 400

  return (
    <div
      ref={containerRef}
      data-bracket-grid
      className="relative overflow-x-auto rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-4"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Week columns */}
      <div className="flex gap-6" data-bracket-grid>
        {draft.weeks.map((week, wi) => (
          <WeekColumnEditor
            key={wi}
            week={week}
            weekIndex={wi}
            totalWeeks={draft.weeks.length}
            connections={draft.connections}
            wiringState={wiringState}
            qualifyingTeams={draft.qualifyingTeams}
            isValidTarget={isValidTarget}
            onRegisterPort={onRegisterPort}
            onOutputClick={onOutputClick}
            onInputClick={onInputClick}
            onUpdateMatch={onUpdateMatch}
            onSetLadderSource={onSetLadderSource}
            onRemoveMatch={onRemoveMatch}
            onRemoveConnection={onRemoveConnection}
            onAddMatch={onAddMatch}
            onRemoveWeek={onRemoveWeek}
            onUpdateWeekLabel={onUpdateWeekLabel}
          />
        ))}
      </div>

      {/* SVG connection lines overlay */}
      <ConnectorLines
        connections={draft.connections}
        portPositions={portPositions}
        wiringState={wiringState}
        mousePos={mousePos}
        containerWidth={containerWidth}
        containerHeight={containerHeight}
      />
    </div>
  )
}
