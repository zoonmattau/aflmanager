/**
 * cloudSaveManager – thin async layer that uploads / downloads game saves
 * to/from the Supabase `cloud_saves` table.
 *
 * All functions return a result object ({ data, error }) so callers can handle
 * failures gracefully without throwing.  The local IndexedDB save is always
 * written first; cloud sync is a secondary, best-effort operation.
 */

import { supabase } from './supabase'
import type { GameState } from '@/types/game'
import type { CloudSaveMeta } from '@/types/cloud'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip function properties so the state can be serialised to JSON. */
function serializeState(gameState: GameState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(gameState)) {
    if (typeof value !== 'function') out[key] = value
  }
  return out
}

// Row shape returned by Supabase for our table
interface CloudSaveRow {
  id: string
  local_save_id: string
  save_name: string
  club_id: string
  club_name: string
  manager_name: string
  current_year: number
  current_round: number
  phase: string
  version: string
  schema_version: number
  created_at: string
  last_saved: string
  synced_at: string
  state_json: Record<string, unknown>
}

function rowToMeta(row: CloudSaveRow): CloudSaveMeta {
  return {
    cloudId: row.id,
    localSaveId: row.local_save_id,
    saveName: row.save_name,
    clubId: row.club_id,
    clubName: row.club_name,
    managerName: row.manager_name,
    currentYear: row.current_year,
    currentRound: row.current_round,
    phase: row.phase as CloudSaveMeta['phase'],
    version: row.version,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    lastSaved: row.last_saved,
    syncedAt: row.synced_at,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload (upsert) a full game state to the cloud.
 * Requires the user to be authenticated.
 */
export async function uploadSave(
  gameState: GameState,
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not signed in' }

  const id = gameState.meta.id
  if (!id) return { error: 'Save has no ID' }

  const clubName =
    gameState.clubs[gameState.playerClubId]?.fullName ?? 'Unemployed'

  const { error } = await supabase.from('cloud_saves').upsert(
    {
      user_id: user.id,
      local_save_id: id,
      save_name: gameState.meta.saveName || 'Untitled Save',
      club_id: gameState.playerClubId || '',
      club_name: clubName,
      manager_name: gameState.manager?.name ?? 'Manager',
      current_year: gameState.currentYear,
      current_round: gameState.currentRound,
      phase: gameState.phase,
      version: gameState.meta.version,
      schema_version: gameState.meta.schemaVersion,
      created_at: gameState.meta.createdAt,
      last_saved: gameState.meta.lastSaved || new Date().toISOString(),
      synced_at: new Date().toISOString(),
      state_json: serializeState(gameState),
    },
    { onConflict: 'user_id,local_save_id' },
  )

  return { error: error?.message ?? null }
}

/**
 * List all cloud saves for the currently authenticated user,
 * ordered by last_saved descending.
 */
export async function listCloudSaves(): Promise<{
  data: CloudSaveMeta[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('cloud_saves')
    .select(
      'id,local_save_id,save_name,club_id,club_name,manager_name,' +
        'current_year,current_round,phase,version,schema_version,' +
        'created_at,last_saved,synced_at',
    )
    .order('last_saved', { ascending: false })

  if (error) return { data: [], error: error.message }

  return {
    data: (data as unknown as CloudSaveRow[]).map(rowToMeta),
    error: null,
  }
}

/**
 * Download the full GameState for a specific cloud save by its local save ID.
 */
export async function downloadSave(localSaveId: string): Promise<{
  data: GameState | null
  error: string | null
}> {
  const { data, error } = await supabase
    .from('cloud_saves')
    .select('state_json')
    .eq('local_save_id', localSaveId)
    .single()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'Save not found' }

  return { data: data.state_json as unknown as GameState, error: null }
}

/**
 * Delete a cloud save by its local save ID.
 */
export async function deleteCloudSave(
  localSaveId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('cloud_saves')
    .delete()
    .eq('local_save_id', localSaveId)

  return { error: error?.message ?? null }
}
