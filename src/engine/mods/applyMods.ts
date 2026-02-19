import type { GameState } from '@/types/game'
import type { ModPackage, ClubMod, RosterMod, DraftClassMod, SettingsMod } from '@/types/mod'

function applyClubMod(state: GameState, mod: ClubMod): void {
  for (const entry of mod.clubs) {
    const club = state.clubs[entry.id]
    if (!club) continue

    if (entry.name !== undefined) club.name = entry.name
    if (entry.fullName !== undefined) club.fullName = entry.fullName
    if (entry.abbreviation !== undefined) club.abbreviation = entry.abbreviation
    if (entry.mascot !== undefined) club.mascot = entry.mascot
    if (entry.homeGround !== undefined) club.homeGround = entry.homeGround
    if (entry.logoUrl !== undefined) club.logoUrl = entry.logoUrl
    if (entry.tacticalIdentity !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      club.tacticalIdentity = entry.tacticalIdentity as any
    }

    if (entry.colors !== undefined) {
      if (entry.colors.primary !== undefined) club.colors.primary = entry.colors.primary
      if (entry.colors.secondary !== undefined) club.colors.secondary = entry.colors.secondary
      if (entry.colors.tertiary !== undefined) club.colors.tertiary = entry.colors.tertiary
    }

    if (entry.guernseyStyle !== undefined) {
      club.guernseyStyle = entry.guernseyStyle
    }

    if (entry.facilities !== undefined) {
      Object.assign(club.facilities, entry.facilities)
    }

    if (entry.aiPersonality !== undefined && club.aiPersonality) {
      Object.assign(club.aiPersonality, entry.aiPersonality)
    }

    if (entry.gameplan !== undefined) {
      Object.assign(club.gameplan, entry.gameplan)
    }
  }
}

function applyRosterMod(state: GameState, mod: RosterMod): void {
  // Remove existing players for this club
  for (const [id, player] of Object.entries(state.players)) {
    if (player.clubId === mod.clubId) {
      delete state.players[id]
    }
  }

  // Add mod players
  for (const player of mod.players) {
    state.players[player.id] = { ...player, clubId: mod.clubId }
  }
}

function applyDraftClassMod(state: GameState, mod: DraftClassMod): void {
  if (!state.draft) return
  state.draft.prospects = [...mod.prospects]
}

function applySettingsMod(state: GameState, mod: SettingsMod): void {
  Object.assign(state.settings, mod.settings)
}

/**
 * Apply a list of active mods to the game state (mutates in place — call inside Immer produce).
 */
export function applyMods(state: GameState, mods: ModPackage[]): void {
  for (const mod of mods) {
    if (mod.type === 'club') {
      applyClubMod(state, mod)
    } else if (mod.type === 'roster') {
      applyRosterMod(state, mod)
    } else if (mod.type === 'draft-class') {
      applyDraftClassMod(state, mod)
    } else if (mod.type === 'settings') {
      applySettingsMod(state, mod)
    }
  }
}
