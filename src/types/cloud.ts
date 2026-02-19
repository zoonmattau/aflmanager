import type { GamePhase } from './game'

/**
 * Metadata about a cloud-saved game (mirrors SaveSlotMeta + sync info).
 * This is what we get back from the cloud_saves table without parsing state_json.
 */
export interface CloudSaveMeta {
  /** cloud_saves.id (Supabase UUID) */
  cloudId: string
  /** cloud_saves.local_save_id – matches SaveSlotMeta.id on the originating device */
  localSaveId: string
  saveName: string
  clubId: string
  clubName: string
  managerName: string
  currentYear: number
  currentRound: number
  phase: GamePhase
  version: string
  schemaVersion: number
  createdAt: string    // ISO
  lastSaved: string    // ISO (game-time; what the player last saved)
  syncedAt: string     // ISO (when this was last uploaded to the cloud)
}

/** Status of the most-recent cloud upload attempt for the current session */
export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

export interface CloudSyncState {
  status: CloudSyncStatus
  lastSyncedAt: string | null   // ISO
  lastError: string | null
}
