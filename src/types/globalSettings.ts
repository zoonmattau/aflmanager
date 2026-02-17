export interface GlobalSettings {
  theme: 'dark' | 'light' | 'system'
  autoSaveEnabled: boolean
  autoSaveIntervalMinutes: number
  defaultSimSpeed: 'instant' | 'fast' | 'normal'
  confirmBeforeSimulating: boolean
  showTutorialHints: boolean
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: 'dark',
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 5,
  defaultSimSpeed: 'normal',
  confirmBeforeSimulating: false,
  showTutorialHints: true,
}
