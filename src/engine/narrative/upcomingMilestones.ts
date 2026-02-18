import type { Player } from '@/types/player'

export type MilestoneWatchStat = 'gamesPlayed' | 'goals'

export type MilestoneWatchKind =
  | 'games-milestone'
  | 'goals-milestone'
  | 'club-record-approach'
  | 'league-record-approach'

export interface UpcomingMilestoneNote {
  id: string
  kind: MilestoneWatchKind
  stat: MilestoneWatchStat
  playerId: string
  playerName: string
  clubId: string
  currentValue: number
  targetValue: number
  gap: number
  targetPlayerId?: string
  targetPlayerName?: string
  priority: number
}

const GOAL_APPROACH_WINDOW = 5
const GAMES_APPROACH_WINDOW = 1

function makePlayerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`
}

function getNextMultipleOf50(value: number): number {
  return Math.ceil((value + 1) / 50) * 50
}

function getApproachWindow(stat: MilestoneWatchStat): number {
  return stat === 'gamesPlayed' ? GAMES_APPROACH_WINDOW : GOAL_APPROACH_WINDOW
}

function calcPriority(kind: MilestoneWatchKind, stat: MilestoneWatchStat, gap: number): number {
  const isGames = stat === 'gamesPlayed'
  if (kind === 'league-record-approach') return isGames ? 98 : gap <= 2 ? 90 : 84
  if (kind === 'club-record-approach') return isGames ? 95 : gap <= 2 ? 87 : 80
  if (kind === 'games-milestone') return 92
  return gap <= 2 ? 82 : 74
}

function addNote(
  notes: Map<string, UpcomingMilestoneNote>,
  note: Omit<UpcomingMilestoneNote, 'id' | 'priority' | 'kind'>,
  kind: MilestoneWatchKind,
): void {
  const id = [
    kind,
    note.stat,
    note.playerId,
    note.targetValue,
    note.targetPlayerId ?? 'none',
  ].join(':')
  const priority = calcPriority(kind, note.stat, note.gap)
  const existing = notes.get(id)
  if (!existing || priority > existing.priority) {
    notes.set(id, { ...note, kind, id, priority })
  }
}

function getTopRecordHolder(
  players: Player[],
  stat: MilestoneWatchStat,
  excludingPlayerId: string,
): { playerId: string; playerName: string; value: number } | null {
  let best: { playerId: string; playerName: string; value: number } | null = null
  for (const player of players) {
    if (player.id === excludingPlayerId) continue
    const value = player.careerStats[stat]
    if (!best || value > best.value) {
      best = { playerId: player.id, playerName: makePlayerName(player), value }
    }
  }
  return best
}

export function buildUpcomingMilestoneNotes(
  players: Record<string, Player>,
  candidatePlayerIds: string[],
): UpcomingMilestoneNote[] {
  const notes = new Map<string, UpcomingMilestoneNote>()
  const allPlayers = Object.values(players)
  const clubPlayersByClub: Record<string, Player[]> = {}

  for (const player of allPlayers) {
    if (!clubPlayersByClub[player.clubId]) clubPlayersByClub[player.clubId] = []
    clubPlayersByClub[player.clubId].push(player)
  }

  for (const playerId of candidatePlayerIds) {
    const player = players[playerId]
    if (!player) continue

    const games = player.careerStats.gamesPlayed
    const nextGamesMilestone = getNextMultipleOf50(games)
    const gamesGap = nextGamesMilestone - games
    if (gamesGap > 0 && gamesGap <= GAMES_APPROACH_WINDOW) {
      addNote(notes, {
        stat: 'gamesPlayed',
        playerId: player.id,
        playerName: makePlayerName(player),
        clubId: player.clubId,
        currentValue: games,
        targetValue: nextGamesMilestone,
        gap: gamesGap,
      }, 'games-milestone')
    }

    const goals = player.careerStats.goals
    const nextGoalMilestone = getNextMultipleOf50(goals)
    const goalGap = nextGoalMilestone - goals
    if (goalGap > 0 && goalGap <= GOAL_APPROACH_WINDOW) {
      addNote(notes, {
        stat: 'goals',
        playerId: player.id,
        playerName: makePlayerName(player),
        clubId: player.clubId,
        currentValue: goals,
        targetValue: nextGoalMilestone,
        gap: goalGap,
      }, 'goals-milestone')
    }

    for (const stat of ['gamesPlayed', 'goals'] as const) {
      const window = getApproachWindow(stat)
      const clubPlayers = clubPlayersByClub[player.clubId] ?? []
      const clubRecord = getTopRecordHolder(clubPlayers, stat, player.id)
      if (clubRecord) {
        const gap = clubRecord.value - player.careerStats[stat]
        if (gap > 0 && gap <= window) {
          addNote(notes, {
            stat,
            playerId: player.id,
            playerName: makePlayerName(player),
            clubId: player.clubId,
            currentValue: player.careerStats[stat],
            targetValue: clubRecord.value,
            gap,
            targetPlayerId: clubRecord.playerId,
            targetPlayerName: clubRecord.playerName,
          }, 'club-record-approach')
        }
      }

      const leagueRecord = getTopRecordHolder(allPlayers, stat, player.id)
      if (leagueRecord) {
        const gap = leagueRecord.value - player.careerStats[stat]
        if (gap > 0 && gap <= window) {
          addNote(notes, {
            stat,
            playerId: player.id,
            playerName: makePlayerName(player),
            clubId: player.clubId,
            currentValue: player.careerStats[stat],
            targetValue: leagueRecord.value,
            gap,
            targetPlayerId: leagueRecord.playerId,
            targetPlayerName: leagueRecord.playerName,
          }, 'league-record-approach')
        }
      }
    }
  }

  return [...notes.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    if (a.gap !== b.gap) return a.gap - b.gap
    return b.targetValue - a.targetValue
  })
}

export function formatUpcomingMilestoneLabel(note: UpcomingMilestoneNote): string {
  if (note.kind === 'games-milestone') return `${note.gap} game from ${note.targetValue}`
  if (note.kind === 'goals-milestone') return `${note.gap} goals from ${note.targetValue}`

  const statLabel = note.stat === 'gamesPlayed' ? 'games' : 'goals'
  const scope = note.kind === 'club-record-approach' ? 'club record' : 'league record'
  const amount = note.gap === 1 ? '1 away' : `${note.gap} away`
  return `${amount} from ${scope} (${note.targetValue} ${statLabel})`
}

export function formatUpcomingMilestoneSummary(note: UpcomingMilestoneNote): string {
  if (note.kind === 'games-milestone') {
    return `${note.playerName} is ${note.gap} game away from ${note.targetValue} career games.`
  }
  if (note.kind === 'goals-milestone') {
    return `${note.playerName} is ${note.gap} goals away from ${note.targetValue} career goals.`
  }
  const scope = note.kind === 'club-record-approach' ? 'club' : 'league'
  const statLabel = note.stat === 'gamesPlayed' ? 'games' : 'goals'
  return `${note.playerName} is ${note.gap} ${statLabel} shy of ${note.targetPlayerName}'s ${scope} mark (${note.targetValue}).`
}
