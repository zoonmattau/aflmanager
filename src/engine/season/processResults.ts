import type { Match } from '@/types/match'
import type { GameState, LadderPointsSettings } from '@/types/game'
import { sortLadderEntries } from './ladderSorting'

type GetState = () => GameState
type SetState = (fn: (state: GameState) => void) => void

export function processMatchResults(
  matches: Match[],
  getState: GetState,
  setState: SetState,
  ladderPoints?: LadderPointsSettings,
) {
  const ptsWin = ladderPoints?.pointsForWin ?? 4
  const ptsDraw = ladderPoints?.pointsForDraw ?? 2
  // pointsForLoss is available but typically 0
  const state = getState()
  // Clone entries, not just the array, so we never mutate frozen store objects.
  const ladder = state.ladder.map((entry) => ({ ...entry }))

  for (const match of matches) {
    if (!match.result) continue

    const homeEntry = ladder.find((e) => e.clubId === match.homeClubId)
    const awayEntry = ladder.find((e) => e.clubId === match.awayClubId)

    if (!homeEntry || !awayEntry) continue

    homeEntry.played++
    awayEntry.played++

    homeEntry.pointsFor += match.result.homeTotalScore
    homeEntry.pointsAgainst += match.result.awayTotalScore
    awayEntry.pointsFor += match.result.awayTotalScore
    awayEntry.pointsAgainst += match.result.homeTotalScore

    if (match.result.homeTotalScore > match.result.awayTotalScore) {
      homeEntry.wins++
      homeEntry.points += ptsWin
      awayEntry.losses++
    } else if (match.result.awayTotalScore > match.result.homeTotalScore) {
      awayEntry.wins++
      awayEntry.points += ptsWin
      homeEntry.losses++
    } else {
      homeEntry.draws++
      awayEntry.draws++
      homeEntry.points += ptsDraw
      awayEntry.points += ptsDraw
    }

    // Update percentage
    homeEntry.percentage = homeEntry.pointsAgainst > 0
      ? (homeEntry.pointsFor / homeEntry.pointsAgainst) * 100
      : 0
    awayEntry.percentage = awayEntry.pointsAgainst > 0
      ? (awayEntry.pointsFor / awayEntry.pointsAgainst) * 100
      : 0
  }

  // Sort ladder: points, percentage, then W-D-L tie-breakers.
  const sortedLadder = sortLadderEntries(ladder, state.settings.ladderSorting)

  setState((state) => {
    state.ladder = sortedLadder
  })

  // Update player season stats
  for (const match of matches) {
    if (!match.result) continue
    const allStats = [...match.result.homePlayerStats, ...match.result.awayPlayerStats]
    setState((state) => {
      for (const stat of allStats) {
        const player = state.players[stat.playerId]
        if (!player) continue

        // Ensure extended stat fields exist on old saves
        if (player.seasonStats.uncontestedPossessions === undefined) {
          player.seasonStats.uncontestedPossessions = 0
        }
        if (player.seasonStats.freesFor === undefined) {
          player.seasonStats.freesFor = 0
          player.seasonStats.freesAgainst = 0
        }
        if (player.seasonStats.aflFantasyPoints === undefined) {
          player.seasonStats.aflFantasyPoints = 0
          player.seasonStats.superCoachPoints = 0
        }
        if (player.seasonStats.contestedMarks === undefined) {
          player.seasonStats.contestedMarks = 0
          player.seasonStats.scoreInvolvements = 0
          player.seasonStats.metresGained = 0
          player.seasonStats.turnovers = 0
          player.seasonStats.intercepts = 0
          player.seasonStats.onePercenters = 0
          player.seasonStats.bounces = 0
          player.seasonStats.clangers = 0
          player.seasonStats.goalAssists = 0
        }
        if (player.careerStats.uncontestedPossessions === undefined) {
          player.careerStats.uncontestedPossessions = 0
        }
        if (player.careerStats.freesFor === undefined) {
          player.careerStats.freesFor = 0
          player.careerStats.freesAgainst = 0
        }
        if (player.careerStats.aflFantasyPoints === undefined) {
          player.careerStats.aflFantasyPoints = 0
          player.careerStats.superCoachPoints = 0
        }
        if (player.careerStats.contestedMarks === undefined) {
          player.careerStats.contestedMarks = 0
          player.careerStats.scoreInvolvements = 0
          player.careerStats.metresGained = 0
          player.careerStats.turnovers = 0
          player.careerStats.intercepts = 0
          player.careerStats.onePercenters = 0
          player.careerStats.bounces = 0
          player.careerStats.clangers = 0
          player.careerStats.goalAssists = 0
        }

        const STAT_KEYS = [
          'gamesPlayed', 'aflFantasyPoints', 'superCoachPoints', 'disposals', 'kicks', 'handballs', 'marks', 'tackles',
          'goals', 'behinds', 'hitouts', 'contestedPossessions', 'uncontestedPossessions',
          'clearances', 'insideFifties', 'rebound50s', 'freesFor', 'freesAgainst',
          'contestedMarks', 'scoreInvolvements',
          'metresGained', 'turnovers', 'intercepts', 'onePercenters', 'bounces',
          'clangers', 'goalAssists',
        ] as const

        player.seasonStats.gamesPlayed++
        player.careerStats.gamesPlayed++

        for (const key of STAT_KEYS) {
          if (key === 'gamesPlayed') continue
          const raw = (stat as unknown as Record<string, number>)[key]
          const value =
            key === 'uncontestedPossessions'
              ? raw ?? (stat as unknown as { uncountestedPossessions?: number }).uncountestedPossessions ?? 0
              : raw ?? 0
          ;(player.seasonStats as unknown as Record<string, number>)[key] += value
          ;(player.careerStats as unknown as Record<string, number>)[key] += value
        }
      }
    })
  }
}
