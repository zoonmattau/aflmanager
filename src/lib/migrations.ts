/**
 * Save-file migration framework.
 *
 * Usage
 * -----
 * 1. Define a Migration object for each schema-version bump:
 *
 *      { schemaVersion: 2, description: 'Add newField to Player', migrate(state) { … } }
 *
 * 2. Add it to GAME_MIGRATIONS in src/stores/gameStore.ts (keep the array sorted by
 *    schemaVersion ascending).
 *
 * 3. Increment SAVE_SCHEMA_VERSION in src/engine/core/gameVersion.ts.
 *
 * The migrate() function receives the raw save state as a mutable Record<string, unknown>
 * and should modify it in place.  It must be idempotent — it may run on saves that already
 * have the field (e.g. when called from loadState mid-session).
 */

import { SAVE_SCHEMA_VERSION } from '@/engine/core/gameVersion'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Migration {
  /**
   * The schema version this migration produces.
   * The migration runs when: save.schemaVersion < migration.schemaVersion
   */
  schemaVersion: number
  /** One-line description used in console logging. */
  description: string
  /** Mutate state in-place.  Must be idempotent. */
  migrate: (state: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the schema version from a raw save state (0 if the field is absent). */
export function readSchemaVersion(state: Record<string, unknown>): number {
  const meta = state.meta as Record<string, unknown> | undefined
  return typeof meta?.schemaVersion === 'number' ? (meta.schemaVersion as number) : 0
}

/**
 * Returns true if the save can be safely loaded by the running game build.
 * A save is "incompatible" only if it was written by a *newer* build whose schema
 * version exceeds what this build knows about.
 */
export function isSaveCompatible(schemaVersion: number): boolean {
  return schemaVersion <= SAVE_SCHEMA_VERSION
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

/**
 * Run all pending migrations on a raw save state, then stamp the current
 * SAVE_SCHEMA_VERSION into state.meta.schemaVersion.
 *
 * @param state      The mutable save object (top-level GameState as Record).
 * @param migrations Registered migration list (sorted ascending by schemaVersion).
 */
export function runMigrations(
  state: Record<string, unknown>,
  migrations: Migration[],
): void {
  const fromVersion = readSchemaVersion(state)
  const pending = migrations.filter((m) => m.schemaVersion > fromVersion)

  if (pending.length > 0) {
    console.info(
      `[Save Migration] Upgrading schema v${fromVersion} → v${SAVE_SCHEMA_VERSION} ` +
        `(${pending.length} migration${pending.length === 1 ? '' : 's'}):\n` +
        pending.map((m) => `  • v${m.schemaVersion}: ${m.description}`).join('\n'),
    )
  }

  for (const migration of pending) {
    try {
      migration.migrate(state)
    } catch (err) {
      console.error(`[Save Migration] Migration v${migration.schemaVersion} ("${migration.description}") threw:`, err)
      // Continue running subsequent migrations — partial migration is better than none.
    }
  }

  // Stamp updated schema version
  if (!state.meta || typeof state.meta !== 'object') state.meta = {}
  ;(state.meta as Record<string, unknown>).schemaVersion = SAVE_SCHEMA_VERSION
}
