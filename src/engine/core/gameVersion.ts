/**
 * Central version constants for AFL Manager.
 *
 * GAME_VERSION   – Human-readable display version shown in the UI and saved in GameMeta.version.
 *                  Bump this with every meaningful release (following semver loosely).
 *
 * SAVE_SCHEMA_VERSION – Integer that increments whenever the shape of GameState changes in a way
 *                       that requires a migration step.  When adding a new migration:
 *                         1. Increment SAVE_SCHEMA_VERSION.
 *                         2. Add a Migration entry to GAME_MIGRATIONS in gameStore.ts.
 *                       Rules:
 *                         • Increment for: adding/removing/renaming any field in GameState or its
 *                           nested types (Settings, Player, Club, …).
 *                         • Do NOT increment for: pure engine-logic changes, balance tweaks,
 *                           bug fixes, UI changes that carry no state.
 *                       Compatibility:
 *                         • save.schemaVersion < SAVE_SCHEMA_VERSION → migrations run to bring it up
 *                         • save.schemaVersion > SAVE_SCHEMA_VERSION → future-version save; the game
 *                           logs a warning and loads anyway (best-effort forward compat)
 *                         • save.schemaVersion missing / 0             → pre-versioning save; all
 *                           migrations run
 */

/** Human-readable game version shown in the UI (e.g. About page, save list). */
export const GAME_VERSION = '0.5.0'

/**
 * Save-file schema version.  Increment when GameState shape changes.
 *
 * History:
 *   0  – All saves created before versioning was introduced (implicit baseline).
 *   1  – Initial versioned baseline: nested GameSettings, full RealismSettings,
 *         calendar, state leagues, manager career, contract/injury fields, scouts,
 *         shortlists, board instability, records book, inflation, difficulty scaling
 *         scalars (injuryScale, tradeAggressiveness, etc.).
 *   2  – Add `achievements` and `careerObjectives` arrays to GameState.
 *   3  – Add `aiTacticalLearning` to GameState (multi-season AI tactical history).
 *   4  – Add `matchReports` array to GameHistory.
 *   5  – Add `agentRelationships` to GameState and `agentId` to Player.
 *   6  – Add `slot` + `satisfaction` to SponsorshipDeal; seed empty `sponsorshipOffers`.
 */
export const SAVE_SCHEMA_VERSION = 6
