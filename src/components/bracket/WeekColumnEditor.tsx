/**
 * WeekColumnEditor — column for each finals week in the bracket editor.
 */

import { useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DraftWeek, Connection, DraftMatchNode } from './bracketUtils'
import { MatchNodeEditor } from './MatchNodeEditor'
import type { PortPosition } from './useBracketLayout'
import type { WiringState } from './useBracketConnections'

interface WeekColumnEditorProps {
  week: DraftWeek
  weekIndex: number
  totalWeeks: number
  connections: Connection[]
  wiringState: WiringState
  qualifyingTeams: number
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
  onAddMatch: (weekIndex: number) => void
  onRemoveWeek: (weekIndex: number) => void
  onUpdateWeekLabel: (weekIndex: number, label: string) => void
}

export function WeekColumnEditor({
  week,
  weekIndex,
  totalWeeks,
  connections,
  wiringState,
  qualifyingTeams,
  isValidTarget,
  onRegisterPort,
  onOutputClick,
  onInputClick,
  onUpdateMatch,
  onSetLadderSource,
  onRemoveMatch,
  onRemoveConnection,
  onAddMatch,
  onRemoveWeek,
  onUpdateWeekLabel,
}: WeekColumnEditorProps) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(week.label)

  const handleLabelBlur = useCallback(() => {
    setEditingLabel(false)
    if (labelValue.trim() && labelValue !== week.label) {
      onUpdateWeekLabel(weekIndex, labelValue.trim())
    } else {
      setLabelValue(week.label)
    }
  }, [labelValue, week.label, weekIndex, onUpdateWeekLabel])

  return (
    <div className="flex min-w-[180px] flex-col gap-2">
      {/* Week header */}
      <div className="flex items-center justify-between gap-1">
        {editingLabel ? (
          <input
            className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-300 outline-none focus:border-zinc-400"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLabelBlur()
              if (e.key === 'Escape') {
                setLabelValue(week.label)
                setEditingLabel(false)
              }
            }}
            autoFocus
          />
        ) : (
          <p
            className="flex-1 cursor-pointer text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
            onClick={() => {
              setLabelValue(week.label)
              setEditingLabel(true)
            }}
          >
            {week.label}
          </p>
        )}
        {totalWeeks > 1 && (
          <button
            className="rounded p-0.5 text-zinc-600 hover:bg-zinc-700 hover:text-red-400"
            onClick={() => onRemoveWeek(weekIndex)}
            title="Remove week"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Match nodes */}
      {week.matches.map((match) => (
        <MatchNodeEditor
          key={match.id}
          match={match}
          connections={connections}
          wiringState={wiringState}
          isValidTarget={isValidTarget}
          onRegisterPort={onRegisterPort}
          onOutputClick={onOutputClick}
          onInputClick={onInputClick}
          onUpdateMatch={onUpdateMatch}
          onSetLadderSource={onSetLadderSource}
          onRemoveMatch={onRemoveMatch}
          onRemoveConnection={onRemoveConnection}
          qualifyingTeams={qualifyingTeams}
        />
      ))}

      {/* Add match button */}
      <button
        className="flex items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 px-2 py-1.5 text-[10px] text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
        onClick={() => onAddMatch(weekIndex)}
      >
        <Plus className="h-3 w-3" />
        Add Match
      </button>
    </div>
  )
}
