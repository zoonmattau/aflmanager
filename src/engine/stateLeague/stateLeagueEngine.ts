import type {
  StateLeagueId,
  AdultStateLeagueId,
  StateLeague,
  StateLeagueClub,
  StateLeagueMatchResult,
  StateLeagueDivision,
  StateLeagueBranding,
  StateLeagueAffiliationSettings,
} from '@/types/stateLeague'
import type { LadderEntry } from '@/types/season'
import { compareLadderEntries } from '@/engine/season/ladderSorting'
import { SeededRNG } from '@/engine/core/rng'
import sanflClubsJson from '@/data/sanflClubs.json'
import waflClubsJson from '@/data/waflClubs.json'
import tflClubsJson from '@/data/tflClubs.json'
import ntflClubsJson from '@/data/ntflClubs.json'
import u18RegionsJson from '@/data/u18Regions.json'

interface AFLClubInfo {
  id: string
  name: string
  abbreviation: string
  colors: { primary: string; secondary: string }
  homeGround: string
}

interface StateClubJson {
  id: string
  name: string
  abbreviation: string
  colors: { primary: string; secondary: string }
  homeGround: string
}

interface U18RegionJson {
  id: string
  name: string
  state: string
  colors?: { primary?: string; secondary?: string }
}

export interface StateLeagueInitializationOptions {
  namingTemplate?: 'real-life' | 'fictional'
  includePathways?: boolean
}

const STATE_LEAGUE_PRIORITY: StateLeagueId[] = ['sanfl', 'wafl', 'tfl', 'ntfl', 'vfl']
export const ADULT_STATE_LEAGUE_IDS: AdultStateLeagueId[] = ['vfl', 'sanfl', 'wafl', 'tfl', 'ntfl']

const AUTO_AFFILIATION_BY_AFL_CLUB_ID: Partial<Record<string, AdultStateLeagueId>> = {
  adelaide: 'sanfl',
  portadelaide: 'sanfl',
  westcoast: 'wafl',
  fremantle: 'wafl',
}

const DEFAULT_LADDER_RULES = {
  pointsForWin: 4,
  pointsForDraw: 2,
  pointsForLoss: 0,
  primarySort: 'points' as const,
  tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'] as const,
}

const DEFAULT_FIXTURE_RULES = {
  rounds: 18,
  homeAwayBalance: true,
}

const FICTIONAL_PREFIXES = [
  'Northern',
  'Southern',
  'Western',
  'Eastern',
  'Metro',
  'Coastal',
  'Highland',
  'River',
]
const FICTIONAL_SUFFIXES = [
  'League',
  'Conference',
  'Competition',
  'Series',
]
const FICTIONAL_MASCOTS = [
  'Falcons',
  'Titans',
  'Pioneers',
  'Sharks',
  'Raiders',
  'Storm',
  'Wolves',
  'Giants',
]

function createLadderEntry(clubId: string): LadderEntry {
  return {
    clubId,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    percentage: 0,
  }
}

function sanitizeAbbreviation(name: string): string {
  const cleaned = name.replace(/[^A-Za-z ]/g, '').trim()
  if (!cleaned) return 'CLB'
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) return cleaned.slice(0, 3).toUpperCase()
  return parts.slice(0, 3).map((p) => p[0]).join('').toUpperCase()
}

function makeReservesClub(afl: AFLClubInfo, leaguePrefix: string, namingTemplate: 'real-life' | 'fictional'): StateLeagueClub {
  const name = namingTemplate === 'real-life'
    ? `${afl.name} ${leaguePrefix.toUpperCase()}`
    : `${afl.name} ${leaguePrefix.toUpperCase()} ${FICTIONAL_MASCOTS[Math.abs(hashCode(afl.id)) % FICTIONAL_MASCOTS.length]}`

  return {
    id: `${leaguePrefix}-${afl.id}`,
    name,
    abbreviation: namingTemplate === 'real-life' ? afl.abbreviation : sanitizeAbbreviation(name),
    colors: { primary: afl.colors.primary, secondary: afl.colors.secondary },
    logoText: namingTemplate === 'real-life' ? afl.abbreviation : sanitizeAbbreviation(name),
    homeGround: afl.homeGround,
    aflAffiliateId: afl.id,
    isAFLReserves: true,
  }
}

function standaloneClubFromJson(
  json: StateClubJson,
  leagueId: StateLeagueId,
  namingTemplate: 'real-life' | 'fictional',
): StateLeagueClub {
  if (namingTemplate === 'real-life') {
    return {
      id: json.id,
      name: json.name,
      abbreviation: json.abbreviation,
      colors: { primary: json.colors.primary, secondary: json.colors.secondary },
      logoText: json.abbreviation,
      homeGround: json.homeGround,
      aflAffiliateId: null,
      isAFLReserves: false,
    }
  }

  const hash = Math.abs(hashCode(`${leagueId}-${json.id}`))
  const prefix = FICTIONAL_PREFIXES[hash % FICTIONAL_PREFIXES.length]
  const mascot = FICTIONAL_MASCOTS[(hash + 3) % FICTIONAL_MASCOTS.length]
  const renamed = `${prefix} ${mascot}`

  return {
    id: json.id,
    name: renamed,
    abbreviation: sanitizeAbbreviation(renamed),
    colors: { primary: json.colors.primary, secondary: json.colors.secondary },
    logoText: sanitizeAbbreviation(renamed),
    homeGround: json.homeGround,
    aflAffiliateId: null,
    isAFLReserves: false,
  }
}

function buildLeagueBranding(
  id: StateLeagueId,
  defaultName: string,
  namingTemplate: 'real-life' | 'fictional',
): StateLeagueBranding {
  if (namingTemplate === 'real-life') {
    return {
      logoText: defaultName,
      primaryColor: '#1f2937',
      secondaryColor: '#e5e7eb',
    }
  }

  const hash = Math.abs(hashCode(id))
  const prefix = FICTIONAL_PREFIXES[hash % FICTIONAL_PREFIXES.length]
  const suffix = FICTIONAL_SUFFIXES[(hash + 4) % FICTIONAL_SUFFIXES.length]
  return {
    logoText: `${prefix} ${suffix}`,
    primaryColor: ['#0f172a', '#1e3a8a', '#14532d', '#7f1d1d'][hash % 4],
    secondaryColor: ['#e2e8f0', '#bfdbfe', '#bbf7d0', '#fecaca'][hash % 4],
  }
}

function buildLeagueName(
  id: StateLeagueId,
  defaultName: string,
  namingTemplate: 'real-life' | 'fictional',
): string {
  if (namingTemplate === 'real-life') return defaultName
  const hash = Math.abs(hashCode(id))
  const prefix = FICTIONAL_PREFIXES[hash % FICTIONAL_PREFIXES.length]
  const suffix = FICTIONAL_SUFFIXES[(hash + 1) % FICTIONAL_SUFFIXES.length]
  return `${prefix} ${suffix}`
}

function assignDivisions(clubs: StateLeagueClub[]): StateLeagueDivision[] {
  if (clubs.length <= 10) {
    return [{ id: 'overall', name: 'Overall', clubIds: clubs.map((c) => c.id) }]
  }
  const sorted = [...clubs].sort((a, b) => a.name.localeCompare(b.name))
  const split = Math.ceil(sorted.length / 2)
  return [
    { id: 'metro', name: 'Metro', clubIds: sorted.slice(0, split).map((c) => c.id) },
    { id: 'regional', name: 'Regional', clubIds: sorted.slice(split).map((c) => c.id) },
  ]
}

function createLeague(params: {
  id: StateLeagueId
  defaultName: string
  year: number
  clubs: StateLeagueClub[]
  namingTemplate: 'real-life' | 'fictional'
  rounds: number
  finalsTeams: number
}): StateLeague {
  const { id, defaultName, year, clubs, namingTemplate, rounds, finalsTeams } = params
  const divisions = assignDivisions(clubs)
  const divisionByClub = new Map<string, string>()
  for (const division of divisions) {
    for (const clubId of division.clubIds) {
      divisionByClub.set(clubId, division.id)
    }
  }

  const clubsWithDivisions = clubs.map((club) => ({
    ...club,
    divisionId: divisionByClub.get(club.id),
  }))

  return {
    id,
    name: buildLeagueName(id, defaultName, namingTemplate),
    branding: buildLeagueBranding(id, defaultName, namingTemplate),
    clubs: clubsWithDivisions,
    divisions,
    ladderRules: {
      pointsForWin: DEFAULT_LADDER_RULES.pointsForWin,
      pointsForDraw: DEFAULT_LADDER_RULES.pointsForDraw,
      pointsForLoss: DEFAULT_LADDER_RULES.pointsForLoss,
      primarySort: DEFAULT_LADDER_RULES.primarySort,
      tieBreakers: [...DEFAULT_LADDER_RULES.tieBreakers],
    },
    fixtureRules: {
      ...DEFAULT_FIXTURE_RULES,
      rounds,
    },
    finalsRules: {
      format: finalsTeams >= 8 ? 'top-8' : finalsTeams >= 6 ? 'top-6' : finalsTeams >= 4 ? 'top-4' : 'straight-knockout',
      qualifyingTeams: Math.max(2, Math.min(finalsTeams, clubs.length)),
    },
    season: { year, rounds: [] },
    ladder: clubsWithDivisions.map((c) => createLadderEntry(c.id)),
    history: [],
  }
}

function sortLadder(ladder: LadderEntry[]): void {
  ladder.sort(compareLadderEntries)
}

function inferAutoStateLeagueAffiliation(aflClubId: string): AdultStateLeagueId {
  return AUTO_AFFILIATION_BY_AFL_CLUB_ID[aflClubId] ?? 'vfl'
}

function findAffiliateClubInLeague(
  league: StateLeague | undefined,
  aflClubId: string,
): StateLeagueClub | null {
  if (!league) return null
  return league.clubs.find((c) => c.aflAffiliateId === aflClubId) ?? null
}

export function getAvailableStateLeagueAffiliationsForClub(
  leagues: Record<StateLeagueId, StateLeague> | null,
  aflClubId: string,
): AdultStateLeagueId[] {
  if (!leagues) return []
  const available = ADULT_STATE_LEAGUE_IDS.filter((leagueId) =>
    Boolean(findAffiliateClubInLeague(leagues[leagueId], aflClubId)),
  )
  const auto = inferAutoStateLeagueAffiliation(aflClubId)
  if (!available.includes(auto)) available.unshift(auto)
  return [...new Set(available)]
}

export function generateStateLeagueFixtures(
  clubIds: string[],
  rounds: number,
): { homeClubId: string; awayClubId: string }[][] {
  const ids = [...clubIds]
  const isOdd = ids.length % 2 !== 0
  if (isOdd) ids.push('__BYE__')

  const n = ids.length
  const rrRounds = n - 1
  const half = n / 2

  const fixed = ids[0]
  const rotating = ids.slice(1)

  const allRounds: { homeClubId: string; awayClubId: string }[][] = []
  const rotationState = [...rotating]

  for (let r = 0; r < Math.min(rounds, rrRounds); r++) {
    const fixtures: { homeClubId: string; awayClubId: string }[] = []

    const a = fixed
    const b = rotationState[0]
    const swapFirstPair = r % 2 === 1
    if (a !== '__BYE__' && b !== '__BYE__') {
      fixtures.push({
        homeClubId: swapFirstPair ? b : a,
        awayClubId: swapFirstPair ? a : b,
      })
    }

    for (let i = 1; i < half; i++) {
      const home = rotationState[i]
      const away = rotationState[n - 2 - i]
      if (home !== '__BYE__' && away !== '__BYE__') {
        fixtures.push(r % 2 === 0 ? { homeClubId: home, awayClubId: away } : { homeClubId: away, awayClubId: home })
      }
    }

    allRounds.push(fixtures)

    const last = rotationState.pop()
    if (!last) break
    rotationState.splice(0, 0, last)
  }

  if (rounds > rrRounds) {
    const secondHalf = rounds - rrRounds
    for (let r = 0; r < Math.min(secondHalf, rrRounds); r++) {
      const original = allRounds[r]
      const flipped = original.map((f) => ({ homeClubId: f.awayClubId, awayClubId: f.homeClubId }))
      allRounds.push(flipped)
    }
  }

  return allRounds.slice(0, rounds)
}

export function ensureStateLeagueFixtures(league: StateLeague): StateLeague {
  if (league.season.rounds.length > 0) return league
  const clubIds = league.clubs.map((c) => c.id)
  const totalRounds = Math.max(6, league.fixtureRules.rounds)
  const allFixtures = generateStateLeagueFixtures(clubIds, totalRounds)
  const generatedRounds = allFixtures.map((fixtures, idx) => ({
    number: idx + 1,
    results: fixtures.map((f) => ({
      homeClubId: f.homeClubId,
      awayClubId: f.awayClubId,
      homeScore: 0,
      awayScore: 0,
    })),
  }))

  // During render/selectors, store objects may be frozen. In that case, return
  // a new league object rather than mutating in place.
  if (!Object.isExtensible(league.season.rounds)) {
    return {
      ...league,
      season: {
        ...league.season,
        rounds: generatedRounds,
      },
    }
  }

  for (const round of generatedRounds) {
    league.season.rounds.push(round)
  }
  return league
}

export function resolveStateLeagueAffiliation(
  leagues: Record<StateLeagueId, StateLeague> | null,
  aflClubId: string,
  preferences?: StateLeagueAffiliationSettings,
): { leagueId: StateLeagueId; league: StateLeague; club: StateLeagueClub } | null {
  if (!leagues) return null

  const desiredLeagueId = (
    preferences?.allowCustomAffiliations
      ? preferences.clubAffiliations[aflClubId]
      : undefined
  ) ?? inferAutoStateLeagueAffiliation(aflClubId)

  const desiredLeague = leagues[desiredLeagueId]
  const desiredClub = findAffiliateClubInLeague(desiredLeague, aflClubId)
  if (desiredLeague && desiredClub) {
    return { leagueId: desiredLeagueId, league: desiredLeague, club: desiredClub }
  }

  for (const leagueId of STATE_LEAGUE_PRIORITY) {
    const league = leagues[leagueId]
    if (!league) continue
    const club = league.clubs.find((c) => c.aflAffiliateId === aflClubId)
    if (!club) continue
    return { leagueId, league, club }
  }

  return null
}

export function applyStateLeagueAffiliationSettings(
  leagues: Record<StateLeagueId, StateLeague> | null,
  preferences: StateLeagueAffiliationSettings | undefined,
): Record<StateLeagueId, StateLeague> | null {
  if (!leagues) return null

  const next = { ...leagues }
  const adultLeagueIds = ADULT_STATE_LEAGUE_IDS.filter((id) => Boolean(next[id]))
  const standaloneByLeague: Record<AdultStateLeagueId, StateLeagueClub[]> = {
    vfl: [],
    sanfl: [],
    wafl: [],
    tfl: [],
    ntfl: [],
  }
  const affiliateByAflId = new Map<string, { sourceLeagueId: AdultStateLeagueId; club: StateLeagueClub }>()

  for (const leagueId of adultLeagueIds) {
    const league = next[leagueId]
    for (const club of league.clubs) {
      if (club.aflAffiliateId) {
        affiliateByAflId.set(club.aflAffiliateId, { sourceLeagueId: leagueId, club: { ...club } })
      } else {
        standaloneByLeague[leagueId].push({ ...club })
      }
    }
  }

  const assignedAffiliates: Record<AdultStateLeagueId, StateLeagueClub[]> = {
    vfl: [],
    sanfl: [],
    wafl: [],
    tfl: [],
    ntfl: [],
  }

  for (const [aflClubId, info] of affiliateByAflId.entries()) {
    const desiredLeague = preferences?.allowCustomAffiliations
      ? preferences.clubAffiliations[aflClubId]
      : undefined
    const fallbackLeague = inferAutoStateLeagueAffiliation(aflClubId)
    const targetLeagueId = (desiredLeague && adultLeagueIds.includes(desiredLeague))
      ? desiredLeague
      : adultLeagueIds.includes(fallbackLeague)
        ? fallbackLeague
        : info.sourceLeagueId
    assignedAffiliates[targetLeagueId].push({ ...info.club })
  }

  for (const leagueId of adultLeagueIds) {
    const league = next[leagueId]
    const clubs = [...standaloneByLeague[leagueId], ...assignedAffiliates[leagueId]]
    const divisions = assignDivisions(clubs)
    const divisionByClub = new Map<string, string>()
    for (const division of divisions) {
      for (const clubId of division.clubIds) {
        divisionByClub.set(clubId, division.id)
      }
    }
    const clubsWithDivisions = clubs.map((club) => ({
      ...club,
      divisionId: divisionByClub.get(club.id),
    }))

    next[leagueId] = {
      ...league,
      clubs: clubsWithDivisions,
      divisions,
      finalsRules: {
        ...league.finalsRules,
        qualifyingTeams: Math.max(2, Math.min(league.finalsRules.qualifyingTeams, clubsWithDivisions.length)),
      },
      season: {
        ...league.season,
        rounds: [],
      },
      ladder: clubsWithDivisions.map((club) => createLadderEntry(club.id)),
    }
  }

  return next
}

export function simStateLeagueRound(
  league: StateLeague,
  roundNumber: number,
  rng: SeededRNG,
): void {
  const leagueWithFixtures = ensureStateLeagueFixtures(league)
  if (leagueWithFixtures !== league && Object.isExtensible(league.season)) {
    league.season = leagueWithFixtures.season
  }

  const round = leagueWithFixtures.season.rounds.find((r) => r.number === roundNumber)
  if (!round) return

  for (const result of round.results) {
    if (result.homeScore > 0 || result.awayScore > 0) continue

    const scoringScale = leagueWithFixtures.id === 'u16' ? 0.82 : leagueWithFixtures.id === 'u18' ? 0.9 : 1
    const homeGoals = Math.round((rng.nextInt(5, 15) + (rng.chance(0.6) ? 1 : 0)) * scoringScale)
    const homeBehinds = Math.round(rng.nextInt(4, 10) * scoringScale)
    const awayGoals = Math.round(rng.nextInt(5, 15) * scoringScale)
    const awayBehinds = Math.round(rng.nextInt(4, 10) * scoringScale)

    result.homeScore = homeGoals * 6 + homeBehinds
    result.awayScore = awayGoals * 6 + awayBehinds
  }

  updateLadderFromRound(leagueWithFixtures, round.results)
}

function updateLadderFromRound(
  league: StateLeague,
  results: StateLeagueMatchResult[],
): void {
  const pointsForWin = league.ladderRules.pointsForWin
  const pointsForDraw = league.ladderRules.pointsForDraw
  const pointsForLoss = league.ladderRules.pointsForLoss

  for (const result of results) {
    const homeEntry = league.ladder.find((e) => e.clubId === result.homeClubId)
    const awayEntry = league.ladder.find((e) => e.clubId === result.awayClubId)

    if (!homeEntry || !awayEntry) continue

    homeEntry.played++
    awayEntry.played++

    homeEntry.pointsFor += result.homeScore
    homeEntry.pointsAgainst += result.awayScore
    awayEntry.pointsFor += result.awayScore
    awayEntry.pointsAgainst += result.homeScore

    if (result.homeScore > result.awayScore) {
      homeEntry.wins++
      awayEntry.losses++
      homeEntry.points += pointsForWin
      awayEntry.points += pointsForLoss
    } else if (result.awayScore > result.homeScore) {
      awayEntry.wins++
      homeEntry.losses++
      awayEntry.points += pointsForWin
      homeEntry.points += pointsForLoss
    } else {
      homeEntry.draws++
      awayEntry.draws++
      homeEntry.points += pointsForDraw
      awayEntry.points += pointsForDraw
    }

    homeEntry.percentage = homeEntry.pointsAgainst > 0 ? (homeEntry.pointsFor / homeEntry.pointsAgainst) * 100 : 0
    awayEntry.percentage = awayEntry.pointsAgainst > 0 ? (awayEntry.pointsFor / awayEntry.pointsAgainst) * 100 : 0
  }

  sortLadder(league.ladder)
}

function buildPathwayLeagues(
  year: number,
  namingTemplate: 'real-life' | 'fictional',
): Pick<Record<StateLeagueId, StateLeague>, 'u16' | 'u18'> {
  const u18Regions = u18RegionsJson as U18RegionJson[]
  const u18Clubs: StateLeagueClub[] = u18Regions.map((region, idx) => ({
    id: region.id,
    name: namingTemplate === 'real-life' ? region.name : `${FICTIONAL_PREFIXES[idx % FICTIONAL_PREFIXES.length]} ${FICTIONAL_MASCOTS[(idx + 2) % FICTIONAL_MASCOTS.length]}`,
    abbreviation: sanitizeAbbreviation(region.name),
    colors: {
      primary: region.colors?.primary ?? '#1d4ed8',
      secondary: region.colors?.secondary ?? '#e2e8f0',
    },
    logoText: sanitizeAbbreviation(region.name),
    homeGround: `${region.state} Academy Ground`,
    aflAffiliateId: null,
    isAFLReserves: false,
  }))

  const u16Clubs: StateLeagueClub[] = u18Regions.slice(0, 10).map((region, idx) => ({
    id: `u16-${region.id}`,
    name: namingTemplate === 'real-life' ? `${region.name} U16` : `${FICTIONAL_PREFIXES[(idx + 1) % FICTIONAL_PREFIXES.length]} Academy`,
    abbreviation: `U16-${sanitizeAbbreviation(region.name).slice(0, 2)}`,
    colors: {
      primary: region.colors?.primary ?? '#15803d',
      secondary: region.colors?.secondary ?? '#dcfce7',
    },
    logoText: `U16-${sanitizeAbbreviation(region.name).slice(0, 2)}`,
    homeGround: `${region.state} Junior Hub`,
    aflAffiliateId: null,
    isAFLReserves: false,
  }))

  return {
    u16: createLeague({
      id: 'u16',
      defaultName: 'National U16 Championships',
      year,
      clubs: u16Clubs,
      namingTemplate,
      rounds: 12,
      finalsTeams: 4,
    }),
    u18: createLeague({
      id: 'u18',
      defaultName: 'National U18 Championships',
      year,
      clubs: u18Clubs,
      namingTemplate,
      rounds: 14,
      finalsTeams: 6,
    }),
  }
}

function finalizeLeagueSeasonHistory(league: StateLeague): void {
  if (league.ladder.length === 0) return
  const ordered = [...league.ladder].sort(compareLadderEntries)
  const premier = ordered[0]
  if (!premier) return
  const runnerUp = ordered[1] ?? null

  league.history.push({
    year: league.season.year,
    premierClubId: premier.clubId,
    runnerUpClubId: runnerUp?.clubId ?? null,
    minorPremierClubId: ordered[0]?.clubId ?? null,
  })
}

function resetLeagueForYear(league: StateLeague, year: number): StateLeague {
  const resetLadder = league.clubs.map((club) => createLadderEntry(club.id))
  return {
    ...league,
    season: {
      year,
      rounds: [],
    },
    ladder: resetLadder,
  }
}

export function rollStateLeaguesForNewSeason(
  leagues: Record<StateLeagueId, StateLeague> | null,
  newYear: number,
): Record<StateLeagueId, StateLeague> | null {
  if (!leagues) return null
  const next = {} as Record<StateLeagueId, StateLeague>
  for (const [leagueId, league] of Object.entries(leagues) as Array<[StateLeagueId, StateLeague]>) {
    const clonedHistory = [...league.history]
    const withHistory = { ...league, history: clonedHistory }
    finalizeLeagueSeasonHistory(withHistory)
    next[leagueId] = resetLeagueForYear(withHistory, newYear)
  }
  return next
}

export function initializeStateLeagues(
  aflClubs: Record<string, AFLClubInfo>,
  year: number,
  seed: number,
  options?: StateLeagueInitializationOptions,
): Record<StateLeagueId, StateLeague> {
  void seed
  const namingTemplate = options?.namingTemplate ?? 'real-life'
  const includePathways = options?.includePathways ?? true

  const vflClubs: StateLeagueClub[] = Object.values(aflClubs).map((afl) =>
    makeReservesClub(afl, 'vfl', namingTemplate),
  )

  const sanflStandalone: StateLeagueClub[] = (sanflClubsJson as StateClubJson[]).map((club) =>
    standaloneClubFromJson(club, 'sanfl', namingTemplate),
  )
  const waflStandalone: StateLeagueClub[] = (waflClubsJson as StateClubJson[]).map((club) =>
    standaloneClubFromJson(club, 'wafl', namingTemplate),
  )
  const tflStandalone: StateLeagueClub[] = (tflClubsJson as StateClubJson[]).map((club) =>
    standaloneClubFromJson(club, 'tfl', namingTemplate),
  )
  const ntflStandalone: StateLeagueClub[] = (ntflClubsJson as StateClubJson[]).map((club) =>
    standaloneClubFromJson(club, 'ntfl', namingTemplate),
  )

  const sanflReserves: StateLeagueClub[] = []
  const waflReserves: StateLeagueClub[] = []

  const adelaide = aflClubs['adelaide']
  const portAdelaide = aflClubs['portadelaide']
  const westCoast = aflClubs['westcoast']
  const fremantle = aflClubs['fremantle']

  if (adelaide) sanflReserves.push(makeReservesClub(adelaide, 'sanfl', namingTemplate))
  if (portAdelaide) sanflReserves.push(makeReservesClub(portAdelaide, 'sanfl', namingTemplate))
  if (westCoast) waflReserves.push(makeReservesClub(westCoast, 'wafl', namingTemplate))
  if (fremantle) waflReserves.push(makeReservesClub(fremantle, 'wafl', namingTemplate))

  const vfl = createLeague({
    id: 'vfl',
    defaultName: 'VFL',
    year,
    clubs: vflClubs,
    namingTemplate,
    rounds: 22,
    finalsTeams: 8,
  })
  const sanfl = createLeague({
    id: 'sanfl',
    defaultName: 'SANFL',
    year,
    clubs: [...sanflStandalone, ...sanflReserves],
    namingTemplate,
    rounds: 18,
    finalsTeams: 6,
  })
  const wafl = createLeague({
    id: 'wafl',
    defaultName: 'WAFL',
    year,
    clubs: [...waflStandalone, ...waflReserves],
    namingTemplate,
    rounds: 18,
    finalsTeams: 6,
  })
  const tfl = createLeague({
    id: 'tfl',
    defaultName: 'TFL',
    year,
    clubs: tflStandalone,
    namingTemplate,
    rounds: 14,
    finalsTeams: 4,
  })
  const ntfl = createLeague({
    id: 'ntfl',
    defaultName: 'NTFL',
    year,
    clubs: ntflStandalone,
    namingTemplate,
    rounds: 14,
    finalsTeams: 4,
  })

  const base = { vfl, sanfl, wafl, tfl, ntfl } as Record<StateLeagueId, StateLeague>

  if (!includePathways) {
    return {
      ...base,
      u16: createLeague({
        id: 'u16',
        defaultName: 'U16',
        year,
        clubs: [],
        namingTemplate,
        rounds: 0,
        finalsTeams: 0,
      }),
      u18: createLeague({
        id: 'u18',
        defaultName: 'U18',
        year,
        clubs: [],
        namingTemplate,
        rounds: 0,
        finalsTeams: 0,
      }),
    }
  }

  return {
    ...base,
    ...buildPathwayLeagues(year, namingTemplate),
  }
}

function hashCode(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}
