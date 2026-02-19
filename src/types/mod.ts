import type { Club, ClubGameplan } from './club'
import type { Player } from './player'
import type { DraftProspect } from './draft'
import type { GameSettings } from './game'

export type ModType = 'club' | 'roster' | 'draft-class' | 'settings'

export interface ModMeta {
  id: string
  name: string
  description: string
  author?: string
  createdAt: string
  modVersion: string       // mod format version, e.g. '1.0'
  gameVersionTarget?: string
}

// Club mod — partial overrides for one or more clubs
export interface ClubModEntry {
  id: string               // must match existing club id
  name?: string
  fullName?: string
  abbreviation?: string
  mascot?: string
  colors?: { primary: string; secondary?: string; tertiary?: string }
  logoUrl?: string         // base64 data URI or public URL
  homeGround?: string
  guernseyStyle?: Club['guernseyStyle']
  facilities?: Partial<Club['facilities']>
  aiPersonality?: Partial<Club['aiPersonality']>
  gameplan?: Partial<ClubGameplan>
  tacticalIdentity?: string
  notes?: string
}

export interface ClubMod extends ModMeta {
  type: 'club'
  clubs: ClubModEntry[]
}

// Roster mod — full players list for one club
export interface RosterMod extends ModMeta {
  type: 'roster'
  clubId: string
  players: Player[]
}

// Draft class mod — custom prospect pool
export interface DraftClassMod extends ModMeta {
  type: 'draft-class'
  targetYear?: number
  prospects: DraftProspect[]
}

// Settings mod — partial GameSettings override
export interface SettingsMod extends ModMeta {
  type: 'settings'
  settings: Partial<GameSettings>
}

export type ModPackage = ClubMod | RosterMod | DraftClassMod | SettingsMod

// Stored in IndexedDB
export interface StoredMod {
  data: ModPackage
  active: boolean
}
