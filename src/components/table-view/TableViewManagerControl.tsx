import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TableSortDirection } from '@/types/tableView'
import type { TableViewColumnConfig } from './useTableViewManager'
import { Settings2 } from 'lucide-react'

interface TableViewManagerControlProps {
  columns: TableViewColumnConfig[]
  manager: {
    snapshot: {
      hiddenColumnIds: string[]
      columnWidths: Record<string, number>
      sort: { columnId: string; direction: TableSortDirection } | null
      columnOrder: string[]
    }
    localPresets: string[]
    globalPresets: string[]
    setSort: (columnId: string | null, direction?: TableSortDirection) => void
    setColumnVisible: (columnId: string, visible: boolean) => void
    moveColumn: (columnId: string, direction: 'left' | 'right') => void
    setColumnWidth: (columnId: string, width: number) => void
    resetToDefaults: () => void
    saveLocalPreset: (name: string) => Promise<void>
    loadLocalPreset: (name: string) => void
    deleteLocalPreset: (name: string) => Promise<void>
    saveGlobalPreset: (name: string) => Promise<void>
    loadGlobalPreset: (name: string) => void
    deleteGlobalPreset: (name: string) => Promise<void>
  }
}

export function TableViewManagerControl({ columns, manager }: TableViewManagerControlProps) {
  const [presetName, setPresetName] = useState('')
  const [selectedLocal, setSelectedLocal] = useState('')
  const [selectedGlobal, setSelectedGlobal] = useState('')

  const hiddenSet = new Set(manager.snapshot.hiddenColumnIds)
  const columnsById = new Map(columns.map((c) => [c.id, c] as const))
  const orderedColumns = manager.snapshot.columnOrder
    .map((id) => columnsById.get(id))
    .filter((c): c is TableViewColumnConfig => Boolean(c))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          View
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] space-y-3 p-3">
        <div className="space-y-1">
          <Label className="text-xs">Default Sort</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={manager.snapshot.sort?.columnId ?? 'none'}
              onValueChange={(value) => {
                if (value === 'none') manager.setSort(null)
                else manager.setSort(value, manager.snapshot.sort?.direction ?? 'desc')
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No sort</SelectItem>
                {columns.filter((c) => c.sortable !== false).map((col) => (
                  <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={manager.snapshot.sort?.direction ?? 'desc'}
              onValueChange={(value) => {
                if (!manager.snapshot.sort) return
                manager.setSort(manager.snapshot.sort.columnId, value as TableSortDirection)
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Columns</Label>
          <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2">
            {orderedColumns.map((col, index) => (
              <div key={col.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2">
                <input
                  type="checkbox"
                  checked={!hiddenSet.has(col.id)}
                  onChange={(e) => manager.setColumnVisible(col.id, e.target.checked)}
                />
                <span className="truncate text-xs">{col.label}</span>
                <Input
                  type="number"
                  className="h-7 w-16 text-[11px]"
                  min={col.minWidth ?? 40}
                  max={col.maxWidth ?? 800}
                  value={manager.snapshot.columnWidths[col.id] ?? col.defaultWidth ?? 100}
                  onChange={(e) => manager.setColumnWidth(col.id, Number(e.target.value))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={index === 0}
                  onClick={() => manager.moveColumn(col.id, 'left')}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={index === orderedColumns.length - 1}
                  onClick={() => manager.moveColumn(col.id, 'right')}
                >
                  ↓
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Input
              className="h-8 text-xs"
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button className="h-8 text-xs" onClick={() => void manager.saveLocalPreset(presetName)}>Save</Button>
            <Button className="h-8 text-xs" variant="outline" onClick={() => void manager.saveGlobalPreset(presetName)}>Save Global</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={selectedLocal} onValueChange={(value) => {
              setSelectedLocal(value)
              manager.loadLocalPreset(value)
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Load local" /></SelectTrigger>
              <SelectContent>{manager.localPresets.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
            </Select>
            <Button
              className="h-8 text-xs"
              variant="outline"
              disabled={!selectedLocal}
              onClick={() => void manager.deleteLocalPreset(selectedLocal)}
            >
              Delete Local
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={selectedGlobal} onValueChange={(value) => {
              setSelectedGlobal(value)
              manager.loadGlobalPreset(value)
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Load global" /></SelectTrigger>
              <SelectContent>{manager.globalPresets.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
            </Select>
            <Button
              className="h-8 text-xs"
              variant="outline"
              disabled={!selectedGlobal}
              onClick={() => void manager.deleteGlobalPreset(selectedGlobal)}
            >
              Delete Global
            </Button>
          </div>
          <Button className="h-8 w-full text-xs" variant="secondary" onClick={manager.resetToDefaults}>
            Reset to Defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
