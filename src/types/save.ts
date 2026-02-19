import type { GamePhase } from './game'

export type CheckpointType = 'autosave' | 'manual'

export interface CheckpointMeta {
  id: string
  gameId: string
  label: string
  type: CheckpointType
  currentYear: number
  currentRound: number
  phase: GamePhase
  savedAt: string     // ISO timestamp
  version: string
  schemaVersion: number
}

export interface SaveSlotMeta {
  id: string
  saveName: string
  clubId: string
  clubName: string
  managerName: string
  currentYear: number
  currentRound: number
  phase: GamePhase
  createdAt: string   // ISO timestamp
  lastSaved: string   // ISO timestamp
  version: string
  schemaVersion: number
}

export interface SaveIndex {
  saves: SaveSlotMeta[]
  lastPlayedSaveId: string | null
  checkpoints: Record<string, CheckpointMeta[]>
}
