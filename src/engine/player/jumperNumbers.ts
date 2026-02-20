import type { Player } from '@/types/player'

export const MIN_JUMPER_NUMBER = 1
export const MAX_JUMPER_NUMBER = 99

export function isValidJumperNumber(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_JUMPER_NUMBER && value <= MAX_JUMPER_NUMBER
}

export function normalizeJumperNumberInput(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const rounded = Math.trunc(value)
  return isValidJumperNumber(rounded) ? rounded : null
}

export function getUsedJumperNumbers(
  players: Record<string, Player>,
  clubId: string,
  excludePlayerId?: string,
): Set<number> {
  const used = new Set<number>()
  for (const player of Object.values(players)) {
    if (player.clubId !== clubId) continue
    if (excludePlayerId && player.id === excludePlayerId) continue
    if (!isValidJumperNumber(player.jerseyNumber)) continue
    used.add(player.jerseyNumber)
  }
  return used
}

export function findNextAvailableJumperNumber(
  used: Set<number>,
  preferred?: number,
): number {
  if (preferred !== undefined && isValidJumperNumber(preferred) && !used.has(preferred)) {
    return preferred
  }
  for (let number = MIN_JUMPER_NUMBER; number <= MAX_JUMPER_NUMBER; number++) {
    if (!used.has(number)) return number
  }
  return MAX_JUMPER_NUMBER
}

export function upsertPlayerJumperHistory(player: Player, year: number): void {
  if (!player.clubId) return
  const history = player.jumperHistory ?? []
  const newEntry = { year, clubId: player.clubId, jumperNumber: player.jerseyNumber }
  const idx = history.findIndex((entry) => entry.year === year && entry.clubId === player.clubId)
  if (idx !== -1) {
    // Replace the whole array rather than mutating the existing entry, which
    // may be a frozen object from a prior Zustand state snapshot.
    const next = history.slice()
    next[idx] = newEntry
    player.jumperHistory = next
    return
  }
  player.jumperHistory = [...history, newEntry].sort((a, b) => a.year - b.year)
}

export function autoAssignClubJumperNumbers(
  players: Record<string, Player>,
  clubId: string,
  year?: number,
): { changedPlayerIds: string[] } {
  const clubPlayers = Object.values(players)
    .filter((player) => player.clubId === clubId)
    .sort((a, b) => {
      const pickA = a.draftPick ?? 999
      const pickB = b.draftPick ?? 999
      if (pickA !== pickB) return pickA - pickB
      return a.lastName.localeCompare(b.lastName)
    })

  const used = new Set<number>()
  const changedPlayerIds: string[] = []
  const pending: Player[] = []

  for (const player of clubPlayers) {
    if (isValidJumperNumber(player.jerseyNumber) && !used.has(player.jerseyNumber)) {
      used.add(player.jerseyNumber)
      if (year !== undefined) upsertPlayerJumperHistory(player, year)
      continue
    }
    pending.push(player)
  }

  for (const player of pending) {
    const preferred = isValidJumperNumber(player.jerseyNumber) ? player.jerseyNumber : undefined
    const assigned = findNextAvailableJumperNumber(used, preferred)
    if (player.jerseyNumber !== assigned) {
      player.jerseyNumber = assigned
      changedPlayerIds.push(player.id)
    }
    used.add(assigned)
    if (year !== undefined) upsertPlayerJumperHistory(player, year)
  }

  return { changedPlayerIds }
}

export function isJumperNumberAvailable(
  players: Record<string, Player>,
  clubId: string,
  jumperNumber: number,
  excludePlayerId?: string,
): boolean {
  if (!isValidJumperNumber(jumperNumber)) return false
  const used = getUsedJumperNumbers(players, clubId, excludePlayerId)
  return !used.has(jumperNumber)
}
