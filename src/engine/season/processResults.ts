import type { Match } from '@/types/match'
import type { GameState } from '@/types/game'

type GetState = () => GameState
type SetState = (fn: (state: GameState) => void) => void

export function processMatchResults(
  matches: Match[],
  getState: GetState,
  setState: SetState
) {
  const state = getState()
  const ladder = [...state.ladder]

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
      homeEntry.points += 4
      awayEntry.losses++
    } else if (match.result.awayTotalScore > match.result.homeTotalScore) {
      awayEntry.wins++
      awayEntry.points += 4
      homeEntry.losses++
    } else {
      homeEntry.draws++
      awayEntry.draws++
      homeEntry.points += 2
      awayEntry.points += 2
    }

    // Update percentage
    homeEntry.percentage = homeEntry.pointsAgainst > 0
      ? (homeEntry.pointsFor / homeEntry.pointsAgainst) * 100
      : 0
    awayEntry.percentage = awayEntry.pointsAgainst > 0
      ? (awayEntry.pointsFor / awayEntry.pointsAgainst) * 100
      : 0
  }

  // Sort ladder: points desc, then percentage desc
  ladder.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.percentage - a.percentage
  })

  setState((state) => {
    state.ladder = ladder
  })

  // Update player season stats
  for (const match of matches) {
    if (!match.result) continue
    const allStats = [...match.result.homePlayerStats, ...match.result.awayPlayerStats]
    setState((state) => {
      for (const stat of allStats) {
        const player = state.players[stat.playerId]
        if (!player) continue
        player.seasonStats.gamesPlayed++
        player.seasonStats.disposals += stat.disposals
        player.seasonStats.kicks += stat.kicks
        player.seasonStats.handballs += stat.handballs
        player.seasonStats.marks += stat.marks
        player.seasonStats.tackles += stat.tackles
        player.seasonStats.goals += stat.goals
        player.seasonStats.behinds += stat.behinds
        player.seasonStats.hitouts += stat.hitouts
        player.seasonStats.contestedPossessions += stat.contestedPossessions
        player.seasonStats.clearances += stat.clearances
        player.seasonStats.insideFifties += stat.insideFifties
        player.seasonStats.rebound50s += stat.rebound50s

        // Also update career stats
        player.careerStats.gamesPlayed++
        player.careerStats.disposals += stat.disposals
        player.careerStats.kicks += stat.kicks
        player.careerStats.handballs += stat.handballs
        player.careerStats.marks += stat.marks
        player.careerStats.tackles += stat.tackles
        player.careerStats.goals += stat.goals
        player.careerStats.behinds += stat.behinds
        player.careerStats.hitouts += stat.hitouts
        player.careerStats.contestedPossessions += stat.contestedPossessions
        player.careerStats.clearances += stat.clearances
        player.careerStats.insideFifties += stat.insideFifties
        player.careerStats.rebound50s += stat.rebound50s
      }
    })
  }
}
