/**
 * momentEngine.ts
 *
 * Detects and creates PlayerMoment records for career-defining events.
 * Called after each round (regular + finals) and after season awards.
 *
 * Design contract:
 *  - Detection is PURE — takes snapshots and post-round state, returns new moments.
 *  - Caller is responsible for mutating player.moments[] in the store.
 *  - "First" events use pre-round snapshot flags to avoid duplicates.
 */

import type { Player, PlayerMoment, PlayerMomentType } from '@/types/player'
import type { Match, MatchPlayerStats } from '@/types/match'

// ---------------------------------------------------------------------------
// Pre-round snapshot
// ---------------------------------------------------------------------------

export interface PreRoundMomentSnapshot {
  gamesPlayed: number
  goals: number
  hasDebut: boolean
  hasFirstGoal: boolean
  hasFirstBog: boolean
  /** Year of most recent 'breakout-game' moment (0 = never) */
  latestBreakoutYear: number
}

/** Build a snapshot of moment-relevant state for every player before a round. */
export function buildPreRoundMomentSnapshot(
  players: Record<string, Player>,
): Record<string, PreRoundMomentSnapshot> {
  const snap: Record<string, PreRoundMomentSnapshot> = {}
  for (const player of Object.values(players)) {
    const existing = player.moments ?? []
    snap[player.id] = {
      gamesPlayed: player.careerStats.gamesPlayed,
      goals: player.careerStats.goals,
      hasDebut: existing.some((m) => m.type === 'debut'),
      hasFirstGoal: existing.some((m) => m.type === 'first-goal'),
      hasFirstBog: existing.some((m) => m.type === 'first-bog'),
      latestBreakoutYear: existing
        .filter((m) => m.type === 'breakout-game')
        .reduce((max, m) => Math.max(max, m.year), 0),
    }
  }
  return snap
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findPlayerMatchStats(
  playerId: string,
  matches: Match[],
): { stats: MatchPlayerStats; match: Match } | null {
  for (const match of matches) {
    if (!match.result) continue
    const stat =
      match.result.homePlayerStats.find((s) => s.playerId === playerId) ??
      match.result.awayPlayerStats.find((s) => s.playerId === playerId)
    if (stat && stat.participated) return { stats: stat, match }
  }
  return null
}

function makeMoment(
  type: PlayerMomentType,
  date: string,
  year: number,
  round: number,
  isFinal: boolean,
  title: string,
  description: string,
  extras: Partial<Pick<PlayerMoment, 'stats' | 'value' | 'opponentClubId'>> = {},
): PlayerMoment {
  return {
    id: crypto.randomUUID(),
    type,
    date,
    year,
    round,
    isFinal,
    title,
    description,
    ...extras,
  }
}

// Game thresholds that generate milestone moments
const GAME_MILESTONES = [50, 100, 150, 200, 250, 300, 350, 400]
const GOAL_MILESTONES = [50, 100, 150, 200, 300, 400, 500]

// ---------------------------------------------------------------------------
// Main detection function — run after each round
// ---------------------------------------------------------------------------

/**
 * Detect new moments for every player in a round.
 *
 * @param preSnapshots  - Per-player snapshot taken BEFORE the round.
 * @param players       - Post-round player state.
 * @param matches       - Matches played this round.
 * @param year          - Current season year.
 * @param round         - Round number (integer, 1-based from season).
 * @param date          - ISO date string.
 * @param isFinals      - Whether this is a finals round.
 * @param premiersClubId - Set when the GF has just been won.
 */
export function detectPlayerMoments(
  preSnapshots: Record<string, PreRoundMomentSnapshot>,
  players: Record<string, Player>,
  matches: Match[],
  year: number,
  round: number,
  date: string,
  isFinals: boolean,
  premiersClubId?: string,
): Record<string, PlayerMoment[]> {
  const result: Record<string, PlayerMoment[]> = {}

  for (const player of Object.values(players)) {
    const snap = preSnapshots[player.id]
    if (!snap) continue

    const moments: PlayerMoment[] = []

    // Find this player's match stats (null if benched/not selected)
    const matchInfo = findPlayerMatchStats(player.id, matches)

    if (matchInfo) {
      const { stats, match } = matchInfo
      const opponentClubId =
        match.homeClubId === player.clubId ? match.awayClubId : match.homeClubId

      const afterGames = player.careerStats.gamesPlayed
      const afterGoals = player.careerStats.goals
      const rating = stats.matchRating ?? 0

      const statSnap = {
        disposals: stats.disposals,
        goals: stats.goals,
        marks: stats.marks,
        tackles: stats.tackles,
        hitouts: stats.hitouts > 0 ? stats.hitouts : undefined,
        matchRating: rating > 0 ? rating : undefined,
        aflFantasyPoints: stats.aflFantasyPoints > 0 ? stats.aflFantasyPoints : undefined,
      }

      // ── DEBUT ─────────────────────────────────────────────────────────────
      if (!snap.hasDebut && snap.gamesPlayed === 0 && afterGames >= 1) {
        moments.push(
          makeMoment(
            'debut',
            date, year, round, isFinals,
            'AFL Debut',
            `${player.firstName} ${player.lastName} played their first senior AFL game.`,
            { stats: statSnap, opponentClubId },
          ),
        )
      }

      // ── FIRST GOAL ────────────────────────────────────────────────────────
      if (!snap.hasFirstGoal && snap.goals === 0 && afterGoals >= 1 && stats.goals >= 1) {
        moments.push(
          makeMoment(
            'first-goal',
            date, year, round, isFinals,
            'First Career Goal',
            `${player.firstName} ${player.lastName} kicked their first AFL goal.`,
            { stats: statSnap, opponentClubId },
          ),
        )
      }

      // ── GAMES MILESTONES ──────────────────────────────────────────────────
      for (const threshold of GAME_MILESTONES) {
        if (snap.gamesPlayed < threshold && afterGames >= threshold) {
          moments.push(
            makeMoment(
              'milestone-games',
              date, year, round, isFinals,
              `${threshold}-Game Milestone`,
              `${player.firstName} ${player.lastName} played their ${threshold}th AFL game.`,
              { stats: statSnap, value: threshold, opponentClubId },
            ),
          )
        }
      }

      // ── GOALS MILESTONES ──────────────────────────────────────────────────
      for (const threshold of GOAL_MILESTONES) {
        if (snap.goals < threshold && afterGoals >= threshold) {
          moments.push(
            makeMoment(
              'milestone-goals',
              date, year, round, isFinals,
              `${threshold} Career Goals`,
              `${player.firstName} ${player.lastName} booted their ${threshold}th career goal.`,
              { stats: statSnap, value: threshold, opponentClubId },
            ),
          )
        }
      }

      // ── FIRST BOG ─────────────────────────────────────────────────────────
      if (!snap.hasFirstBog && rating >= 9.0) {
        moments.push(
          makeMoment(
            'first-bog',
            date, year, round, isFinals,
            'First Best-on-Ground',
            `${player.firstName} ${player.lastName} delivered a career-best performance, rated ${rating.toFixed(1)}.`,
            { stats: statSnap, opponentClubId },
          ),
        )
      }

      // ── BREAKOUT GAME (subsequent exceptional games, ≤ one per season) ────
      if (snap.hasFirstBog && rating >= 9.2 && snap.latestBreakoutYear < year) {
        moments.push(
          makeMoment(
            'breakout-game',
            date, year, round, isFinals,
            'Standout Performance',
            `${player.firstName} ${player.lastName} was outstanding, rated ${rating.toFixed(1)}.`,
            { stats: statSnap, opponentClubId },
          ),
        )
      }

      // ── FINALS HERO ───────────────────────────────────────────────────────
      if (isFinals && rating >= 8.5) {
        moments.push(
          makeMoment(
            'finals-hero',
            date, year, round, true,
            'Finals Hero',
            `${player.firstName} ${player.lastName} delivered when it counted most, rated ${rating.toFixed(1)}.`,
            { stats: statSnap, opponentClubId },
          ),
        )
      }

      // ── MAJOR INJURY ──────────────────────────────────────────────────────
      if (
        player.injury &&
        (player.injury.weeksRemaining >= 8 || player.injury.severity === 'severe')
      ) {
        // Guard: only record once per date (injury might already be in moments)
        const alreadyRecorded = (player.moments ?? []).some(
          (m) => m.type === 'major-injury' && m.date === date,
        )
        if (!alreadyRecorded) {
          moments.push(
            makeMoment(
              'major-injury',
              date, year, round, isFinals,
              'Season-Ending Injury',
              `${player.firstName} ${player.lastName} suffered a ${player.injury.type} — expected to miss ${player.injury.weeksRemaining} weeks.`,
              { value: player.injury.weeksRemaining },
            ),
          )
        }
      }
    }

    // ── PREMIERSHIP (no match stats required) ─────────────────────────────
    if (premiersClubId && player.clubId === premiersClubId) {
      const alreadyRecorded = (player.moments ?? []).some(
        (m) => m.type === 'premiership' && m.year === year,
      )
      if (!alreadyRecorded) {
        moments.push(
          makeMoment(
            'premiership',
            date, year, round, true,
            'Premiership Winner',
            `${player.firstName} ${player.lastName} celebrated as part of the ${year} premiership team.`,
          ),
        )
      }
    }

    if (moments.length > 0) result[player.id] = moments
  }

  return result
}

// ---------------------------------------------------------------------------
// Award moments — called once after season awards are finalised
// ---------------------------------------------------------------------------

export interface AwardMomentInput {
  playerId: string
  playerName: string
  type: PlayerMomentType
  title: string
  description: string
  value?: number
  date: string
  year: number
}

/** Build an AwardMomentInput for each award winner to be applied to player.moments. */
export function buildAwardMoments(awards: AwardMomentInput[]): Record<string, PlayerMoment> {
  const result: Record<string, PlayerMoment> = {}
  for (const aw of awards) {
    result[aw.playerId] = {
      id: crypto.randomUUID(),
      type: aw.type,
      date: aw.date,
      year: aw.year,
      round: -1,
      isFinal: false,
      title: aw.title,
      description: aw.description,
      value: aw.value,
    }
  }
  return result
}
