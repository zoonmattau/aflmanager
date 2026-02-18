import type { Player } from '@/types/player'
import type { SpecialEventDefinition, SpecialEventTeam, OriginEligibility, OriginConfig, OriginState } from '@/types/specialEvents'
import type { SeededRNG } from '@/engine/core/rng'
import { getClubState } from '@/engine/venues/venueEngine'

// ---------------------------------------------------------------------------
// State-to-club mapping for State of Origin (all 7 states)
// ---------------------------------------------------------------------------

const STATE_CLUBS: Record<OriginState, string[]> = {
  VIC: [
    'richmond', 'collingwood', 'carlton', 'essendon', 'hawthorn',
    'melbourne', 'geelong', 'westernbulldogs', 'stkilda', 'northmelbourne',
  ],
  SA: ['adelaide', 'portadelaide'],
  WA: ['westcoast', 'fremantle'],
  QLD: ['brisbane', 'goldcoast'],
  NSW: ['sydney', 'gws'],
  TAS: [],  // No AFL clubs based in Tasmania
  NT: [],   // No AFL clubs based in Northern Territory
}

// Vic metro vs country split for Preseason Showcase
const VIC_METRO_CLUBS = new Set([
  'richmond', 'collingwood', 'carlton', 'essendon',
  'melbourne', 'stkilda', 'westernbulldogs', 'northmelbourne',
])
const VIC_COUNTRY_CLUBS = new Set(['geelong', 'hawthorn'])

// ---------------------------------------------------------------------------
// Origin eligibility resolver
// ---------------------------------------------------------------------------

/**
 * Resolve which state a player belongs to for representative selection.
 * Returns the raw state — no normalisation (TAS and NT are independent).
 */
function getPlayerOriginState(
  player: Player,
  eligibility: OriginEligibility,
): string {
  switch (eligibility) {
    case 'birthplace':
      return player.homeState ?? getClubState(player.clubId)
    case 'current-club':
    case 'state-league':
      return getClubState(player.clubId)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getPlayerRating(player: Player): number {
  const attrs = Object.values(player.attributes) as number[]
  if (attrs.length === 0) return 50
  return attrs.reduce((a, b) => a + b, 0) / attrs.length
}

function getTopPlayers(
  players: Record<string, Player>,
  filterFn: (p: Player) => boolean,
  count: number,
): Player[] {
  return Object.values(players)
    .filter((p) => filterFn(p) && !p.injury)
    .sort((a, b) => getPlayerRating(b) - getPlayerRating(a))
    .slice(0, count)
}

function buildTeam(name: string, selectedPlayers: Player[]): SpecialEventTeam {
  const rating =
    selectedPlayers.length > 0
      ? selectedPlayers.reduce((sum, p) => sum + getPlayerRating(p), 0) / selectedPlayers.length
      : 50
  return {
    name,
    playerIds: selectedPlayers.map((p) => p.id),
    teamRating: rating,
  }
}

// ---------------------------------------------------------------------------
// Allies team builder
// ---------------------------------------------------------------------------

/**
 * Build a composite "Allies" team from players whose origin state matches
 * any of the specified allies states.
 */
export function buildAlliesTeam(
  players: Record<string, Player>,
  alliesStates: OriginState[],
  alliesName: string,
  eligibility: OriginEligibility,
): SpecialEventTeam {
  const stateSet = new Set<string>(alliesStates)
  const selected = getTopPlayers(
    players,
    (p) => stateSet.has(getPlayerOriginState(p, eligibility)),
    22,
  )
  return buildTeam(alliesName, selected)
}

// ---------------------------------------------------------------------------
// Origin fixture generation
// ---------------------------------------------------------------------------

/**
 * Get all competing team names for origin based on config.
 * Returns participating states + the Allies composite (if enabled).
 */
export function getOriginTeamNames(config: OriginConfig): string[] {
  const teams: string[] = []
  const alliesSet = new Set<string>(config.alliesEnabled ? config.alliesStates : [])
  for (const state of config.participatingStates) {
    if (!alliesSet.has(state)) {
      teams.push(state)
    }
  }
  if (config.alliesEnabled && config.alliesStates.length > 0) {
    teams.push(config.alliesName)
  }
  return teams
}

/**
 * Generate all pairwise combinations from a list of team names.
 */
function generatePairs(teams: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push([teams[i]!, teams[j]!])
    }
  }
  return pairs
}

/**
 * Generate origin fixtures based on the config.
 * Returns an array of {teamA, teamB} matchups of length config.matchCount.
 */
export function generateOriginFixtures(
  config: OriginConfig,
  year: number,
): Array<{ teamA: string; teamB: string }> {
  const teams = getOriginTeamNames(config)
  if (teams.length < 2) return []

  const pairs = generatePairs(teams)
  if (pairs.length === 0) return []

  const matchCount = config.matchCount
  const fixtures: Array<{ teamA: string; teamB: string }> = []

  switch (config.format) {
    case 'best-of-3': {
      // Cycle through pairwise combos to fill matchCount
      for (let i = 0; i < matchCount; i++) {
        const [teamA, teamB] = pairs[i % pairs.length]!
        fixtures.push({ teamA, teamB })
      }
      break
    }
    case 'round-robin': {
      // Full round-robin, repeat cycle if matchCount exceeds pairs, truncate if less
      for (let i = 0; i < matchCount; i++) {
        const [teamA, teamB] = pairs[i % pairs.length]!
        fixtures.push({ teamA, teamB })
      }
      break
    }
    case 'single-annual': {
      // Rotating matchup based on year
      for (let i = 0; i < matchCount; i++) {
        const pairIdx = (year + i) % pairs.length
        const [teamA, teamB] = pairs[pairIdx]!
        fixtures.push({ teamA, teamB })
      }
      break
    }
  }

  return fixtures
}

// ---------------------------------------------------------------------------
// Per-event team selection
// ---------------------------------------------------------------------------

/**
 * Select teams for a single Origin match.
 * If a team name matches the Allies name, builds a composite team.
 */
export function selectOriginMatchTeams(
  players: Record<string, Player>,
  teamAName: string,
  teamBName: string,
  eligibility: OriginEligibility,
  originConfig: OriginConfig,
): { teamA: SpecialEventTeam; teamB: SpecialEventTeam } {
  const buildSide = (name: string): SpecialEventTeam => {
    if (name === originConfig.alliesName && originConfig.alliesEnabled) {
      return buildAlliesTeam(players, originConfig.alliesStates, originConfig.alliesName, eligibility)
    }
    return buildTeam(
      name,
      getTopPlayers(players, (p) => getPlayerOriginState(p, eligibility) === name, 22),
    )
  }

  return {
    teamA: buildSide(teamAName),
    teamB: buildSide(teamBName),
  }
}

function selectInternationalRulesTeams(
  players: Record<string, Player>,
  rng: SeededRNG,
): { teamA: SpecialEventTeam; teamB: SpecialEventTeam } {
  const australia = getTopPlayers(players, () => true, 22)
  const australiaTeam = buildTeam('Australia', australia)

  // Ireland is synthetic — no real player IDs, rating is league avg minus random offset
  const avgRating = australiaTeam.teamRating
  const irelandRating = Math.max(40, avgRating - rng.nextInt(2, 8))
  const irelandTeam: SpecialEventTeam = {
    name: 'Ireland',
    playerIds: [],
    teamRating: irelandRating,
  }

  return { teamA: australiaTeam, teamB: irelandTeam }
}

function selectAboriginalAllStarsTeams(
  players: Record<string, Player>,
  rng: SeededRNG,
): { teamA: SpecialEventTeam; teamB: SpecialEventTeam } {
  // Top 44 overall, shuffled into two teams
  const top44 = getTopPlayers(players, () => true, 44)
  const shuffled = rng.shuffle([...top44])
  const teamAPlayers = shuffled.slice(0, 22)
  const teamBPlayers = shuffled.slice(22, 44)

  return {
    teamA: buildTeam('Indigenous All Stars', teamAPlayers),
    teamB: buildTeam('AFL All Stars', teamBPlayers),
  }
}

function selectAllAustralianVsRestTeams(
  players: Record<string, Player>,
): { teamA: SpecialEventTeam; teamB: SpecialEventTeam } {
  const top44 = getTopPlayers(players, () => true, 44)
  const allAustralian = top44.slice(0, 22)
  const rest = top44.slice(22, 44)

  return {
    teamA: buildTeam('All-Australian', allAustralian),
    teamB: buildTeam('Rest of League', rest),
  }
}

function selectPreseasonShowcaseTeams(
  players: Record<string, Player>,
  matchIndex: number,
  eligibility: OriginEligibility,
): { teamA: SpecialEventTeam; teamB: SpecialEventTeam } {
  if (matchIndex === 0) {
    // Vic Metro vs Vic Country
    if (eligibility === 'birthplace') {
      const vicPlayers = Object.values(players).filter(
        (p) => getPlayerOriginState(p, eligibility) === 'VIC' && !p.injury,
      )
      const metro = vicPlayers
        .filter((p) => VIC_METRO_CLUBS.has(p.clubId))
        .sort((a, b) => getPlayerRating(b) - getPlayerRating(a))
        .slice(0, 22)
      const country = vicPlayers
        .filter((p) => VIC_COUNTRY_CLUBS.has(p.clubId) || !VIC_METRO_CLUBS.has(p.clubId))
        .sort((a, b) => getPlayerRating(b) - getPlayerRating(a))
        .slice(0, 22)
      return {
        teamA: buildTeam('Vic Metro', metro),
        teamB: buildTeam('Vic Country', country),
      }
    }
    const metro = getTopPlayers(players, (p) => VIC_METRO_CLUBS.has(p.clubId), 22)
    const country = getTopPlayers(players, (p) => VIC_COUNTRY_CLUBS.has(p.clubId), 22)
    return {
      teamA: buildTeam('Vic Metro', metro),
      teamB: buildTeam('Vic Country', country),
    }
  }

  // Match 2: SA vs WA
  const sa = getTopPlayers(
    players,
    (p) => getPlayerOriginState(p, eligibility) === 'SA',
    22,
  )
  const wa = getTopPlayers(
    players,
    (p) => getPlayerOriginState(p, eligibility) === 'WA',
    22,
  )
  return {
    teamA: buildTeam('South Australia', sa),
    teamB: buildTeam('Western Australia', wa),
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function selectEventTeams(
  def: SpecialEventDefinition,
  players: Record<string, Player>,
  rng: SeededRNG,
  matchIndex: number,
  eligibility: OriginEligibility = 'birthplace',
  originConfig?: OriginConfig,
  originFixtures?: Array<{ teamA: string; teamB: string }>,
): { teamA: SpecialEventTeam; teamB: SpecialEventTeam } {
  switch (def.id) {
    case 'state-of-origin': {
      if (originConfig && originFixtures && matchIndex < originFixtures.length) {
        const fixture = originFixtures[matchIndex]!
        return selectOriginMatchTeams(players, fixture.teamA, fixture.teamB, eligibility, originConfig)
      }
      // Fallback: use config to generate fixtures on the fly
      if (originConfig) {
        const fixtures = generateOriginFixtures(originConfig, new Date().getFullYear())
        if (matchIndex < fixtures.length) {
          const fixture = fixtures[matchIndex]!
          return selectOriginMatchTeams(players, fixture.teamA, fixture.teamB, eligibility, originConfig)
        }
      }
      // Legacy fallback: VIC vs SA, VIC vs WA, SA vs WA
      const legacyMatchups: Array<[string, string]> = [['VIC', 'SA'], ['VIC', 'WA'], ['SA', 'WA']]
      const [stA, stB] = legacyMatchups[matchIndex % legacyMatchups.length]!
      return {
        teamA: buildTeam(stA, getTopPlayers(players, (p) => getPlayerOriginState(p, eligibility) === stA, 22)),
        teamB: buildTeam(stB, getTopPlayers(players, (p) => getPlayerOriginState(p, eligibility) === stB, 22)),
      }
    }
    case 'international-rules':
      return selectInternationalRulesTeams(players, rng)
    case 'aboriginal-all-stars':
      return selectAboriginalAllStarsTeams(players, rng)
    case 'all-australian-vs-rest':
      return selectAllAustralianVsRestTeams(players)
    case 'preseason-showcase':
      return selectPreseasonShowcaseTeams(players, matchIndex, eligibility)
    default:
      return selectAboriginalAllStarsTeams(players, rng)
  }
}

// Re-export STATE_CLUBS for use in other modules
export { STATE_CLUBS }
