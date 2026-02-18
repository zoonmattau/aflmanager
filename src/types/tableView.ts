export type TableSortDirection = 'asc' | 'desc'

export interface TableViewSort {
  columnId: string
  direction: TableSortDirection
}

export interface TableViewSnapshot {
  columnOrder: string[]
  hiddenColumnIds: string[]
  columnWidths: Record<string, number>
  sort: TableViewSort | null
}

export interface TableViewTableState extends TableViewSnapshot {
  presets: Record<string, TableViewSnapshot>
  updatedAt: string
}

export interface TableViewGlobalPreset extends TableViewSnapshot {
  name: string
  sourceTableId: string
  updatedAt: string
}

export interface TableViewSettings {
  tables: Record<string, TableViewTableState>
  globalPresets: Record<string, TableViewGlobalPreset>
}

export const DEFAULT_TABLE_VIEW_SETTINGS: TableViewSettings = {
  tables: {},
  globalPresets: {},
}
