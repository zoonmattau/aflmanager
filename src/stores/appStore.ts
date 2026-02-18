import { create } from 'zustand'
import type { SaveIndex } from '@/types/save'
import type { GlobalSettings } from '@/types/globalSettings'
import type { LeaguePreset } from '@/types/leaguePreset'
import type { GameState } from '@/types/game'
import type { CustomLeagueTemplate } from '@/types/customLeague'
import { DEFAULT_GLOBAL_SETTINGS } from '@/types/globalSettings'
import { DEFAULT_TABLE_VIEW_SETTINGS } from '@/types/tableView'
import {
  getSaveIndex,
  saveGameToSlot,
  loadGameFromSlot,
  deleteSave as deleteSaveFromDB,
  getGlobalSettings,
  setGlobalSettings as setGlobalSettingsDB,
  getLeaguePresets,
  saveLeaguePreset as saveLeaguePresetDB,
  deleteLeaguePreset as deleteLeaguePresetDB,
  getCustomLeagueTemplates,
  saveCustomLeagueTemplate as saveCustomLeagueTemplateDB,
  deleteCustomLeagueTemplate as deleteCustomLeagueTemplateDB,
  migrateLegacySave,
} from '@/lib/saveManager'

export type AppScreen = 'home' | 'game' | 'new-game' | 'settings' | 'league-presets' | 'custom-league-builder'

interface AppState {
  currentScreen: AppScreen
  saveIndex: SaveIndex | null
  globalSettings: GlobalSettings
  leaguePresets: LeaguePreset[]
  customLeagueTemplates: CustomLeagueTemplate[]
  initialized: boolean
}

interface AppActions {
  initialize: () => Promise<void>
  setScreen: (screen: AppScreen) => void
  saveCurrentGame: (gameState: GameState) => Promise<void>
  loadGame: (saveId: string) => Promise<GameState | null>
  deleteSave: (saveId: string) => Promise<void>
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => Promise<void>
  refreshSaveIndex: () => Promise<void>
  createLeaguePreset: (preset: LeaguePreset) => Promise<void>
  deleteLeaguePreset: (presetId: string) => Promise<void>
  createOrUpdateCustomLeagueTemplate: (template: CustomLeagueTemplate) => Promise<void>
  deleteCustomLeagueTemplate: (templateId: string) => Promise<void>
}

export type AppStore = AppState & AppActions

export const useAppStore = create<AppStore>()((set, get) => ({
  currentScreen: 'home',
  saveIndex: null,
  globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
  leaguePresets: [],
  customLeagueTemplates: [],
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    // Migrate legacy saves
    await migrateLegacySave()

    // Load save index
    const saveIndex = await getSaveIndex()

    // Load global settings
    const storedSettings = await getGlobalSettings()
    const globalSettings = storedSettings
      ? {
        ...DEFAULT_GLOBAL_SETTINGS,
        ...storedSettings,
        tableViews: {
          ...DEFAULT_TABLE_VIEW_SETTINGS,
          ...(storedSettings.tableViews ?? {}),
          tables: {
            ...DEFAULT_TABLE_VIEW_SETTINGS.tables,
            ...(storedSettings.tableViews?.tables ?? {}),
          },
          globalPresets: {
            ...DEFAULT_TABLE_VIEW_SETTINGS.globalPresets,
            ...(storedSettings.tableViews?.globalPresets ?? {}),
          },
        },
        lineupAutofill: {
          ...DEFAULT_GLOBAL_SETTINGS.lineupAutofill,
          ...(storedSettings.lineupAutofill ?? {}),
          customPresets: storedSettings.lineupAutofill?.customPresets ?? DEFAULT_GLOBAL_SETTINGS.lineupAutofill.customPresets,
        },
      }
      : { ...DEFAULT_GLOBAL_SETTINGS }

    // Load league presets
    const leaguePresets = await getLeaguePresets()
    const customLeagueTemplates = await getCustomLeagueTemplates()

    set({
      saveIndex,
      globalSettings,
      leaguePresets,
      customLeagueTemplates,
      initialized: true,
    })
  },

  setScreen: (screen) => set({ currentScreen: screen }),

  saveCurrentGame: async (gameState) => {
    await saveGameToSlot(gameState)
    const saveIndex = await getSaveIndex()
    set({ saveIndex })
  },

  loadGame: async (saveId) => {
    const gameState = await loadGameFromSlot(saveId)
    if (gameState) {
      // Update lastPlayedSaveId
      const saveIndex = await getSaveIndex()
      saveIndex.lastPlayedSaveId = saveId
      const { updateSaveIndex } = await import('@/lib/saveManager')
      await updateSaveIndex(saveIndex)
      set({ saveIndex })
    }
    return gameState
  },

  deleteSave: async (saveId) => {
    await deleteSaveFromDB(saveId)
    const saveIndex = await getSaveIndex()
    set({ saveIndex })
  },

  updateGlobalSettings: async (updates) => {
    const current = get().globalSettings
    const merged = { ...current, ...updates }
    await setGlobalSettingsDB(merged)
    set({ globalSettings: merged })
  },

  refreshSaveIndex: async () => {
    const saveIndex = await getSaveIndex()
    set({ saveIndex })
  },

  createLeaguePreset: async (preset) => {
    await saveLeaguePresetDB(preset)
    const leaguePresets = await getLeaguePresets()
    set({ leaguePresets })
  },

  deleteLeaguePreset: async (presetId) => {
    await deleteLeaguePresetDB(presetId)
    const leaguePresets = await getLeaguePresets()
    set({ leaguePresets })
  },

  createOrUpdateCustomLeagueTemplate: async (template) => {
    await saveCustomLeagueTemplateDB(template)
    const customLeagueTemplates = await getCustomLeagueTemplates()
    set({ customLeagueTemplates })
  },

  deleteCustomLeagueTemplate: async (templateId) => {
    await deleteCustomLeagueTemplateDB(templateId)
    const customLeagueTemplates = await getCustomLeagueTemplates()
    set({ customLeagueTemplates })
  },
}))
