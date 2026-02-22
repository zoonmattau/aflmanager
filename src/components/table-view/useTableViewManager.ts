import { useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { TableSortDirection, TableViewSnapshot } from '@/types/tableView'

export interface TableViewColumnConfig {
  id: string
  label: string
  defaultVisible?: boolean
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  sortable?: boolean
}

function unique(items: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function buildDefaultSnapshot(
  columns: TableViewColumnConfig[],
  defaultSort?: { columnId: string; direction: TableSortDirection },
): TableViewSnapshot {
  const columnOrder = columns.map((c) => c.id)
  const hiddenColumnIds = columns
    .filter((c) => c.defaultVisible === false)
    .map((c) => c.id)
  const columnWidths: Record<string, number> = {}
  for (const c of columns) {
    if (typeof c.defaultWidth === 'number') {
      columnWidths[c.id] = c.defaultWidth
    }
  }
  return {
    columnOrder,
    hiddenColumnIds,
    columnWidths,
    sort: defaultSort ?? null,
  }
}

function sanitizeSnapshot(
  snapshot: TableViewSnapshot,
  columns: TableViewColumnConfig[],
  defaultSnapshot: TableViewSnapshot,
): TableViewSnapshot {
  const columnIds = new Set(columns.map((c) => c.id))
  const safeOrder: string[] = Array.isArray(snapshot.columnOrder) ? snapshot.columnOrder : []
  const safeHidden: string[] = Array.isArray(snapshot.hiddenColumnIds) ? snapshot.hiddenColumnIds : []
  const order = unique([
    ...safeOrder.filter((id) => columnIds.has(id)),
    ...defaultSnapshot.columnOrder.filter((id) => columnIds.has(id)),
  ])
  const hidden = unique(
    safeHidden.filter((id) => columnIds.has(id)),
  )
  const widths: Record<string, number> = {}
  for (const [id, width] of Object.entries(snapshot.columnWidths ?? {})) {
    if (!columnIds.has(id)) continue
    const col = columns.find((c) => c.id === id)
    if (!col) continue
    const min = col.minWidth ?? 40
    const max = col.maxWidth ?? 800
    widths[id] = Math.min(max, Math.max(min, Math.round(width)))
  }
  const sort = snapshot.sort && columnIds.has(snapshot.sort.columnId)
    ? snapshot.sort
    : defaultSnapshot.sort
  return {
    columnOrder: order,
    hiddenColumnIds: hidden,
    columnWidths: widths,
    sort,
  }
}

export function useTableViewManager(params: {
  tableId: string
  columns: TableViewColumnConfig[]
  defaultSort?: { columnId: string; direction: TableSortDirection }
}) {
  const { tableId, columns, defaultSort } = params
  const globalSettings = useAppStore((s) => s.globalSettings)
  const updateGlobalSettings = useAppStore((s) => s.updateGlobalSettings)

  const defaultSnapshot = useMemo(
    () => buildDefaultSnapshot(columns, defaultSort),
    [columns, defaultSort],
  )

  const tableSettings = globalSettings.tableViews.tables[tableId]
  const activeSnapshot = useMemo(
    () =>
      sanitizeSnapshot(
        tableSettings ?? {
          ...defaultSnapshot,
          presets: {},
          updatedAt: new Date().toISOString(),
        },
        columns,
        defaultSnapshot,
      ),
    [tableSettings, columns, defaultSnapshot],
  )

  const visibleColumnIds = useMemo(
    () => activeSnapshot.columnOrder.filter((id) => !activeSnapshot.hiddenColumnIds.includes(id)),
    [activeSnapshot],
  )

  const updateSnapshot = async (nextSnapshot: TableViewSnapshot) => {
    const safe = sanitizeSnapshot(nextSnapshot, columns, defaultSnapshot)
    const currentTable = globalSettings.tableViews.tables[tableId]
    const nextTable = {
      ...safe,
      presets: currentTable?.presets ?? {},
      updatedAt: new Date().toISOString(),
    }
    await updateGlobalSettings({
      tableViews: {
        ...globalSettings.tableViews,
        tables: {
          ...globalSettings.tableViews.tables,
          [tableId]: nextTable,
        },
      },
    })
  }

  const setSort = (columnId: string | null, direction: TableSortDirection = 'asc') => {
    void updateSnapshot({
      ...activeSnapshot,
      sort: columnId ? { columnId, direction } : null,
    })
  }

  const setColumnVisible = (columnId: string, visible: boolean) => {
    const hiddenSet = new Set(activeSnapshot.hiddenColumnIds)
    if (visible) hiddenSet.delete(columnId)
    else hiddenSet.add(columnId)
    void updateSnapshot({
      ...activeSnapshot,
      hiddenColumnIds: [...hiddenSet],
    })
  }

  const moveColumn = (columnId: string, direction: 'left' | 'right') => {
    const current = [...activeSnapshot.columnOrder]
    const index = current.indexOf(columnId)
    if (index < 0) return
    const target = direction === 'left' ? index - 1 : index + 1
    if (target < 0 || target >= current.length) return
    const [item] = current.splice(index, 1)
    current.splice(target, 0, item)
    void updateSnapshot({ ...activeSnapshot, columnOrder: current })
  }

  const setColumnWidth = (columnId: string, width: number) => {
    void updateSnapshot({
      ...activeSnapshot,
      columnWidths: {
        ...activeSnapshot.columnWidths,
        [columnId]: width,
      },
    })
  }

  const resetToDefaults = () => {
    void updateSnapshot(defaultSnapshot)
  }

  const saveLocalPreset = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const currentTable = globalSettings.tableViews.tables[tableId]
    await updateGlobalSettings({
      tableViews: {
        ...globalSettings.tableViews,
        tables: {
          ...globalSettings.tableViews.tables,
          [tableId]: {
            ...(currentTable ?? {
              ...defaultSnapshot,
              presets: {},
              updatedAt: new Date().toISOString(),
            }),
            ...activeSnapshot,
            presets: {
              ...(currentTable?.presets ?? {}),
              [trimmed]: activeSnapshot,
            },
            updatedAt: new Date().toISOString(),
          },
        },
      },
    })
  }

  const loadLocalPreset = (name: string) => {
    const preset = globalSettings.tableViews.tables[tableId]?.presets?.[name]
    if (!preset) return
    void updateSnapshot(preset)
  }

  const deleteLocalPreset = async (name: string) => {
    const currentTable = globalSettings.tableViews.tables[tableId]
    if (!currentTable) return
    const nextPresets = { ...currentTable.presets }
    delete nextPresets[name]
    await updateGlobalSettings({
      tableViews: {
        ...globalSettings.tableViews,
        tables: {
          ...globalSettings.tableViews.tables,
          [tableId]: {
            ...currentTable,
            presets: nextPresets,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    })
  }

  const saveGlobalPreset = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await updateGlobalSettings({
      tableViews: {
        ...globalSettings.tableViews,
        globalPresets: {
          ...globalSettings.tableViews.globalPresets,
          [trimmed]: {
            ...activeSnapshot,
            name: trimmed,
            sourceTableId: tableId,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    })
  }

  const loadGlobalPreset = (name: string) => {
    const preset = globalSettings.tableViews.globalPresets[name]
    if (!preset) return
    void updateSnapshot(preset)
  }

  const deleteGlobalPreset = async (name: string) => {
    const next = { ...globalSettings.tableViews.globalPresets }
    delete next[name]
    await updateGlobalSettings({
      tableViews: {
        ...globalSettings.tableViews,
        globalPresets: next,
      },
    })
  }

  return {
    snapshot: activeSnapshot,
    visibleColumnIds,
    localPresets: Object.keys(globalSettings.tableViews.tables[tableId]?.presets ?? {}).sort((a, b) => a.localeCompare(b)),
    globalPresets: Object.keys(globalSettings.tableViews.globalPresets).sort((a, b) => a.localeCompare(b)),
    setSort,
    setColumnVisible,
    moveColumn,
    setColumnWidth,
    resetToDefaults,
    saveLocalPreset,
    loadLocalPreset,
    deleteLocalPreset,
    saveGlobalPreset,
    loadGlobalPreset,
    deleteGlobalPreset,
  }
}
