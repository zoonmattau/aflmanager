import { getDynastyStats } from '@/engine/history/historyEngine'
import { getOverallRating } from '@/engine/player/playerRating'
import type { GameState, NewsItem } from '@/types/game'
import type { CareerObjective } from '@/types/achievements'

// ---------------------------------------------------------------------------
// Quest type registry
// ---------------------------------------------------------------------------

export const DYNASTY_QUEST_TYPES = [
  'three-peat',
  'finals-streak',
  'brownlow-factory',
  'draft-legacy',
  'top4-dynasty',
] as const

export type DynastyQuestType = (typeof DYNASTY_QUEST_TYPES)[number]

interface DynastyQuestTemplate {
  type: DynastyQuestType
  title: string
  description: string
  targetValue: number
}

const DYNASTY_QUEST_TEMPLATES: DynastyQuestTemplate[] = [
  {
    type: 'three-peat',
    title: 'Three-Peat',
    description: 'Win 3 consecutive premierships.',
    targetValue: 3,
  },
  {
    type: 'finals-streak',
    title: 'Finals Dynasty',
    description: 'Reach the finals (top 4) in 5 consecutive seasons.',
    targetValue: 5,
  },
  {
    type: 'brownlow-factory',
    title: 'Brownlow Factory',
    description: 'Win 3 Brownlow Medals with players at your club.',
    targetValue: 3,
  },
  {
    type: 'draft-legacy',
    title: 'Draft Superstar',
    description: 'Develop a draftee to 72+ overall rating.',
    targetValue: 1,
  },
  {
    type: 'top4-dynasty',
    title: 'Top 4 Dynasty',
    description: 'Finish in the top 4 for 4 consecutive seasons.',
    targetValue: 4,
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called once at new-game creation — returns 5 quest templates all at currentValue=0, status='active'.
 */
export function generateDynastyQuests(
  playerClubId: string,
  currentYear: number,
): CareerObjective[] {
  return DYNASTY_QUEST_TEMPLATES.map((template) => ({
    id: `dynasty-${template.type}`,
    type: template.type,
    title: template.title,
    description: template.description,
    scope: 'multi-season' as const,
    assignedYear: currentYear,
    targetValue: template.targetValue,
    currentValue: 0,
    status: 'active' as const,
    completedYear: undefined,
  }))
}

/**
 * Called after each season ends — re-computes currentValue for every quest from state.
 * Already-completed quests are preserved as-is.
 */
export function updateDynastyQuestProgress(
  quests: CareerObjective[],
  state: GameState,
): CareerObjective[] {
  const pid = state.playerClubId
  if (!pid) return quests

  return quests.map((quest) => {
    // Completed quests stay completed forever
    if (quest.status === 'completed') return quest

    const newValue = computeQuestValue(quest.type as DynastyQuestType, state, pid)
    const completed = newValue >= quest.targetValue

    return {
      ...quest,
      currentValue: newValue,
      status: completed ? 'completed' : 'active',
      completedYear: completed ? state.currentYear : quest.completedYear,
    }
  })
}

/**
 * Compare old vs new quests and return any that just flipped to 'completed'.
 */
export function getNewlyCompletedDynastyQuests(
  oldQuests: CareerObjective[],
  newQuests: CareerObjective[],
): CareerObjective[] {
  return newQuests.filter((nq) => {
    if (nq.status !== 'completed') return false
    const old = oldQuests.find((oq) => oq.id === nq.id)
    return old && old.status !== 'completed'
  })
}

/**
 * Builds a commissioner-mode news item for a newly completed dynasty quest.
 */
export function buildDynastyRewardNews(
  quest: CareerObjective,
  clubName: string,
  date: string,
): NewsItem {
  return {
    id: crypto.randomUUID(),
    date,
    headline: `Dynasty Quest Complete: ${quest.title}`,
    body: `${clubName} has achieved "${quest.title}" — ${quest.description} The board and players are inspired by this historic milestone.`,
    category: 'milestone',
    clubIds: [],
    playerIds: [],
  }
}

// ---------------------------------------------------------------------------
// Per-quest computation logic
// ---------------------------------------------------------------------------

function computeQuestValue(
  type: DynastyQuestType,
  state: GameState,
  pid: string,
): number {
  switch (type) {
    case 'three-peat':
      return computeThreePeat(state, pid)
    case 'finals-streak':
      return computeFinalsStreak(state, pid)
    case 'brownlow-factory':
      return computeBrownlowFactory(state, pid)
    case 'draft-legacy':
      return computeDraftLegacy(state, pid)
    case 'top4-dynasty':
      return computeTop4Dynasty(state, pid)
    default:
      return 0
  }
}

/** Current consecutive premiership streak for the player's club. */
function computeThreePeat(state: GameState, pid: string): number {
  return getDynastyStats(state.history, pid).consecutivePremierships
}

/**
 * Trailing consecutive seasons where the club appeared in top-4
 * (premierClubId, runnerUpClubId, or ladderTopFour).
 */
function computeFinalsStreak(state: GameState, pid: string): number {
  const sorted = [...state.history.seasons].sort((a, b) => a.year - b.year)
  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const season = sorted[i]!
    const inFinalsProxy =
      season.premierClubId === pid ||
      season.runnerUpClubId === pid ||
      season.ladderTopFour.includes(pid)
    if (inFinalsProxy) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/** Number of Brownlow Medals won by players at the player's club. */
function computeBrownlowFactory(state: GameState, pid: string): number {
  return (state.history.awards ?? []).filter((a) => a.brownlowMedal?.clubId === pid).length
}

/**
 * Number of players drafted by the player's club (from draftHistory)
 * who are still in the players dict and have 72+ overall rating.
 */
function computeDraftLegacy(state: GameState, pid: string): number {
  return (state.history.draftHistory ?? []).filter((d) => {
    if (d.clubId !== pid) return false
    const player = state.players[d.playerId]
    return player && getOverallRating(player) >= 72
  }).length
}

/** Trailing consecutive seasons where the club finished in the top 4. */
function computeTop4Dynasty(state: GameState, pid: string): number {
  const sorted = [...state.history.seasons].sort((a, b) => a.year - b.year)
  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const season = sorted[i]!
    const inTop4 =
      season.premierClubId === pid ||
      season.ladderTopFour.includes(pid)
    if (inTop4) {
      streak++
    } else {
      break
    }
  }
  return streak
}
