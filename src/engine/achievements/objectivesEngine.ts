import type { GameState } from '@/types/game'
import type { CareerObjective, CareerObjectiveScope } from '@/types/achievements'
import type { SeededRNG } from '@/engine/core/rng'
import { getOverallRating } from '@/engine/player/playerRating'

// ---------------------------------------------------------------------------
// Objective pool definitions
// ---------------------------------------------------------------------------

interface ObjectiveTemplate {
  type: string
  scope: CareerObjectiveScope
  title: string
  description: string
  targetValue: number
  /** expiresYear offset from assignedYear. undefined = end of current season. */
  expiresOffset?: number
}

function buildTemplates(state: GameState): ObjectiveTemplate[] {
  const { ladder, settings } = state
  const teamCount = Object.keys(state.clubs).length
  // Current ladder position of user's club
  const myPos = ladder.findIndex((e) => e.clubId === state.playerClubId)
  const currentPos = myPos >= 0 ? myPos + 1 : Math.ceil(teamCount / 2)

  return [
    // ---- Season objectives ----
    {
      type: 'finish-top-4',
      scope: 'season',
      title: 'Finish Top 4',
      description: 'End the regular season inside the top 4 on the ladder.',
      targetValue: 4,
    },
    {
      type: 'finish-top-8',
      scope: 'season',
      title: 'Make the Finals',
      description: 'End the regular season inside the top 8 (qualify for finals).',
      targetValue: 8,
    },
    {
      type: 'win-streak-3',
      scope: 'season',
      title: 'Win 3 in a Row',
      description: 'Win 3 consecutive matches in a single season.',
      targetValue: 3,
    },
    {
      type: 'win-streak-5',
      scope: 'season',
      title: 'Win 5 in a Row',
      description: 'Win 5 consecutive matches in a single season.',
      targetValue: 5,
    },
    {
      type: 'win-15-games',
      scope: 'season',
      title: 'Win 15 Games',
      description: `Win ${settings.seasonStructure.regularSeasonRounds >= 20 ? 15 : 12} regular season games.`,
      targetValue: settings.seasonStructure.regularSeasonRounds >= 20 ? 15 : 12,
    },
    {
      type: 'win-2-finals',
      scope: 'season',
      title: 'Win 2 Finals',
      description: 'Win at least 2 finals matches this season.',
      targetValue: 2,
    },
    {
      type: 'improve-ladder-position',
      scope: 'season',
      title: 'Improve Ladder Position',
      description: `Finish higher than position ${currentPos} on the ladder.`,
      targetValue: Math.max(1, currentPos - 2),
    },

    // ---- Multi-season objectives ----
    {
      type: 'develop-85-player',
      scope: 'multi-season',
      title: 'Develop an Elite Player',
      description: 'Have a player at your club reach 85+ overall rating.',
      targetValue: 85,
      expiresOffset: 3,
    },
    {
      type: 'win-premiership',
      scope: 'multi-season',
      title: 'Win the Premiership',
      description: 'Win the Premiership flag.',
      targetValue: 1,
      expiresOffset: 3,
    },
    {
      type: 'top-4-streak',
      scope: 'multi-season',
      title: 'Consecutive Top-4 Finishes',
      description: 'Finish in the top 4 for 2 consecutive seasons.',
      targetValue: 2,
      expiresOffset: 3,
    },
    {
      type: 'upgrade-facility',
      scope: 'multi-season',
      title: 'Upgrade a Facility',
      description: 'Upgrade any facility to level 4 or higher.',
      targetValue: 4,
      expiresOffset: 2,
    },
    {
      type: 'draft-star-50',
      scope: 'multi-season',
      title: 'Draft a Future Star',
      description: 'Have a player you drafted play 50 or more career games.',
      targetValue: 50,
      expiresOffset: 4,
    },
  ]
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function generateSeasonObjectives(state: GameState, rng: SeededRNG): CareerObjective[] {
  const templates = buildTemplates(state)
  const year = state.currentYear

  const seasonTemplates = templates.filter((t) => t.scope === 'season')
  const multiTemplates = templates.filter((t) => t.scope === 'multi-season')

  // Pick 2–3 season objectives
  const seasonPicks = rng.shuffle([...seasonTemplates]).slice(0, rng.nextInt(2, 3))
  // Pick 1–2 multi-season objectives
  const multiPicks = rng.shuffle([...multiTemplates]).slice(0, rng.nextInt(1, 2))

  const all = [...seasonPicks, ...multiPicks]

  return all.map((t) => ({
    id: crypto.randomUUID(),
    type: t.type,
    title: t.title,
    description: t.description,
    scope: t.scope,
    assignedYear: year,
    expiresYear: t.scope === 'multi-season' && t.expiresOffset != null
      ? year + t.expiresOffset
      : undefined,
    targetValue: t.targetValue,
    currentValue: 0,
    status: 'active' as const,
  }))
}

// ---------------------------------------------------------------------------
// Progress updates
// ---------------------------------------------------------------------------

export function updateObjectiveProgress(
  objectives: CareerObjective[],
  state: GameState,
): CareerObjective[] {
  return objectives.map((obj) => {
    if (obj.status !== 'active') return obj

    const value = computeCurrentValue(obj, state)
    const completed = value >= obj.targetValue

    return {
      ...obj,
      currentValue: value,
      status: completed ? 'completed' : 'active',
      completedYear: completed && obj.completedYear == null ? state.currentYear : obj.completedYear,
    }
  })
}

function computeCurrentValue(obj: CareerObjective, state: GameState): number {
  const { playerClubId, matchResults, ladder, history, players, clubs } = state

  switch (obj.type) {
    case 'finish-top-4':
    case 'finish-top-8':
    case 'improve-ladder-position': {
      const pos = ladder.findIndex((e) => e.clubId === playerClubId)
      // For "finish top N": progress = how close they are (return position, lower = better)
      // We map this so that currentValue = targetValue when they reach the target position
      if (pos < 0) return 0
      const myRank = pos + 1
      // If they're at or better than target, return targetValue (= 100% complete)
      return myRank <= obj.targetValue ? obj.targetValue : Math.max(0, obj.targetValue - myRank + obj.targetValue)
    }

    case 'win-streak-3':
    case 'win-streak-5': {
      // Find longest win streak in current season results
      const clubMatches = matchResults
        .filter((m) => !m.isFinal && m.result != null && (m.homeClubId === playerClubId || m.awayClubId === playerClubId))
        .sort((a, b) => a.round - b.round)

      let maxStreak = 0
      let curStreak = 0
      for (const m of clubMatches) {
        const won =
          (m.homeClubId === playerClubId && m.result!.homeTotalScore > m.result!.awayTotalScore) ||
          (m.awayClubId === playerClubId && m.result!.awayTotalScore > m.result!.homeTotalScore)
        if (won) {
          curStreak++
          maxStreak = Math.max(maxStreak, curStreak)
        } else {
          curStreak = 0
        }
      }
      return Math.min(maxStreak, obj.targetValue)
    }

    case 'win-15-games': {
      const wins = matchResults.filter(
        (m) =>
          !m.isFinal &&
          m.result != null &&
          ((m.homeClubId === playerClubId && m.result.homeTotalScore > m.result.awayTotalScore) ||
            (m.awayClubId === playerClubId && m.result.awayTotalScore > m.result.homeTotalScore)),
      ).length
      return Math.min(wins, obj.targetValue)
    }

    case 'win-2-finals': {
      const finalWins = matchResults.filter(
        (m) =>
          m.isFinal &&
          m.result != null &&
          ((m.homeClubId === playerClubId && m.result.homeTotalScore > m.result.awayTotalScore) ||
            (m.awayClubId === playerClubId && m.result.awayTotalScore > m.result.homeTotalScore)),
      ).length
      return Math.min(finalWins, obj.targetValue)
    }

    case 'develop-85-player': {
      const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
      const maxOvr = clubPlayers.reduce((max, p) => Math.max(max, getOverallRating(p)), 0)
      return Math.min(maxOvr, obj.targetValue)
    }

    case 'win-premiership': {
      const seasons = history.seasons ?? []
      const won = seasons.some((s) => s.premierClubId === playerClubId)
      return won ? 1 : 0
    }

    case 'top-4-streak': {
      const seasons = history.seasons ?? []
      // Count consecutive top-4 finishes at the end of history
      let streak = 0
      for (let i = seasons.length - 1; i >= 0; i--) {
        if (seasons[i]!.ladderTopFour?.includes(playerClubId)) {
          streak++
        } else {
          break
        }
      }
      return Math.min(streak, obj.targetValue)
    }

    case 'upgrade-facility': {
      const club = clubs[playerClubId]
      if (!club) return 0
      const facs = club.facilities
      const maxLevel = Math.max(
        facs.trainingGround,
        facs.gym,
        facs.medicalCentre,
        facs.recoveryPool,
        facs.youthAcademy,
        facs.analysisSuite,
      )
      return Math.min(maxLevel, obj.targetValue)
    }

    case 'draft-star-50': {
      const draftHistory = history.draftHistory ?? []
      const userDraftedIds = new Set(
        draftHistory.filter((d) => d.clubId === playerClubId).map((d) => d.playerId),
      )
      const maxGames = Object.values(players)
        .filter((p) => userDraftedIds.has(p.id))
        .reduce((max, p) => Math.max(max, p.careerStats.gamesPlayed), 0)
      return Math.min(maxGames, obj.targetValue)
    }

    default:
      return obj.currentValue
  }
}
