import { get, set, del } from 'idb-keyval'
import type { SaveIndex, SaveSlotMeta, CheckpointMeta, CheckpointType } from '@/types/save'
import type { GlobalSettings } from '@/types/globalSettings'
import type { LeaguePreset } from '@/types/leaguePreset'
import type { GameState } from '@/types/game'
import type { CustomLeagueTemplate } from '@/types/customLeague'
import { GAME_VERSION, SAVE_SCHEMA_VERSION } from '@/engine/core/gameVersion'
import { compressState, decompressState, isCompressed } from '@/lib/saveCompression'

// ---------------------------------------------------------------------------
// Runtime environment detection
// ---------------------------------------------------------------------------
/** True when running inside a Tauri desktop window. */
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Lazily resolved Tauri adapter — only imported when IS_TAURI is true. */
let _ta: typeof import('./tauriSaveAdapter') | null = null
async function ta(): Promise<typeof import('./tauriSaveAdapter')> {
  if (!_ta) _ta = await import('./tauriSaveAdapter')
  return _ta
}

// ---------------------------------------------------------------------------
// IndexedDB keys
// ---------------------------------------------------------------------------
const KEY_SAVE_INDEX = 'afl-save-index'
const KEY_SAVE_PREFIX = 'afl-save:'
const KEY_CHECKPOINT_PREFIX = 'afl-cp:'
const KEY_GLOBAL_SETTINGS = 'afl-global-settings'
const KEY_LEAGUE_PRESETS = 'afl-league-presets'
const KEY_CUSTOM_LEAGUE_TEMPLATES = 'afl-custom-league-templates'
const KEY_LEGACY_SAVE = 'afl-manager-save' // Zustand persist key

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip function properties so the state is JSON-serializable. */
function serializeState(gameState: GameState): Record<string, unknown> {
  const serializable: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(gameState)) {
    if (typeof value !== 'function') {
      serializable[key] = value
    }
  }
  return serializable
}

// ---------------------------------------------------------------------------
// Save-size pruning
// ---------------------------------------------------------------------------
const NEWS_PRUNE_LIMIT = 500
const EMAIL_PRUNE_LIMIT = 200
const DEV_REPORTS_KEEP = 10
const MATCH_REPORTS_PRUNE_LIMIT = 500

function pruneStateForSave(state: Record<string, unknown>): Record<string, unknown> {
  const result = { ...state }
  if (Array.isArray(result['newsLog']) && (result['newsLog'] as unknown[]).length > NEWS_PRUNE_LIMIT) {
    result['newsLog'] = (result['newsLog'] as unknown[]).slice(-NEWS_PRUNE_LIMIT)
  }
  if (Array.isArray(result['emailLog']) && (result['emailLog'] as unknown[]).length > EMAIL_PRUNE_LIMIT) {
    result['emailLog'] = (result['emailLog'] as unknown[]).slice(-EMAIL_PRUNE_LIMIT)
  }
  const history = result['history']
  if (history && typeof history === 'object' && !Array.isArray(history)) {
    let h = history as Record<string, unknown>
    if (Array.isArray(h['developmentReports']) && (h['developmentReports'] as unknown[]).length > DEV_REPORTS_KEEP) {
      h = { ...h, developmentReports: (h['developmentReports'] as unknown[]).slice(-DEV_REPORTS_KEEP) }
      result['history'] = h
    }
    if (Array.isArray(h['matchReports']) && (h['matchReports'] as unknown[]).length > MATCH_REPORTS_PRUNE_LIMIT) {
      result['history'] = { ...h, matchReports: (h['matchReports'] as unknown[]).slice(-MATCH_REPORTS_PRUNE_LIMIT) }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Save Index
// ---------------------------------------------------------------------------
export async function getSaveIndex(): Promise<SaveIndex> {
  if (IS_TAURI) return (await ta()).getSaveIndex()

  const raw = await get(KEY_SAVE_INDEX)
  if (raw) {
    const index = raw as Partial<SaveIndex>
    return {
      saves: index.saves ?? [],
      lastPlayedSaveId: index.lastPlayedSaveId ?? null,
      checkpoints: index.checkpoints ?? {},
    }
  }
  return { saves: [], lastPlayedSaveId: null, checkpoints: {} }
}

export async function updateSaveIndex(index: SaveIndex): Promise<void> {
  if (IS_TAURI) return (await ta()).updateSaveIndex(index)
  await set(KEY_SAVE_INDEX, index)
}

// ---------------------------------------------------------------------------
// Save/Load game slots
// ---------------------------------------------------------------------------
export async function saveGameToSlot(gameState: GameState): Promise<void> {
  if (IS_TAURI) return (await ta()).saveGameToSlot(gameState)

  const id = gameState.meta.id
  if (!id) return

  const serialized = serializeState(gameState)
  const pruned = pruneStateForSave(serialized)
  const compressed = await compressState(pruned)
  await set(`${KEY_SAVE_PREFIX}${id}`, compressed)

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
    version: GAME_VERSION,
    schemaVersion: SAVE_SCHEMA_VERSION,
  }

  const existingIdx = index.saves.findIndex((s) => s.id === id)
  if (existingIdx >= 0) index.saves[existingIdx] = meta
  else index.saves.push(meta)
  index.lastPlayedSaveId = id
  await updateSaveIndex(index)
}

export async function loadGameFromSlot(saveId: string): Promise<GameState | null> {
  if (IS_TAURI) return (await ta()).loadGameFromSlot(saveId)

  const raw = await get(`${KEY_SAVE_PREFIX}${saveId}`)
  if (!raw) return null
  if (isCompressed(raw)) {
    const data = await decompressState(raw)
    return data as unknown as GameState
  }
  return raw as unknown as GameState
}

export async function deleteSave(saveId: string): Promise<void> {
  if (IS_TAURI) return (await ta()).deleteSave(saveId)

  await del(`${KEY_SAVE_PREFIX}${saveId}`)
  const index = await getSaveIndex()
  index.saves = index.saves.filter((s) => s.id !== saveId)
  const checkpoints = index.checkpoints[saveId] ?? []
  for (const cp of checkpoints) {
    await del(`${KEY_CHECKPOINT_PREFIX}${cp.id}`)
  }
  delete index.checkpoints[saveId]
  if (index.lastPlayedSaveId === saveId) {
    index.lastPlayedSaveId = index.saves.length > 0
      ? index.saves.sort((a, b) => b.lastSaved.localeCompare(a.lastSaved))[0]!.id
      : null
  }
  await updateSaveIndex(index)
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------
export async function createCheckpoint(
  gameState: GameState,
  type: CheckpointType,
  label: string,
): Promise<CheckpointMeta> {
  if (IS_TAURI) return (await ta()).createCheckpoint(gameState, type, label)

  const id = `cp-${gameState.meta.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const meta: CheckpointMeta = {
    id,
    gameId: gameState.meta.id,
    label,
    type,
    currentYear: gameState.currentYear,
    currentRound: gameState.currentRound,
    phase: gameState.phase,
    savedAt: new Date().toISOString(),
    version: GAME_VERSION,
    schemaVersion: SAVE_SCHEMA_VERSION,
  }
  const cpCompressed = await compressState(pruneStateForSave(serializeState(gameState)))
  await set(`${KEY_CHECKPOINT_PREFIX}${id}`, cpCompressed)
  const index = await getSaveIndex()
  const existing = index.checkpoints[gameState.meta.id] ?? []
  index.checkpoints[gameState.meta.id] = [meta, ...existing]
  await updateSaveIndex(index)
  return meta
}

export async function loadCheckpoint(checkpointId: string): Promise<GameState | null> {
  if (IS_TAURI) return (await ta()).loadCheckpoint(checkpointId)

  const raw = await get(`${KEY_CHECKPOINT_PREFIX}${checkpointId}`)
  if (!raw) return null
  if (isCompressed(raw)) {
    const data = await decompressState(raw)
    return data as unknown as GameState
  }
  return raw as unknown as GameState
}

export async function deleteCheckpoint(gameId: string, checkpointId: string): Promise<void> {
  if (IS_TAURI) return (await ta()).deleteCheckpoint(gameId, checkpointId)

  await del(`${KEY_CHECKPOINT_PREFIX}${checkpointId}`)
  const index = await getSaveIndex()
  const checkpoints = index.checkpoints[gameId] ?? []
  index.checkpoints[gameId] = checkpoints.filter((c) => c.id !== checkpointId)
  await updateSaveIndex(index)
}

export async function pruneAutosaveCheckpoints(gameId: string, maxCount: number): Promise<void> {
  if (IS_TAURI) return (await ta()).pruneAutosaveCheckpoints(gameId, maxCount)

  if (maxCount <= 0) return
  const index = await getSaveIndex()
  const checkpoints = index.checkpoints[gameId] ?? []
  const autosaves = checkpoints.filter((c) => c.type === 'autosave')
  if (autosaves.length <= maxCount) return
  const toDelete = autosaves.slice(maxCount)
  for (const cp of toDelete) {
    await del(`${KEY_CHECKPOINT_PREFIX}${cp.id}`)
  }
  const deleteIds = new Set(toDelete.map((c) => c.id))
  index.checkpoints[gameId] = checkpoints.filter((c) => !deleteIds.has(c.id))
  await updateSaveIndex(index)
}

export async function getCheckpointsForGame(gameId: string): Promise<CheckpointMeta[]> {
  if (IS_TAURI) return (await ta()).getCheckpointsForGame(gameId)

  const index = await getSaveIndex()
  return index.checkpoints[gameId] ?? []
}

// ---------------------------------------------------------------------------
// Global Settings
// ---------------------------------------------------------------------------
export async function getGlobalSettings(): Promise<GlobalSettings | null> {
  if (IS_TAURI) return (await ta()).getGlobalSettings()
  const raw = await get(KEY_GLOBAL_SETTINGS)
  return (raw as GlobalSettings) ?? null
}

export async function setGlobalSettings(settings: GlobalSettings): Promise<void> {
  if (IS_TAURI) return (await ta()).setGlobalSettings(settings)
  await set(KEY_GLOBAL_SETTINGS, settings)
}

// ---------------------------------------------------------------------------
// League Presets
// ---------------------------------------------------------------------------
export async function getLeaguePresets(): Promise<LeaguePreset[]> {
  if (IS_TAURI) return (await ta()).getLeaguePresets()
  const raw = await get(KEY_LEAGUE_PRESETS)
  return (raw as LeaguePreset[]) ?? []
}

export async function saveLeaguePreset(preset: LeaguePreset): Promise<void> {
  if (IS_TAURI) return (await ta()).saveLeaguePreset(preset)
  const presets = await getLeaguePresets()
  const existingIdx = presets.findIndex((p) => p.id === preset.id)
  if (existingIdx >= 0) presets[existingIdx] = preset
  else presets.push(preset)
  await set(KEY_LEAGUE_PRESETS, presets)
}

export async function deleteLeaguePreset(presetId: string): Promise<void> {
  if (IS_TAURI) return (await ta()).deleteLeaguePreset(presetId)
  const presets = await getLeaguePresets()
  await set(KEY_LEAGUE_PRESETS, presets.filter((p) => p.id !== presetId))
}

// ---------------------------------------------------------------------------
// Custom League Templates
// ---------------------------------------------------------------------------
export async function getCustomLeagueTemplates(): Promise<CustomLeagueTemplate[]> {
  if (IS_TAURI) return (await ta()).getCustomLeagueTemplates()
  const raw = await get(KEY_CUSTOM_LEAGUE_TEMPLATES)
  return (raw as CustomLeagueTemplate[]) ?? []
}

export async function saveCustomLeagueTemplate(template: CustomLeagueTemplate): Promise<void> {
  if (IS_TAURI) return (await ta()).saveCustomLeagueTemplate(template)
  const templates = await getCustomLeagueTemplates()
  const idx = templates.findIndex((t) => t.id === template.id)
  if (idx >= 0) templates[idx] = template
  else templates.push(template)
  await set(KEY_CUSTOM_LEAGUE_TEMPLATES, templates)
}

export async function deleteCustomLeagueTemplate(templateId: string): Promise<void> {
  if (IS_TAURI) return (await ta()).deleteCustomLeagueTemplate(templateId)
  const templates = await getCustomLeagueTemplates()
  await set(KEY_CUSTOM_LEAGUE_TEMPLATES, templates.filter((t) => t.id !== templateId))
}

// ---------------------------------------------------------------------------
// Migration: detect legacy Zustand persist key
// ---------------------------------------------------------------------------
export async function migrateLegacySave(): Promise<boolean> {
  if (IS_TAURI) return (await ta()).migrateLegacySave()

  const index = await getSaveIndex()
  if (index.saves.length > 0) return false

  const raw = await get(KEY_LEGACY_SAVE)
  if (!raw) return false

  try {
    const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw
    const gameState = (wrapper?.state ?? wrapper) as GameState
    if (!gameState?.meta?.id || gameState.phase === 'setup') return false
    await saveGameToSlot(gameState)
    return true
  } catch {
    return false
  }
}
