import type {
  YouthPlayer,
  YouthCompetition,
  YouthCompId,
  StateRepTeam,
  YouthNationalTournament,
  YouthTournamentMatch,
  NationalU18Team,
  YouthPlayerSeasonStats,
} from '@/types/youthPathway'
import type { ScoutingRegion } from '@/types/draft'
import type { NewsItem } from '@/types/game'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const U18_TEAMS: NationalU18Team[] = [
  'VIC Metro', 'VIC Country', 'SA', 'WA', 'NSW/ACT', 'QLD', 'Tasmania', 'NT/Allies',
]

const U16_TEAMS: NationalU18Team[] = [
  'VIC Metro', 'VIC Country', 'SA', 'WA', 'NSW/ACT', 'QLD',
]

const TEAM_REGION_MAP: Record<NationalU18Team, ScoutingRegion> = {
  'VIC Metro': 'VIC',
  'VIC Country': 'VIC',
  'SA': 'SA',
  'WA': 'WA',
  'NSW/ACT': 'NSW/ACT',
  'QLD': 'QLD',
  'Tasmania': 'TAS',
  'NT/Allies': 'NT',
}

// VIC elite comp gets +10 selection score for VIC teams
const ELITE_COMP_BONUS = 10

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function avgProxyScore(player: YouthPlayer): number {
  return (
    player.athleticism + player.footballIQ + player.contested + player.kicking +
    player.marking + player.goalkicking + player.workRate + player.leadership
  ) / 8
}

function emptySeasonStats(): YouthPlayerSeasonStats {
  return {
    gamesPlayed: 0, disposals: 0, goals: 0, marks: 0,
    tackles: 0, bestOnGroundCount: 0, avgRating: 0, standoutGames: 0,
  }
}

function mapRegionToTeamName(
  region: ScoutingRegion,
  comp: YouthCompetition | undefined,
  ageGroup: 'u16' | 'u18',
  playerIndex: number,
): NationalU18Team {
  // For VIC, alternate between Metro and Country based on comp
  if (region === 'VIC') {
    const isElite = comp?.level === 'elite'
    return isElite || playerIndex % 2 === 0 ? 'VIC Metro' : 'VIC Country'
  }
  const map: Record<ScoutingRegion, NationalU18Team> = {
    VIC: 'VIC Metro',
    SA: 'SA',
    WA: 'WA',
    'NSW/ACT': 'NSW/ACT',
    QLD: 'QLD',
    TAS: ageGroup === 'u18' ? 'Tasmania' : 'NSW/ACT', // TAS merges into Allies for U16
    NT: 'NT/Allies',
  }
  return map[region]
}

function selectionScore(
  player: YouthPlayer,
  comp: YouthCompetition | undefined,
  teamName: NationalU18Team,
): number {
  const isEliteVic = comp?.level === 'elite' && (teamName === 'VIC Metro' || teamName === 'VIC Country')
  const bonus = isEliteVic ? ELITE_COMP_BONUS : 0
  return (
    player.rawTalentScore * 0.5 +
    player.seasonStats.avgRating * 30 * 0.3 +
    player.seasonStats.standoutGames * 5 * 0.2 +
    bonus
  )
}

function simTournamentMatch(
  homeTeamName: NationalU18Team,
  awayTeamName: NationalU18Team,
  homeTeam: StateRepTeam,
  awayTeam: StateRepTeam,
  players: Record<string, YouthPlayer>,
  round: number,
  rng: SeededRNG,
): { match: YouthTournamentMatch; updatedHome: StateRepTeam; updatedAway: StateRepTeam } {
  const homeStrength =
    homeTeam.playerIds.reduce((s, id) => s + (players[id] ? avgProxyScore(players[id]) : 50), 0) /
    Math.max(1, homeTeam.playerIds.length)
  const awayStrength =
    awayTeam.playerIds.reduce((s, id) => s + (players[id] ? avgProxyScore(players[id]) : 50), 0) /
    Math.max(1, awayTeam.playerIds.length)

  const diff = homeStrength - awayStrength
  const homeGoals = clamp(Math.round((5 + diff * 0.3) * 0.88 + rng.nextInt(-3, 4)), 0, 28)
  const awayGoals = clamp(Math.round((5 - diff * 0.3) * 0.88 + rng.nextInt(-3, 4)), 0, 28)
  const homeScore = homeGoals * 6 + clamp(Math.round(homeGoals * 0.55 + rng.nextInt(0, 4)), 0, 18)
  const awayScore = awayGoals * 6 + clamp(Math.round(awayGoals * 0.55 + rng.nextInt(0, 4)), 0, 18)

  // Find standout performers
  const standoutPlayerIds: string[] = []
  let mvpPlayerId: string | null = null
  let bestRating = 0

  const allPlayerIds = [...homeTeam.playerIds, ...awayTeam.playerIds]
  for (const playerId of allPlayerIds) {
    const player = players[playerId]
    if (!player) continue
    const rating = clamp(avgProxyScore(player) * 0.055 + rng.nextFloat(0, 2), 1, 10)
    if (rating >= 8.5) standoutPlayerIds.push(playerId)
    if (rating > bestRating) { bestRating = rating; mvpPlayerId = playerId }
  }

  // Update tournament stats for all players
  const updateStats = (team: StateRepTeam, _isHome: boolean): StateRepTeam => {
    const newStats = { ...team.tournamentStats }
    for (const playerId of team.playerIds) {
      const player = players[playerId]
      if (!player) continue
      const rating = clamp(avgProxyScore(player) * 0.055 + rng.nextFloat(0, 2), 1, 10)
      const disposals = clamp(Math.round(8 + avgProxyScore(player) / 8 + rng.nextInt(-5, 6)), 3, 32)
      const goals = clamp(Math.round((player.goalkicking / 30 - 1) + rng.nextInt(-1, 2)), 0, 5)
      const marks = clamp(Math.round(disposals * 0.25 + rng.nextInt(-1, 3)), 0, 10)
      const tackles = clamp(Math.round(2 + player.workRate / 25 + rng.nextInt(-1, 3)), 0, 9)
      const existing = newStats[playerId] ?? emptySeasonStats()
      const newGames = existing.gamesPlayed + 1
      newStats[playerId] = {
        gamesPlayed: newGames,
        disposals: existing.disposals + disposals,
        goals: existing.goals + goals,
        marks: existing.marks + marks,
        tackles: existing.tackles + tackles,
        bestOnGroundCount: existing.bestOnGroundCount + (playerId === mvpPlayerId ? 1 : 0),
        avgRating: Math.round(((existing.avgRating * existing.gamesPlayed + rating) / newGames) * 10) / 10,
        standoutGames: existing.standoutGames + (rating >= 8.5 ? 1 : 0),
      }
    }
    return { ...team, tournamentStats: newStats }
  }

  const updatedHome = updateStats(homeTeam, true)
  const updatedAway = updateStats(awayTeam, false)

  return {
    match: {
      round,
      homeTeamName,
      awayTeamName,
      homeScore,
      awayScore,
      mvpPlayerId,
      standoutPlayerIds,
    },
    updatedHome,
    updatedAway,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function selectStateTeams(
  players: Record<string, YouthPlayer>,
  competitions: Record<YouthCompId, YouthCompetition>,
  ageGroup: 'u16' | 'u18',
  _rng: SeededRNG,
): StateRepTeam[] {
  const teamNames = ageGroup === 'u18' ? U18_TEAMS : U16_TEAMS

  // Initialize teams
  const teams: Map<NationalU18Team, StateRepTeam> = new Map(
    teamNames.map((name) => [
      name,
      {
        ageGroup,
        teamName: name,
        region: TEAM_REGION_MAP[name],
        playerIds: [],
        tournamentStats: {},
      },
    ]),
  )

  // Bucket eligible players
  const eligible = Object.values(players).filter(
    (p) => p.ageGroup === ageGroup && p.age === (ageGroup === 'u18' ? 18 : 16),
  )

  // Assign each player to their team and compute selection score
  type ScoredPlayer = { id: string; score: number; teamName: NationalU18Team }
  const buckets: Map<NationalU18Team, ScoredPlayer[]> = new Map(teamNames.map((n) => [n, []]))

  eligible.forEach((player, idx) => {
    const comp = competitions[player.compId]
    const teamName = mapRegionToTeamName(player.region, comp, ageGroup, idx)
    if (!buckets.has(teamName)) return
    const score = selectionScore(player, comp, teamName)
    buckets.get(teamName)!.push({ id: player.id, score, teamName })
  })

  // Select top 22 per team
  for (const [teamName, scored] of buckets.entries()) {
    scored.sort((a, b) => b.score - a.score)
    const selected = scored.slice(0, 22).map((s) => s.id)
    teams.get(teamName)!.playerIds = selected
  }

  return Array.from(teams.values())
}

export function simulateNationalTournaments(
  players: Record<string, YouthPlayer>,
  stateTeams: { u16: StateRepTeam[]; u18: StateRepTeam[] },
  year: number,
  rng: SeededRNG,
): {
  u16: YouthNationalTournament
  u18: YouthNationalTournament
  newsItems: NewsItem[]
} {
  const newsItems: NewsItem[] = []

  function runTournament(
    ageGroup: 'u16' | 'u18',
    teams: StateRepTeam[],
  ): YouthNationalTournament {
    const teamMap = new Map(teams.map((t) => [t.teamName, { ...t }]))
    const matches: YouthTournamentMatch[] = []

    // Round-robin: each team plays each other once
    const teamNames = Array.from(teamMap.keys())
    let roundNum = 0
    for (let i = 0; i < teamNames.length; i++) {
      for (let j = i + 1; j < teamNames.length; j++) {
        roundNum++
        const homeTeamName = teamNames[i]
        const awayTeamName = teamNames[j]
        const homeTeam = teamMap.get(homeTeamName)!
        const awayTeam = teamMap.get(awayTeamName)!

        const { match, updatedHome, updatedAway } = simTournamentMatch(
          homeTeamName, awayTeamName, homeTeam, awayTeam, players, roundNum, rng,
        )

        teamMap.set(homeTeamName, updatedHome)
        teamMap.set(awayTeamName, updatedAway)
        matches.push(match)

        // Brief match news
        newsItems.push({
          id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
          headline: `U${ageGroup === 'u18' ? '18' : '16'} Champs Rd ${roundNum}: ${homeTeamName} ${match.homeScore} def ${awayTeamName} ${match.awayScore}`,
          body: match.mvpPlayerId
            ? `MVP: ${players[match.mvpPlayerId]?.firstName ?? ''} ${players[match.mvpPlayerId]?.lastName ?? ''} (${homeTeamName}).`
            : '',
          category: 'general' as const,
          clubIds: [],
          playerIds: match.mvpPlayerId ? [match.mvpPlayerId] : [],
          read: false,
        })

        // Standout performance news
        for (const pid of match.standoutPlayerIds) {
          const p = players[pid]
          if (!p) continue
          newsItems.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString().slice(0, 10),
            headline: `${p.firstName} ${p.lastName} puts his hand up for the draft`,
            body: `Outstanding U${ageGroup === 'u18' ? '18' : '16'} Championship performance — a must-watch prospect.`,
            category: 'draft' as const,
            clubIds: [],
            playerIds: [pid],
            read: false,
          })
        }
      }
    }

    // Finals (Top 4)
    // Sort teams by wins
    const teamWins: Record<string, number> = {}
    for (const match of matches) {
      if (match.homeScore > match.awayScore) {
        teamWins[match.homeTeamName] = (teamWins[match.homeTeamName] ?? 0) + 1
      } else if (match.awayScore > match.homeScore) {
        teamWins[match.awayTeamName] = (teamWins[match.awayTeamName] ?? 0) + 1
      }
    }
    const sortedTeams = [...teamNames].sort((a, b) => (teamWins[b] ?? 0) - (teamWins[a] ?? 0))
    const top4 = sortedTeams.slice(0, 4)

    // SF1: 1 vs 2, SF2: 3 vs 4
    const sf1 = simTournamentMatch(top4[0], top4[1], teamMap.get(top4[0])!, teamMap.get(top4[1])!, players, roundNum + 1, rng)
    const sf2 = simTournamentMatch(top4[2], top4[3], teamMap.get(top4[2])!, teamMap.get(top4[3])!, players, roundNum + 2, rng)
    teamMap.set(top4[0], sf1.updatedHome)
    teamMap.set(top4[1], sf1.updatedAway)
    teamMap.set(top4[2], sf2.updatedHome)
    teamMap.set(top4[3], sf2.updatedAway)
    matches.push(sf1.match, sf2.match)

    // GF: SF winners
    const gfHome = sf1.match.homeScore > sf1.match.awayScore ? top4[0] : top4[1]
    const gfAway = sf2.match.homeScore > sf2.match.awayScore ? top4[2] : top4[3]
    const gf = simTournamentMatch(gfHome, gfAway, teamMap.get(gfHome)!, teamMap.get(gfAway)!, players, roundNum + 3, rng)
    teamMap.set(gfHome, gf.updatedHome)
    teamMap.set(gfAway, gf.updatedAway)
    matches.push(gf.match)

    // All-Australian selection
    const aaTeam = selectAllAustralianTeam(Array.from(teamMap.values()), players, rng)

    // Medal winner: top scorer by avgRating + goals*0.3 + BOGcount*5
    let medalWinnerId: string | null = null
    let bestMedalScore = -1
    for (const team of teamMap.values()) {
      for (const [pid, stats] of Object.entries(team.tournamentStats)) {
        const medalScore = stats.avgRating + stats.goals * 0.3 + stats.bestOnGroundCount * 5
        if (medalScore > bestMedalScore) {
          bestMedalScore = medalScore
          medalWinnerId = pid
        }
      }
    }

    // Medal winner news
    if (medalWinnerId) {
      const winner = players[medalWinnerId]
      if (winner) {
        newsItems.push({
          id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
          headline: `${winner.firstName} ${winner.lastName} wins the ${ageGroup === 'u18' ? 'Larke Medal' : 'U16 Tournament Medal'}`,
          body:
            `${winner.firstName} ${winner.lastName} has been named the best player of the ` +
            `${year} National U${ageGroup === 'u18' ? '18' : '16'} Championships. ` +
            `A standout performer throughout the tournament.`,
          category: 'draft' as const,
          clubIds: [],
          playerIds: [medalWinnerId],
          read: false,
        })
      }
    }

    // All-Australian news
    newsItems.push({
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      headline: `${year} National U${ageGroup === 'u18' ? '18' : '16'} All-Australian team named`,
      body: `The 18-player All-Australian team has been announced following the national championships. ` +
        `${aaTeam.length} players recognised across all states.`,
      category: 'draft' as const,
      clubIds: [],
      playerIds: aaTeam,
      read: false,
    })

    return {
      year,
      ageGroup,
      teams: Array.from(teamMap.values()),
      matches,
      medalWinnerId,
      allAustralianTeam: aaTeam,
      completed: true,
    }
  }

  const u18 = runTournament('u18', stateTeams.u18)
  const u16 = runTournament('u16', stateTeams.u16)

  return { u16, u18, newsItems }
}

export function selectAllAustralianTeam(
  teams: StateRepTeam[],
  players: Record<string, YouthPlayer>,
  _rng: SeededRNG,
): string[] {
  // Collect all players with stats, scored
  type Candidate = { id: string; score: number; position: string; teamName: NationalU18Team }
  const candidates: Candidate[] = []

  for (const team of teams) {
    for (const [pid, stats] of Object.entries(team.tournamentStats)) {
      const player = players[pid]
      if (!player) continue
      const score = stats.avgRating + stats.goals * 0.3 + stats.bestOnGroundCount * 5
      candidates.push({ id: pid, score, position: player.position, teamName: team.teamName })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  // Group by rough zone: defenders, mids, forwards
  const defenders = new Set(['FB', 'BP', 'CHB', 'HB'])
  const forwards = new Set(['FF', 'FP', 'CHF', 'HF'])
  const midfielders = new Set(['C', 'HF', 'R', 'RR', 'MID', 'WB', 'RK'])

  const aaDefenders: string[] = []
  const aaMids: string[] = []
  const aaForwards: string[] = []
  const teamCounts: Record<string, number> = {}

  for (const c of candidates) {
    const teamCount = teamCounts[c.teamName] ?? 0
    if (teamCount >= 5) continue  // max 5 per state team

    if (aaDefenders.length < 6 && defenders.has(c.position)) {
      aaDefenders.push(c.id)
      teamCounts[c.teamName] = teamCount + 1
    } else if (aaForwards.length < 6 && forwards.has(c.position)) {
      aaForwards.push(c.id)
      teamCounts[c.teamName] = teamCount + 1
    } else if (aaMids.length < 6 && midfielders.has(c.position)) {
      aaMids.push(c.id)
      teamCounts[c.teamName] = teamCount + 1
    }

    if (aaDefenders.length >= 6 && aaMids.length >= 6 && aaForwards.length >= 6) break
  }

  // Fill remaining slots from top remaining candidates if quota not met
  const selected = new Set([...aaDefenders, ...aaMids, ...aaForwards])
  for (const c of candidates) {
    if (selected.size >= 18) break
    if (!selected.has(c.id)) selected.add(c.id)
  }

  return [...selected].slice(0, 18)
}
