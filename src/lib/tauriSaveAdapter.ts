/**
 * Tauri desktop save adapter.
 *
 * Stores all game data as plain JSON files under the user's Documents folder:
 *
 *   Documents/
 *     AFL Manager/
 *       save-index.json          ← master index (SaveIndex)
 *       settings.json            ← GlobalSettings
 *       presets.json             ← LeaguePreset[]
 *       templates.json           ← CustomLeagueTemplate[]
 *       saves/{id}.json          ← pruned GameState
 *       checkpoints/{id}.json    ← pruned GameState snapshot
 *
 * This module is only imported when IS_TAURI is true (saveManager.ts guards the
 * call).  In the web build, dynamic-import isolation keeps @tauri-apps/plugin-fs
 * from executing; it's a no-op package in that context anyway.
 */

import {
  readTextFile,
  writeTextFile,
  exists,
  remove,
  mkdir,
  BaseDirectory,
} from '@tauri-apps/plugin-fs'
import type { SaveIndex, SaveSlotMeta, CheckpointMeta, CheckpointType } from '@/types/save'
import type { GlobalSettings } from '@/types/globalSettings'
import type { LeaguePreset } from '@/types/leaguePreset'
import type { GameState } from '@/types/game'
import type { CustomLeagueTemplate } from '@/types/customLeague'
import { GAME_VERSION, SAVE_SCHEMA_VERSION } from '@/engine/core/gameVersion'

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------
const BASE = BaseDirectory.Document
const APP = 'AFL Manager'

const PATH_INDEX = `${APP}/save-index.json`
const PATH_SETTINGS = `${APP}/settings.json`
const PATH_PRESETS = `${APP}/presets.json`
const PATH_TEMPLATES = `${APP}/templates.json`
const pathSave = (id: string) => `${APP}/saves/${id}.json`
const pathCheckpoint = (id: string) => `${APP}/checkpoints/${id}.json`

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
async function ensureDir(sub?: string): Promise<void> {
  const dir = sub ? `${APP}/${sub}` : APP
  if (!(await exists(dir, { baseDir: BASE }))) {
    await mkdir(dir, { baseDir: BASE, recursive: true })
  }
}

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    if (!(await exists(filePath, { baseDir: BASE }))) return null
    const text = await readTextFile(filePath, { baseDir: BASE })
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data), { baseDir: BASE })
}

// ---------------------------------------------------------------------------
// State serialization (mirrors saveManager.ts helpers)
// ---------------------------------------------------------------------------
function serializeState(gameState: GameState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(gameState)) {
    if (typeof v !== 'function') out[k] = v
  }
  return out
}

const NEWS_PRUNE = 500
const EMAIL_PRUNE = 200
const DEV_REPORTS_KEEP = 10

function pruneStateForSave(state: Record<string, unknown>): Record<string, unknown> {
  const r = { ...state }
  if (Array.isArray(r['newsLog']) && (r['newsLog'] as unknown[]).length > NEWS_PRUNE)
    r['newsLog'] = (r['newsLog'] as unknown[]).slice(-NEWS_PRUNE)
  if (Array.isArray(r['emailLog']) && (r['emailLog'] as unknown[]).length > EMAIL_PRUNE)
    r['emailLog'] = (r['emailLog'] as unknown[]).slice(-EMAIL_PRUNE)
  const h = r['history']
  if (h && typeof h === 'object' && !Array.isArray(h)) {
    const hist = h as Record<string, unknown>
    if (
      Array.isArray(hist['developmentReports']) &&
      (hist['developmentReports'] as unknown[]).length > DEV_REPORTS_KEEP
    ) {
      r['history'] = {
        ...hist,
        developmentReports: (hist['developmentReports'] as unknown[]).slice(-DEV_REPORTS_KEEP),
      }
    }
  }
  return r
}

// ---------------------------------------------------------------------------
// Save Index
// ---------------------------------------------------------------------------
export async function getSaveIndex(): Promise<SaveIndex> {
  const raw = await readJSON<Partial<SaveIndex>>(PATH_INDEX)
  if (raw) {
    return {
      saves: raw.saves ?? [],
      lastPlayedSaveId: raw.lastPlayedSaveId ?? null,
      checkpoints: raw.checkpoints ?? {},
    }
  }
  return { saves: [], lastPlayedSaveId: null, checkpoints: {} }
}

export async function updateSaveIndex(index: SaveIndex): Promise<void> {
  await ensureDir()
  await writeJSON(PATH_INDEX, index)
}

// ---------------------------------------------------------------------------
// Save / Load game slots
// ---------------------------------------------------------------------------
export async function saveGameToSlot(gameState: GameState): Promise<void> {
  const id = gameState.meta.id
  if (!id) return

  await ensureDir('saves')
  const data = pruneStateForSave(serializeState(gameState))
  await writeJSON(pathSave(id), data)

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
  return readJSON<GameState>(pathSave(saveId))
}

export async function deleteSave(saveId: string): Promise<void> {
  const p = pathSave(saveId)
  if (await exists(p, { baseDir: BASE })) await remove(p, { baseDir: BASE })

  const index = await getSaveIndex()
  index.saves = index.saves.filter((s) => s.id !== saveId)

  const checkpoints = index.checkpoints[saveId] ?? []
  for (const cp of checkpoints) {
    const cpPath = pathCheckpoint(cp.id)
    if (await exists(cpPath, { baseDir: BASE })) await remove(cpPath, { baseDir: BASE })
  }
  delete index.checkpoints[saveId]

  if (index.lastPlayedSaveId === saveId) {
    index.lastPlayedSaveId =
      index.saves.length > 0
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

  await ensureDir('checkpoints')
  await writeJSON(pathCheckpoint(id), pruneStateForSave(serializeState(gameState)))

  const index = await getSaveIndex()
  const existing = index.checkpoints[gameState.meta.id] ?? []
  // Prepend — newest first
  index.checkpoints[gameState.meta.id] = [meta, ...existing]
  await updateSaveIndex(index)

  return meta
}

export async function loadCheckpoint(checkpointId: string): Promise<GameState | null> {
  return readJSON<GameState>(pathCheckpoint(checkpointId))
}

export async function deleteCheckpoint(gameId: string, checkpointId: string): Promise<void> {
  const p = pathCheckpoint(checkpointId)
  if (await exists(p, { baseDir: BASE })) await remove(p, { baseDir: BASE })

  const index = await getSaveIndex()
  const cps = index.checkpoints[gameId] ?? []
  index.checkpoints[gameId] = cps.filter((c) => c.id !== checkpointId)
  await updateSaveIndex(index)
}

export async function pruneAutosaveCheckpoints(gameId: string, maxCount: number): Promise<void> {
  if (maxCount <= 0) return

  const index = await getSaveIndex()
  const cps = index.checkpoints[gameId] ?? []
  const autosaves = cps.filter((c) => c.type === 'autosave')

  if (autosaves.length <= maxCount) return

  const toDelete = autosaves.slice(maxCount)
  for (const cp of toDelete) {
    const p = pathCheckpoint(cp.id)
    if (await exists(p, { baseDir: BASE })) await remove(p, { baseDir: BASE })
  }

  const deleteIds = new Set(toDelete.map((c) => c.id))
  index.checkpoints[gameId] = cps.filter((c) => !deleteIds.has(c.id))
  await updateSaveIndex(index)
}

export async function getCheckpointsForGame(gameId: string): Promise<CheckpointMeta[]> {
  const index = await getSaveIndex()
  return index.checkpoints[gameId] ?? []
}

// ---------------------------------------------------------------------------
// Global Settings
// ---------------------------------------------------------------------------
export async function getGlobalSettings(): Promise<GlobalSettings | null> {
  return readJSON<GlobalSettings>(PATH_SETTINGS)
}

export async function setGlobalSettings(settings: GlobalSettings): Promise<void> {
  await ensureDir()
  await writeJSON(PATH_SETTINGS, settings)
}

// ---------------------------------------------------------------------------
// League Presets
// ---------------------------------------------------------------------------
export async function getLeaguePresets(): Promise<LeaguePreset[]> {
  return (await readJSON<LeaguePreset[]>(PATH_PRESETS)) ?? []
}

export async function saveLeaguePreset(preset: LeaguePreset): Promise<void> {
  const presets = await getLeaguePresets()
  const idx = presets.findIndex((p) => p.id === preset.id)
  if (idx >= 0) presets[idx] = preset
  else presets.push(preset)
  await ensureDir()
  await writeJSON(PATH_PRESETS, presets)
}

export async function deleteLeaguePreset(presetId: string): Promise<void> {
  const presets = await getLeaguePresets()
  await ensureDir()
  await writeJSON(PATH_PRESETS, presets.filter((p) => p.id !== presetId))
}

// ---------------------------------------------------------------------------
// Custom League Templates
// ---------------------------------------------------------------------------
export async function getCustomLeagueTemplates(): Promise<CustomLeagueTemplate[]> {
  return (await readJSON<CustomLeagueTemplate[]>(PATH_TEMPLATES)) ?? []
}

export async function saveCustomLeagueTemplate(template: CustomLeagueTemplate): Promise<void> {
  const templates = await getCustomLeagueTemplates()
  const idx = templates.findIndex((t) => t.id === template.id)
  if (idx >= 0) templates[idx] = template
  else templates.push(template)
  await ensureDir()
  await writeJSON(PATH_TEMPLATES, templates)
}

export async function deleteCustomLeagueTemplate(templateId: string): Promise<void> {
  const templates = await getCustomLeagueTemplates()
  await ensureDir()
  await writeJSON(PATH_TEMPLATES, templates.filter((t) => t.id !== templateId))
}

// ---------------------------------------------------------------------------
// Legacy migration — no-op on desktop (no Zustand IDB key to migrate from)
// ---------------------------------------------------------------------------
export async function migrateLegacySave(): Promise<boolean> {
  return false
}
