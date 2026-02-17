import type { GameSettings } from './game'

export interface LeaguePreset {
  id: string
  name: string
  description: string
  createdAt: string   // ISO timestamp
  lastModified: string // ISO timestamp
  settings: GameSettings
  isBuiltIn: boolean
}
