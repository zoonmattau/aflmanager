import type { Club } from '@/types/club'
import type { Player, PlayerAttributes } from '@/types/player'
import type { NewsItem, ReservesPlayerPerformance, ReservesSystemState } from '@/types/game'
import { SeededRNG } from '@/engine/core/rng'
import { isPlayerSuspended } from '@/engine/players/availability'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function meanAttributes(attrs: PlayerAttributes): number {
  const values = Object.values(attrs)
  if (values.length === 0) return 50
  const sum = values.reduce((a, b) => a + b, 0)
  return sum / values.length
}

function buildPerformance(
  player: Player,
  round: number,
  rng: SeededRNG,
  tactics?: ReservesSystemState['tactics'],
): ReservesPlayerPerformance {
  const ovr = meanAttributes(player.attributes)
  const tempoBoost =
    tactics?.tempo === 'fast' ? 2
    : tactics?.tempo === 'slow' ? -2
    : 0
  const aggressionBoost =
    tactics?.aggression === 'high' ? 2
    : tactics?.aggression === 'low' ? -2
    : 0
  const youthBoost = tactics?.youthFocus && player.age <= 22 ? 3 : 0
  const roleBoost =
    player.position.primary === 'RK' ? 6
    : player.position.primary === 'FF' || player.position.primary === 'CHF' || player.position.primary === 'FP' || player.position.primary === 'HFF'
      ? 4
      : 0
  const rating = clamp(
    Math.round(
      ovr * 0.55 +
      player.form * 0.30 +
      player.fitness * 0.15 +
      roleBoost * 0.5 +
      tempoBoost +
      aggressionBoost +
      youthBoost +
      rng.nextInt(-10, 10),
    ),
    30,
    99,
  )
  const disposals = clamp(Math.round(8 + rating / 3.4 + rng.nextInt(-4, 5)), 4, 42)
  const marks = clamp(Math.round(disposals * 0.28 + rng.nextInt(-2, 3)), 0, 14)
  const tackles = clamp(Math.round(2 + player.attributes.tackling / 22 + rng.nextInt(-2, 3)), 0, 15)
  const goals = clamp(Math.round((rating + roleBoost - 52) / 16 + rng.nextInt(-1, 2)), 0, 8)
  const hitouts = player.position.primary === 'RK'
    ? clamp(Math.round(12 + player.attributes.hitouts / 4 + rng.nextInt(-6, 7)), 0, 58)
    : clamp(rng.nextInt(0, 4), 0, 6)
  const behinds = clamp(Math.round(goals * 0.55 + rng.nextInt(0, 2)), 0, 6)
  const kicks = Math.round(disposals * (0.57 + rng.nextFloat(-0.08, 0.08)))
  const handballs = Math.max(0, disposals - kicks)
  const contested = clamp(Math.round(disposals * (0.42 + rng.nextFloat(-0.12, 0.12))), 0, disposals)
  const freesFor = clamp(rng.nextInt(0, 3), 0, 5)
  const freesAgainst = clamp(rng.nextInt(0, 3), 0, 5)

  const fantasy =
    kicks * 3 +
    handballs * 2 +
    marks * 3 +
    tackles * 4 +
    goals * 6 +
    behinds +
    hitouts +
    freesFor -
    freesAgainst * 3

  const superCoach = clamp(
    Math.round(
      fantasy * 0.78 +
      contested * 2.1 +
      (goals * 5) +
      (marks > 8 ? 6 : 0) +
      rng.nextInt(-12, 14),
    ),
    15,
    220,
  )

  return {
    playerId: player.id,
    clubId: player.clubId,
    round,
    rating,
    aflFantasyPoints: fantasy,
    superCoachPoints: superCoach,
    disposals,
    goals,
    marks,
    tackles,
    hitouts,
  }
}

function applyReservesDevelopment(player: Player, perf: ReservesPlayerPerformance, rng: SeededRNG): void {
  const formDelta =
    perf.rating >= 80 ? rng.nextInt(3, 7)
    : perf.rating >= 68 ? rng.nextInt(1, 4)
    : perf.rating <= 44 ? -rng.nextInt(1, 4)
    : rng.nextInt(-1, 2)
  player.form = clamp(player.form + formDelta, 20, 99)
  player.morale = clamp(player.morale + (perf.rating >= 70 ? 1 : perf.rating <= 45 ? -1 : 0), 1, 100)

  if (player.age > 24) return
  if (perf.rating < 74) return
  if (!rng.chance(0.35)) return

  const keys = Object.keys(player.attributes) as Array<keyof PlayerAttributes>
  const upgrades = perf.rating >= 86 ? 2 : 1
  for (let i = 0; i < upgrades; i++) {
    const key = rng.pick(keys)
    player.attributes[key] = clamp(player.attributes[key] + 1, 1, 99)
  }
}

export function simulateReservesRound(params: {
  players: Record<string, Player>
  clubs: Record<string, Club>
  playedPlayerIds: Set<string>
  currentRound: number
  currentDate: string
  userClubId: string
  reserves: ReservesSystemState
  rng: SeededRNG
}): { reserves: ReservesSystemState; news: NewsItem[] } {
  const { players, clubs, playedPlayerIds, currentRound, currentDate, userClubId, rng } = params
  const seasonStatsByPlayer: Record<string, ReservesSystemState['seasonStatsByPlayer'][string]> = {
    ...params.reserves.seasonStatsByPlayer,
  }

  const availableByClub = new Map<string, Player[]>()
  for (const player of Object.values(players)) {
    if (!player.clubId || !clubs[player.clubId]) continue
    if (playedPlayerIds.has(player.id)) continue
    if (player.injury || isPlayerSuspended(player)) continue
    if (!availableByClub.has(player.clubId)) availableByClub.set(player.clubId, [])
    availableByClub.get(player.clubId)!.push(player)
  }

  const autoPick = (clubPlayers: Player[], withYouthBias: boolean): string[] => {
    const sorted = [...clubPlayers].sort((a, b) => {
      const aYouth = withYouthBias && a.age <= 22 ? 6 : 0
      const bYouth = withYouthBias && b.age <= 22 ? 6 : 0
      const aScore = meanAttributes(a.attributes) * 0.45 + a.form * 0.35 + a.fitness * 0.2 + aYouth
      const bScore = meanAttributes(b.attributes) * 0.45 + b.form * 0.35 + b.fitness * 0.2 + bYouth
      return bScore - aScore
    })
    return sorted.slice(0, 23).map((p) => p.id)
  }

  const userAvailable = availableByClub.get(userClubId) ?? []
  const userAvailableIds = new Set(userAvailable.map((p) => p.id))
  const userManagedValid = params.reserves.managedLineupPlayerIds.filter((id) => userAvailableIds.has(id))
  const userPlayingIds = params.reserves.delegationEnabled
    ? autoPick(userAvailable, params.reserves.tactics.youthFocus)
    : [...userManagedValid, ...autoPick(userAvailable, params.reserves.tactics.youthFocus).filter((id) => !userManagedValid.includes(id))]
        .slice(0, 23)
  const userPlayingSet = new Set(userPlayingIds)

  const performances: ReservesPlayerPerformance[] = []
  for (const [clubId, clubPlayers] of availableByClub) {
    const playingIds = clubId === userClubId ? userPlayingSet : new Set(autoPick(clubPlayers, false))
    for (const player of clubPlayers) {
      if (!playingIds.has(player.id)) {
        if (clubId === userClubId && !params.reserves.delegationEnabled) {
          player.form = clamp(player.form - 1, 20, 99)
        }
        continue
      }

      const perf = buildPerformance(
        player,
        currentRound,
        rng,
        clubId === userClubId ? params.reserves.tactics : undefined,
      )
    performances.push(perf)
      applyReservesDevelopment(player, perf, rng)

      const stats = seasonStatsByPlayer[player.id] ?? {
        gamesPlayed: 0,
        aflFantasyPoints: 0,
        superCoachPoints: 0,
        disposals: 0,
        goals: 0,
        marks: 0,
        tackles: 0,
        hitouts: 0,
      }
      stats.gamesPlayed += 1
      stats.aflFantasyPoints += perf.aflFantasyPoints
      stats.superCoachPoints += perf.superCoachPoints
      stats.disposals += perf.disposals
      stats.goals += perf.goals
      stats.marks += perf.marks
      stats.tackles += perf.tackles
      stats.hitouts += perf.hitouts
      seasonStatsByPlayer[player.id] = stats
    }
  }

  const userReservePerformers = performances
    .filter((p) => p.clubId === userClubId && players[p.playerId]?.listStatus === 'reserves')
    .sort((a, b) => b.rating - a.rating)

  // AI list churn: promote high-performing reserves and demote poor fringe seniors.
  const performancesByClub = new Map<string, ReservesPlayerPerformance[]>()
  for (const perf of performances) {
    if (!performancesByClub.has(perf.clubId)) performancesByClub.set(perf.clubId, [])
    performancesByClub.get(perf.clubId)!.push(perf)
  }
  for (const [clubId, clubPerformances] of performancesByClub) {
    if (clubId === userClubId) continue
    const reservePromote = clubPerformances
      .filter((p) => players[p.playerId]?.listStatus === 'reserves')
      .sort((a, b) => b.rating - a.rating)[0]
    if (!reservePromote || reservePromote.rating < 80) continue
    const demoteCandidate = clubPerformances
      .filter((p) => players[p.playerId]?.listStatus !== 'reserves')
      .sort((a, b) => a.rating - b.rating)[0]
    const promotedPlayer = players[reservePromote.playerId]
    if (!promotedPlayer) continue
    promotedPlayer.listStatus = 'senior'
    if (demoteCandidate) {
      const demotedPlayer = players[demoteCandidate.playerId]
      if (demotedPlayer) demotedPlayer.listStatus = 'reserves'
    }
  }

  const promotionWatchlist = userReservePerformers
    .filter((p) => p.rating >= 72)
    .slice(0, 5)
    .map((p) => p.playerId)

  const news: NewsItem[] = []
  const top = userReservePerformers[0]
  if (top) {
    const player = players[top.playerId]
    if (player) {
      news.push({
        id: crypto.randomUUID(),
        date: currentDate,
        headline: `Reserves watch: ${player.firstName} ${player.lastName} pushes for selection`,
        body:
          `${player.firstName} ${player.lastName} starred in the reserves with ${top.disposals} disposals, ` +
          `${top.goals} goals and ${top.aflFantasyPoints} AFL Fantasy points.`,
        category: 'general',
        clubIds: [userClubId],
        playerIds: [player.id],
      })
    }
  }

  return {
    reserves: {
      seasonStatsByPlayer,
      lastRoundPerformances: performances.filter((p) => p.clubId === userClubId),
      promotionWatchlist,
      delegationEnabled: params.reserves.delegationEnabled,
      managedLineupPlayerIds: params.reserves.managedLineupPlayerIds.filter((id) => userAvailableIds.has(id)),
      tactics: params.reserves.tactics,
    },
    news,
  }
}
