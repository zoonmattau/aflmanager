import { get, set, del } from 'idb-keyval'
import type { SaveIndex, SaveSlotMeta } from '@/types/save'
import type { GlobalSettings } from '@/types/globalSettings'
import type { LeaguePreset } from '@/types/leaguePreset'
import type { GameState } from '@/types/game'

// ---------------------------------------------------------------------------
// IndexedDB keys
// ---------------------------------------------------------------------------
const KEY_SAVE_INDEX = 'afl-save-index'
const KEY_SAVE_PREFIX = 'afl-save:'
const KEY_GLOBAL_SETTINGS = 'afl-global-settings'
const KEY_LEAGUE_PRESETS = 'afl-league-presets'
const KEY_LEGACY_SAVE = 'afl-manager-save' // Zustand persist key

// ---------------------------------------------------------------------------
// Save Index
// ---------------------------------------------------------------------------
export async function getSaveIndex(): Promise<SaveIndex> {
  const raw = await get(KEY_SAVE_INDEX)
  if (raw) return raw as SaveIndex
  return { saves: [], lastPlayedSaveId: null }
}

export async function updateSaveIndex(index: SaveIndex): Promise<void> {
  await set(KEY_SAVE_INDEX, index)
}

// ---------------------------------------------------------------------------
// Save/Load game slots
// ---------------------------------------------------------------------------
export async function saveGameToSlot(gameState: GameState): Promise<void> {
  const id = gameState.meta.id
  if (!id) return

  // Strip non-serializable properties (e.g. Zustand action functions from getState())
  const serializable: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(gameState)) {
    if (typeof value !== 'function') {
      serializable[key] = value
    }
  }

  // Write the serializable game state to its own key
  await set(`${KEY_SAVE_PREFIX}${id}`, serializable)

  // Update the save index with metadata
  const index = await getSaveIndex()
  const clubName = gameState.clubs[gameState.playerClubId]?.fullName ?? 'Unemployed'
  const meta: SaveSlotMeta = {
    id,
    saveName: gameState.meta.saveName || 'Untitled Save',
    clubId: gameState.playerClubId,
    clubName,
    managerName: gameState.manager?.name ?? 'Manager',
    currentYear: gameState.currentYear,
    currentRound: gameState.currentRound,
    phase: gameState.phase,
    createdAt: gameState.meta.createdAt,
    lastSaved: gameState.meta.lastSaved || new Date().toISOString(),
    version: gameState.meta.version,
  }

  const existingIdx = index.saves.findIndex((s) => s.id === id)
  if (existingIdx >= 0) {
    index.saves[existingIdx] = meta
  } else {
    index.saves.push(meta)
  }
  index.lastPlayedSaveId = id

  await updateSaveIndex(index)
}

export async function loadGameFromSlot(saveId: string): Promise<GameState | null> {
  const raw = await get(`${KEY_SAVE_PREFIX}${saveId}`)
  if (!raw) return null
  return raw as GameState
}

export async function deleteSave(saveId: string): Promise<void> {
  await del(`${KEY_SAVE_PREFIX}${saveId}`)

  const index = await getSaveIndex()
  index.saves = index.saves.filter((s) => s.id !== saveId)
  if (index.lastPlayedSaveId === saveId) {
    index.lastPlayedSaveId = index.saves.length > 0
      ? index.saves.sort((a, b) => b.lastSaved.localeCompare(a.lastSaved))[0]!.id
      : null
  }
  await updateSaveIndex(index)
}

// ---------------------------------------------------------------------------
// Global Settings
// ---------------------------------------------------------------------------
export async function getGlobalSettings(): Promise<GlobalSettings | null> {
  const raw = await get(KEY_GLOBAL_SETTINGS)
  return (raw as GlobalSettings) ?? null
}

export async function setGlobalSettings(settings: GlobalSettings): Promise<void> {
  await set(KEY_GLOBAL_SETTINGS, settings)
}

// ---------------------------------------------------------------------------
// League Presets
// ---------------------------------------------------------------------------
export async function getLeaguePresets(): Promise<LeaguePreset[]> {
  const raw = await get(KEY_LEAGUE_PRESETS)
  return (raw as LeaguePreset[]) ?? []
}

export async function saveLeaguePreset(preset: LeaguePreset): Promise<void> {
  const presets = await getLeaguePresets()
  const existingIdx = presets.findIndex((p) => p.id === preset.id)
  if (existingIdx >= 0) {
    presets[existingIdx] = preset
  } else {
    presets.push(preset)
  }
  await set(KEY_LEAGUE_PRESETS, presets)
}

export async function deleteLeaguePreset(presetId: string): Promise<void> {
  const presets = await getLeaguePresets()
  await set(KEY_LEAGUE_PRESETS, presets.filter((p) => p.id !== presetId))
}

// ---------------------------------------------------------------------------
// Migration: detect legacy Zustand persist key
// ---------------------------------------------------------------------------
export async function migrateLegacySave(): Promise<boolean> {
  const index = await getSaveIndex()
  if (index.saves.length > 0) return false // Already migrated

  // Check for legacy Zustand persist key
  const raw = await get(KEY_LEGACY_SAVE)
  if (!raw) return false

  try {
    // Zustand persist wraps in { state: ..., version: ... }
    const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw
    const gameState = (wrapper?.state ?? wrapper) as GameState
    if (!gameState?.meta?.id || gameState.phase === 'setup') return false

    // Save to new slot
    await saveGameToSlot(gameState)
    return true
  } catch {
    return false
  }
}
