import type { TableViewSettings } from './tableView'
import { DEFAULT_TABLE_VIEW_SETTINGS } from './tableView'

export type LineupAutofillPresetId = 'best-available' | 'last-game' | 'youth-focus' | 'win-now' | `custom:${string}`

export interface CustomLineupAutofillPreset {
  id: string
  name: string
  baseStrategy: 'best-available' | 'last-game' | 'youth-focus' | 'win-now'
  preserveAssignments: boolean
  continuityBias: number
}

export interface LineupAutofillSettings {
  selectedPresetId: LineupAutofillPresetId
  preserveAssignments: boolean
  continuityBias: number
  customPresets: CustomLineupAutofillPreset[]
}

export interface GlobalSettings {
  theme: 'dark' | 'light' | 'system'
  autoSaveEnabled: boolean
  autoSaveIntervalMinutes: number
  defaultSimSpeed: 'instant' | 'fast' | 'normal'
  confirmBeforeSimulating: boolean
  showTutorialHints: boolean
  tableViews: TableViewSettings
  lineupAutofill: LineupAutofillSettings
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: 'dark',
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 5,
  defaultSimSpeed: 'normal',
  confirmBeforeSimulating: false,
  showTutorialHints: true,
  tableViews: { ...DEFAULT_TABLE_VIEW_SETTINGS },
  lineupAutofill: {
    selectedPresetId: 'best-available',
    preserveAssignments: false,
    continuityBias: 0.55,
    customPresets: [],
  },
}
