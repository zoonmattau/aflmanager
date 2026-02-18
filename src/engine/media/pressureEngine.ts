/**
 * Media Pressure Engine
 *
 * Tracks a club-level media pressure score (0-100) that rises with bad events
 * (losing streaks, blowout losses, controversial trades, player unrest) and
 * decays naturally over time. High pressure applies per-round morale penalties
 * to all players at the club.
 */

import type { MediaPressure, MediaPressureStory, PressureStoryType } from '@/types/club'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Natural pressure decay per round. */
export const PRESSURE_DECAY_PER_ROUND = 5

/** Extra decay applied on a win. */
export const PRESSURE_WIN_BONUS_DECAY = 5

/** Maximum number of active stories to retain. */
const MAX_ACTIVE_STORIES = 8

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function sumStoryPoints(stories: MediaPressureStory[]): number {
  return stories.reduce((sum, s) => sum + s.points, 0)
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initMediaPressure(): MediaPressure {
  return { score: 0, lastScore: 0, activeStories: [] }
}

// ---------------------------------------------------------------------------
// Labels & display
// ---------------------------------------------------------------------------

export type PressureLabel = 'Calm' | 'Watchful' | 'Elevated' | 'Critical'

export function getMediaPressureLabel(score: number): PressureLabel {
  if (score <= 25) return 'Calm'
  if (score <= 50) return 'Watchful'
  if (score <= 75) return 'Elevated'
  return 'Critical'
}

export function getPressureLabelColor(label: PressureLabel): string {
  switch (label) {
    case 'Calm':     return 'text-green-600 dark:text-green-400'
    case 'Watchful': return 'text-yellow-600 dark:text-yellow-400'
    case 'Elevated': return 'text-orange-600 dark:text-orange-400'
    case 'Critical': return 'text-red-600 dark:text-red-400'
  }
}

export function getPressureBarColor(label: PressureLabel): string {
  switch (label) {
    case 'Calm':     return 'bg-green-500'
    case 'Watchful': return 'bg-yellow-500'
    case 'Elevated': return 'bg-orange-500'
    case 'Critical': return 'bg-red-500'
  }
}

/** Returns the morale delta (≤0) applied per round per player at this pressure level. */
export function getMediaPressureMoraleEffect(score: number): number {
  if (score <= 25) return 0
  if (score <= 50) return -1
  if (score <= 75) return -2
  return -3
}

/** Returns the trend indicator based on score vs lastScore. */
export function getPressureTrend(pressure: MediaPressure): 'rising' | 'stable' | 'falling' {
  const diff = pressure.score - pressure.lastScore
  if (diff > 3) return 'rising'
  if (diff < -3) return 'falling'
  return 'stable'
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

/**
 * Apply natural decay to pressure and remove expired stories.
 * Call this at the start of each round update before adding new stories.
 */
export function applyPressureDecay(
  pressure: MediaPressure,
  currentRound: number,
  won: boolean,
): MediaPressure {
  const decay = PRESSURE_DECAY_PER_ROUND + (won ? PRESSURE_WIN_BONUS_DECAY : 0)

  // Remove expired stories
  const remaining = pressure.activeStories.filter((s) => s.expiresRound > currentRound)

  // Recompute score from remaining stories minus decay
  const rawScore = sumStoryPoints(remaining) - decay
  const newScore = clamp(rawScore, 0, 100)

  return {
    score: newScore,
    lastScore: pressure.score,
    activeStories: remaining,
  }
}

// ---------------------------------------------------------------------------
// Story generation
// ---------------------------------------------------------------------------

/** Expiry round offsets by severity. */
const EXPIRY_BY_SEVERITY: Record<MediaPressureStory['severity'], number> = {
  minor:    2,
  moderate: 4,
  major:    6,
}

function makeStory(
  type: PressureStoryType,
  headline: string,
  severity: MediaPressureStory['severity'],
  points: number,
  currentRound: number,
): MediaPressureStory {
  return {
    id: crypto.randomUUID(),
    type,
    headline,
    severity,
    points,
    expiresRound: currentRound + EXPIRY_BY_SEVERITY[severity],
  }
}

/**
 * Generate pressure stories from a completed round's match result for the player's club.
 *
 * @param matchResult  Won/draw/scoreDiff for the player's club this round, or null if bye.
 * @param recentResults  Last 6 results, oldest first (W/L/D).
 * @param clubName  Name of the player's club.
 * @param currentRound  The round just completed.
 */
export function generateRoundPressureStories(
  matchResult: { won: boolean; draw: boolean; scoreDiff: number } | null,
  recentResults: Array<'W' | 'L' | 'D'>,
  clubName: string,
  currentRound: number,
): MediaPressureStory[] {
  const stories: MediaPressureStory[] = []

  if (!matchResult) return stories // bye round

  const { won, draw, scoreDiff } = matchResult

  // -- Blowout loss (margin ≥ 50 points) --
  if (!won && !draw && scoreDiff <= -50) {
    stories.push(makeStory(
      'blowout-loss',
      `${clubName} suffer embarrassing ${Math.abs(scoreDiff)}-point blowout defeat`,
      'major',
      20,
      currentRound,
    ))
  }

  // -- Consecutive losses check --
  // recentResults already includes this round
  const allRecent = recentResults
  const consecutiveLosses = [...allRecent].reverse().findIndex((r) => r !== 'L')
  const streak = consecutiveLosses === -1 ? allRecent.length : consecutiveLosses

  if (streak >= 5) {
    stories.push(makeStory(
      'losing-streak',
      `${clubName} extend losing run to ${streak} games — pressure mounts on coach`,
      'major',
      25,
      currentRound,
    ))
  } else if (streak === 3 || streak === 4) {
    stories.push(makeStory(
      'losing-streak',
      `${clubName} lose ${streak} in a row — fans growing restless`,
      'moderate',
      15,
      currentRound,
    ))
  }

  return stories
}

/**
 * Generate a pressure story when a trade involving the player's club completes.
 *
 * @param playerOverall  Overall rating of the highest-rated player in the trade.
 * @param playerName  Name of that player (for headline).
 * @param playerLeft  True if this player left the club (loss), false if they arrived.
 * @param currentRound  Current round.
 */
export function generateTradePressureStory(
  playerOverall: number,
  playerName: string,
  playerLeft: boolean,
  currentRound: number,
): MediaPressureStory | null {
  // Only generate pressure for notable trades (overall ≥ 65)
  if (playerOverall < 65) return null

  if (playerLeft) {
    if (playerOverall >= 78) {
      return makeStory(
        'controversial-trade',
        `Fans outraged as ${playerName} traded away — 'robbery' claims circulate`,
        'major',
        22,
        currentRound,
      )
    }
    if (playerOverall >= 65) {
      return makeStory(
        'controversial-trade',
        `${playerName} trade divides fans — questions about club direction`,
        'moderate',
        12,
        currentRound,
      )
    }
  }
  // Player arrived — lower pressure unless the cost was high (we can't judge that easily here)
  // Only minor pressure for an arrival
  return null
}

/**
 * Generate a pressure story when a key player (morale < 35) becomes public knowledge.
 */
export function generatePlayerUnrestPressureStory(
  playerName: string,
  currentRound: number,
): MediaPressureStory {
  return makeStory(
    'player-unrest',
    `${playerName} reportedly seeking trade — locker room concerns grow`,
    'moderate',
    12,
    currentRound,
  )
}

// ---------------------------------------------------------------------------
// Full update
// ---------------------------------------------------------------------------

/**
 * Apply decay and add new stories, returning an updated pressure object.
 * The score is the sum of active story points clamped to [0, 100].
 */
export function updateMediaPressure(
  current: MediaPressure | undefined,
  newStories: MediaPressureStory[],
  currentRound: number,
  won: boolean,
): MediaPressure {
  const base = current ?? initMediaPressure()

  // 1. Decay existing pressure
  const decayed = applyPressureDecay(base, currentRound, won)

  // 2. Add new stories (keep only the most recent MAX_ACTIVE_STORIES)
  const combined = [...decayed.activeStories, ...newStories]
  const pruned = combined.slice(-MAX_ACTIVE_STORIES)

  // 3. Recompute score from all active story points
  const rawScore = sumStoryPoints(pruned)
  const newScore = clamp(rawScore, 0, 100)

  return {
    score: newScore,
    lastScore: decayed.score,
    activeStories: pruned,
  }
}
