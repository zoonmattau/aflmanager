/**
 * MatchNodeEditor — card-like element for each match in the bracket editor.
 */

import { useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DraftMatchNode, Connection, PortType } from './bracketUtils'
import { SlotPort } from './SlotPort'
import { makePortKey } from './useBracketLayout'
import type { PortPosition } from './useBracketLayout'
import type { WiringState } from './useBracketConnections'

interface MatchNodeEditorProps {
  match: DraftMatchNode
  connections: Connection[]
  wiringState: WiringState
  isValidTarget: (nodeId: string, portType: 'home-in' | 'away-in') => boolean
  onRegisterPort: (key: string, element: HTMLElement | null) => void
  onOutputClick: (
    nodeId: string,
    portType: 'winner-out' | 'loser-out',
    position: PortPosition,
  ) => void
  onInputClick: (nodeId: string, portType: 'home-in' | 'away-in') => void
  onUpdateMatch: (
    nodeId: string,
    updates: Partial<Pick<DraftMatchNode, 'label' | 'finalType' | 'isElimination'>>,
  ) => void
  onSetLadderSource: (nodeId: string, slot: 'home' | 'away', rank: number | null) => void
  onRemoveMatch: (nodeId: string) => void
  onRemoveConnection: (connectionId: string) => void
  qualifyingTeams: number
}

const FINAL_TYPES: DraftMatchNode['finalType'][] = ['QF', 'EF', 'SF', 'PF', 'GF']

export function MatchNodeEditor({
  match,
  connections,
  wiringState,
  isValidTarget,
  onRegisterPort,
  onOutputClick,
  onInputClick,
  onUpdateMatch,
  onSetLadderSource,
  onRemoveMatch,
  onRemoveConnection,
  qualifyingTeams,
}: MatchNodeEditorProps) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(match.label)

  const homeConn = connections.find(
    (c) => c.to.nodeId === match.id && c.to.portType === 'home-in',
  )
  const awayConn = connections.find(
    (c) => c.to.nodeId === match.id && c.to.portType === 'away-in',
  )

  const isWiring = wiringState.mode === 'wiring'
  const isWiringFrom = (portType: PortType) =>
    wiringState.mode === 'wiring' &&
    wiringState.fromNodeId === match.id &&
    wiringState.fromPort === portType

  const handleLabelBlur = useCallback(() => {
    setEditingLabel(false)
    if (labelValue.trim() && labelValue !== match.label) {
      onUpdateMatch(match.id, { label: labelValue.trim() })
    } else {
      setLabelValue(match.label)
    }
  }, [labelValue, match.label, match.id, onUpdateMatch])

  const handleLadderRankChange = useCallback(
    (slot: 'home' | 'away', value: string) => {
      if (value === '' || value === 'conn') {
        onSetLadderSource(match.id, slot, null)
      } else {
        const rank = parseInt(value, 10)
        if (!isNaN(rank) && rank >= 1) {
          // Also remove any connection to this slot
          const conn = slot === 'home' ? homeConn : awayConn
          if (conn) onRemoveConnection(conn.id)
          onSetLadderSource(match.id, slot, rank)
        }
      }
    },
    [match.id, homeConn, awayConn, onSetLadderSource, onRemoveConnection],
  )

  return (
    <div
      className={cn(
        'relative rounded-lg border p-2 transition-colors',
        match.finalType === 'GF'
          ? 'border-amber-500/50 bg-amber-500/10'
          : match.isElimination
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-blue-500/30 bg-blue-500/5',
      )}
    >
      {/* Header row */}
      <div className="mb-1.5 flex items-center justify-between gap-1">
        {editingLabel ? (
          <input
            className="w-16 rounded border border-zinc-600 bg-zinc-800 px-1 text-[10px] font-bold text-zinc-200 outline-none focus:border-zinc-400"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLabelBlur()
              if (e.key === 'Escape') {
                setLabelValue(match.label)
                setEditingLabel(false)
              }
            }}
            autoFocus
          />
        ) : (
          <span
            className="cursor-pointer text-[10px] font-bold text-zinc-300 hover:text-white"
            onClick={() => {
              setLabelValue(match.label)
              setEditingLabel(true)
            }}
          >
            {match.label}
          </span>
        )}

        <div className="flex items-center gap-1">
          {/* Final type selector */}
          <select
            className="h-5 rounded border border-zinc-700 bg-zinc-800 px-0.5 text-[9px] text-zinc-400 outline-none"
            value={match.finalType}
            onChange={(e) =>
              onUpdateMatch(match.id, {
                finalType: e.target.value as DraftMatchNode['finalType'],
              })
            }
          >
            {FINAL_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {ft}
              </option>
            ))}
          </select>

          {/* Elimination toggle */}
          <button
            className={cn(
              'rounded px-1 py-0.5 text-[8px] font-semibold transition-colors',
              match.isElimination
                ? 'bg-red-500/20 text-red-400'
                : 'bg-blue-500/20 text-blue-400',
            )}
            onClick={() =>
              onUpdateMatch(match.id, { isElimination: !match.isElimination })
            }
            title={match.isElimination ? 'Elimination (click to toggle)' : 'Non-elimination (click to toggle)'}
          >
            {match.isElimination ? 'ELIM' : 'DBL'}
          </button>

          <button
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
            onClick={() => onRemoveMatch(match.id)}
            title="Remove match"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Ports and slots */}
      <div className="flex items-center gap-2">
        {/* Input ports (left side) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <SlotPort
              nodeId={match.id}
              portType="home-in"
              portKey={makePortKey(match.id, 'home-in')}
              isConnected={!!homeConn}
              ladderRank={match.homeLadderRank}
              isWiring={isWiring}
              isWiringSource={false}
              isValidTarget={isValidTarget(match.id, 'home-in')}
              onRegister={onRegisterPort}
              onOutputClick={onOutputClick}
              onInputClick={onInputClick}
            />
            <div className="flex items-center gap-0.5">
              <span className="text-[8px] text-zinc-500">H:</span>
              {homeConn ? (
                <span className="text-[8px] text-green-400">linked</span>
              ) : (
                <select
                  className="h-4 w-10 rounded border border-zinc-700 bg-zinc-800 px-0.5 text-[8px] text-zinc-400 outline-none"
                  value={match.homeLadderRank ?? 'conn'}
                  onChange={(e) => handleLadderRankChange('home', e.target.value)}
                >
                  <option value="conn">--</option>
                  {Array.from({ length: qualifyingTeams }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      #{i + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <SlotPort
              nodeId={match.id}
              portType="away-in"
              portKey={makePortKey(match.id, 'away-in')}
              isConnected={!!awayConn}
              ladderRank={match.awayLadderRank}
              isWiring={isWiring}
              isWiringSource={false}
              isValidTarget={isValidTarget(match.id, 'away-in')}
              onRegister={onRegisterPort}
              onOutputClick={onOutputClick}
              onInputClick={onInputClick}
            />
            <div className="flex items-center gap-0.5">
              <span className="text-[8px] text-zinc-500">A:</span>
              {awayConn ? (
                <span className="text-[8px] text-green-400">linked</span>
              ) : (
                <select
                  className="h-4 w-10 rounded border border-zinc-700 bg-zinc-800 px-0.5 text-[8px] text-zinc-400 outline-none"
                  value={match.awayLadderRank ?? 'conn'}
                  onChange={(e) => handleLadderRankChange('away', e.target.value)}
                >
                  <option value="conn">--</option>
                  {Array.from({ length: qualifyingTeams }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      #{i + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Output ports (right side) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-blue-400">W</span>
            <SlotPort
              nodeId={match.id}
              portType="winner-out"
              portKey={makePortKey(match.id, 'winner-out')}
              isConnected={connections.some(
                (c) => c.from.nodeId === match.id && c.from.portType === 'winner-out',
              )}
              ladderRank={null}
              isWiring={isWiring}
              isWiringSource={isWiringFrom('winner-out')}
              isValidTarget={false}
              onRegister={onRegisterPort}
              onOutputClick={onOutputClick}
              onInputClick={onInputClick}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-amber-400">L</span>
            <SlotPort
              nodeId={match.id}
              portType="loser-out"
              portKey={makePortKey(match.id, 'loser-out')}
              isConnected={connections.some(
                (c) => c.from.nodeId === match.id && c.from.portType === 'loser-out',
              )}
              ladderRank={null}
              isWiring={isWiring}
              isWiringSource={isWiringFrom('loser-out')}
              isValidTarget={false}
              onRegister={onRegisterPort}
              onOutputClick={onOutputClick}
              onInputClick={onInputClick}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
