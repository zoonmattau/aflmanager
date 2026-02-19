import { get, set } from 'idb-keyval'
import type { ModPackage, StoredMod } from '@/types/mod'

const KEY_MODS = 'afl-mods'

export async function getAllMods(): Promise<StoredMod[]> {
  const raw = await get(KEY_MODS)
  return (raw as StoredMod[]) ?? []
}

export async function saveMod(mod: ModPackage): Promise<void> {
  const mods = await getAllMods()
  const idx = mods.findIndex((m) => m.data.id === mod.id)
  if (idx >= 0) {
    mods[idx]!.data = mod
  } else {
    mods.push({ data: mod, active: false })
  }
  await set(KEY_MODS, mods)
}

export async function deleteMod(id: string): Promise<void> {
  const mods = await getAllMods()
  await set(KEY_MODS, mods.filter((m) => m.data.id !== id))
}

export async function setModActive(id: string, active: boolean): Promise<void> {
  const mods = await getAllMods()
  const idx = mods.findIndex((m) => m.data.id === id)
  if (idx >= 0) {
    mods[idx]!.active = active
    await set(KEY_MODS, mods)
  }
}

export async function getActiveMods(): Promise<ModPackage[]> {
  const mods = await getAllMods()
  return mods.filter((m) => m.active).map((m) => m.data)
}
