import type { GamePhase } from './game'

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
}

export interface SaveIndex {
  saves: SaveSlotMeta[]
  lastPlayedSaveId: string | null
}
