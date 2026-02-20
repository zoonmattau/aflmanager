import type { Club } from '@/types/club'
import type { LeagueConfig, ExpansionPlan, ExpansionClubData } from '@/types/expansion'
import type { GameSettings, NewsItem } from '@/types/game'
import type { Player } from '@/types/player'
import type { StateLeague, StateLeagueId } from '@/types/stateLeague'
import { SeededRNG } from '@/engine/core/rng'
import { createDefaultCulture } from '@/engine/culture/cultureEngine'
import { createInitialClubIdentity } from '@/engine/clubs/identity'
import { createDefaultGameplan } from '@/engine/gameplan/defaults'
import { generatePlayers } from '@/data/players'
import expansionClubsData from '@/data/expansionClubs.json'

const EXPANSION_CANDIDATES = expansionClubsData as ExpansionClubData[]

type EvolutionCategory =
  | 'expansion'
  | 'competition'
  | 'finals'
  | 'list-rules'
  | 'salary-cap'
  | 'fixture'

export interface AflHouseEvolutionResult {
  settings: GameSettings
  leagueConfig: LeagueConfig
  clubs: Record<string, Club>
  players: Record<string, Player>
  stateLeagues: Record<StateLeagueId, StateLeague> | null
  news: NewsItem[]
}

function buildNews(
  date: string,
  headline: string,
  body: string,
  clubIds: string[] = [],
): NewsItem {
  return {
    id: crypto.randomUUID(),
    date,
    headline,
    body,
    category: 'general',
    clubIds,
    playerIds: [],
  }
}

function inferTier(totalTeams: number): Club['tier'] {
  if (totalTeams >= 20) return 'large'
  if (totalTeams >= 16) return 'medium'
  return 'small'
}

function createExpansionClub(
  data: ExpansionClubData,
  currentYear: number,
  settings: GameSettings,
  totalTeams: number,
): Club {
  const base: Club = {
    id: data.id,
    name: data.name,
    fullName: data.fullName,
    abbreviation: data.abbreviation,
    mascot: data.mascot,
    homeGround: data.homeGround,
    established: currentYear,
    premierships: 0,
    tier: inferTier(totalTeams),
    colors: { ...data.colors },
    facilities: {
      trainingGround: 1,
      gym: 1,
      medicalCentre: 1,
      recoveryPool: 1,
      analysisSuite: 1,
      youthAcademy: 1,
    },
    finances: {
      salaryCap: settings.salaryCapAmount,
      currentSpend: 0,
      revenue: 9_000_000,
      expenses: 8_500_000,
      balance: 6_000_000,
    },
    draftPicks: [],
    gameplan: createDefaultGameplan(),
    tacticalIdentity: 'contested',
    leadership: {
      captainId: null,
      viceCaptainId: null,
      leadershipGroupIds: [],
    },
    culture: createDefaultCulture(),
    aiPersonality: {
      competitiveWindow: 'rebuilding',
      draftPhilosophy: 'high-upside',
      riskTolerance: 'moderate',
      tradeActivity: 'moderate',
    },
    hallOfFame: [],
  }
  base.identity = createInitialClubIdentity(base, currentYear)
  return base
}

function activateExpansionPlan(params: {
  plan: ExpansionPlan
  clubs: Record<string, Club>
  players: Record<string, Player>
  leagueConfig: LeagueConfig
  settings: GameSettings
  newYear: number
  rng: SeededRNG
  news: NewsItem[]
  currentDate: string
}): void {
  const { plan, clubs, players, leagueConfig, settings, newYear, rng, news, currentDate } = params
  const clubData = EXPANSION_CANDIDATES.find((c) => c.id === plan.clubId)
  if (!clubData) return

  if (!clubs[plan.clubId]) {
    clubs[plan.clubId] = createExpansionClub(
      clubData,
      newYear,
      settings,
      Object.keys(clubs).length + 1,
    )
  }

  if (!leagueConfig.activeClubIds.includes(plan.clubId)) {
    leagueConfig.activeClubIds.push(plan.clubId)
  }
  if (leagueConfig.enablePromotionRelegation) {
    const bottomTier = Math.max(1, leagueConfig.tierCount ?? 1)
    if (!leagueConfig.clubTierMap) leagueConfig.clubTierMap = {}
    leagueConfig.clubTierMap[plan.clubId] = bottomTier
    leagueConfig.tierCount = bottomTier
  }
  leagueConfig.totalTeams = leagueConfig.activeClubIds.length

  const existingAtClub = Object.values(players).filter((p) => p.clubId === plan.clubId).length
  if (existingAtClub < 35) {
    const recruits = generatePlayers(plan.clubId, rng.nextInt(1_000, 9_999_999), {
      salaryCapAmount: settings.salaryCapAmount,
      enforceCapCompliance: true,
      competitionStrength: 'afl',
    })
    for (const p of recruits) {
      players[p.id] = p
    }
  }

  plan.status = 'active'
  news.push(buildNews(
    currentDate,
    `AFL House confirms ${clubData.fullName} expansion entry`,
    `${clubData.fullName} will join the AFL competition from ${newYear}. ` +
      `League size increases to ${leagueConfig.totalTeams} teams.`,
    [clubData.id],
  ))
}

function runStateLeagueRestructure(
  stateLeagues: Record<StateLeagueId, StateLeague> | null,
  rng: SeededRNG,
  date: string,
): NewsItem[] {
  if (!stateLeagues) return []
  const eligible = Object.entries(stateLeagues)
    .map(([id, league]) => ({ id: id as StateLeagueId, league }))
    .filter(({ league }) => league.clubs.length > 0)
  if (eligible.length === 0) return []
  const target = rng.pick(eligible)
  const league = target.league
  const actions: Array<'rename-club' | 'expand-contract' | 'realign-divisions'> = ['rename-club', 'expand-contract', 'realign-divisions']
  const action = rng.pick(actions)
  const news: NewsItem[] = []

  if (action === 'rename-club') {
    const club = rng.pick(league.clubs)
    const suffix = rng.pick(['United', 'Athletic', 'District', 'City'])
    const oldName = club.name
    if (!oldName.toLowerCase().includes(suffix.toLowerCase())) {
      club.name = `${oldName} ${suffix}`
      club.abbreviation = club.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
      news.push(buildNews(
        date,
        `AFL House approves ${league.name} rebrand`,
        `${oldName} has been renamed to ${club.name} as part of a governance-driven identity refresh.`,
      ))
    }
  } else if (action === 'expand-contract' && league.clubs.length > 4) {
    if (rng.chance(0.5) && league.clubs.length < 20) {
      const newId = `${league.id}-exp-${Math.max(1, league.history.length + 1)}-${league.clubs.length + 1}`
      const newClub = {
        id: newId,
        name: `${league.name} Select ${league.clubs.length + 1}`,
        abbreviation: `S${(league.clubs.length + 1).toString().padStart(2, '0')}`,
        colors: { primary: '#0f172a', secondary: '#e2e8f0' },
        logoText: 'SEL',
        homeGround: `${league.name} Community Oval`,
        aflAffiliateId: null,
        isAFLReserves: false,
      }
      league.clubs.push(newClub)
      league.divisions[0]?.clubIds.push(newClub.id)
      league.ladder.push({
        clubId: newClub.id,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        percentage: 0,
      })
      news.push(buildNews(
        date,
        `AFL House expands ${league.name}`,
        `${newClub.name} has been added to ${league.name} under governance expansion powers.`,
      ))
    } else {
      const removed = league.clubs.pop()
      if (removed) {
        league.divisions = league.divisions.map((division) => ({
          ...division,
          clubIds: division.clubIds.filter((clubId) => clubId !== removed.id),
        }))
        league.ladder = league.ladder.filter((entry) => entry.clubId !== removed.id)
        news.push(buildNews(
          date,
          `AFL House contracts ${league.name}`,
          `${removed.name} has exited ${league.name} after a governance review.`,
        ))
      }
    }
  } else if (action === 'realign-divisions') {
    const sortedIds = league.clubs.map((club) => club.id).sort((a, b) => a.localeCompare(b))
    const split = Math.ceil(sortedIds.length / 2)
    league.divisions = [
      { id: 'north', name: 'North', clubIds: sortedIds.slice(0, split) },
      { id: 'south', name: 'South', clubIds: sortedIds.slice(split) },
    ]
    const divisionByClub = new Map<string, string>()
    for (const division of league.divisions) {
      for (const clubId of division.clubIds) divisionByClub.set(clubId, division.id)
    }
    league.clubs = league.clubs.map((club) => ({ ...club, divisionId: divisionByClub.get(club.id) }))
    news.push(buildNews(
      date,
      `AFL House realigns ${league.name}`,
      `${league.name} has been split into North and South divisions for next season.`,
    ))
  }

  return news
}

export function runAflHouseEndOfYearEvolution(params: {
  currentYear: number
  currentDate: string
  rngSeed: number
  settings: GameSettings
  leagueConfig: LeagueConfig
  clubs: Record<string, Club>
  players: Record<string, Player>
  stateLeagues: Record<StateLeagueId, StateLeague> | null
}): AflHouseEvolutionResult {
  const { currentYear, currentDate, rngSeed } = params
  const settings: GameSettings = {
    ...params.settings,
    seasonStructure: { ...params.settings.seasonStructure },
    matchRules: { ...params.settings.matchRules },
    ladderPoints: { ...params.settings.ladderPoints },
    listRules: { ...params.settings.listRules },
    realism: { ...params.settings.realism },
    finals: { ...params.settings.finals },
    fixtureSchedule: { ...params.settings.fixtureSchedule, matchSlots: [...params.settings.fixtureSchedule.matchSlots] },
    blockbusters: params.settings.blockbusters.map((b) => ({ ...b })),
  }
  const leagueConfig: LeagueConfig = {
    activeClubIds:
      params.leagueConfig.activeClubIds.length > 0
        ? [...params.leagueConfig.activeClubIds]
        : Object.keys(params.clubs),
    expansionPlans: params.leagueConfig.expansionPlans.map((p) => ({ ...p })),
    totalTeams: params.leagueConfig.totalTeams,
    competitionModel: params.leagueConfig.competitionModel ?? 'single-table',
    conferenceCount: params.leagueConfig.conferenceCount,
    divisionCount: params.leagueConfig.divisionCount,
    enablePromotionRelegation: params.leagueConfig.enablePromotionRelegation ?? false,
    tierCount: params.leagueConfig.tierCount ?? 1,
    promotionRelegationSpots: params.leagueConfig.promotionRelegationSpots ?? 1,
    clubTierMap: { ...(params.leagueConfig.clubTierMap ?? {}) },
  }
  const clubs: Record<string, Club> = { ...params.clubs }
  const players: Record<string, Player> = { ...params.players }
  const stateLeagues: Record<StateLeagueId, StateLeague> | null = params.stateLeagues
    ? (Object.fromEntries(
      Object.entries(params.stateLeagues).map(([leagueId, league]) => [
        leagueId,
        {
          ...league,
          branding: { ...league.branding },
          clubs: league.clubs.map((club) => ({ ...club, colors: { ...club.colors } })),
          divisions: league.divisions.map((division) => ({ ...division, clubIds: [...division.clubIds] })),
          ladderRules: {
            ...league.ladderRules,
            tieBreakers: [...league.ladderRules.tieBreakers],
          },
          fixtureRules: { ...league.fixtureRules },
          finalsRules: { ...league.finalsRules },
          season: {
            ...league.season,
            rounds: league.season.rounds.map((round) => ({
              ...round,
              results: round.results.map((result) => ({ ...result })),
            })),
          },
          ladder: league.ladder.map((entry) => ({ ...entry })),
          history: league.history.map((record) => ({ ...record })),
        } satisfies StateLeague,
      ]),
    ) as Record<StateLeagueId, StateLeague>)
    : null
  const news: NewsItem[] = []
  const rng = new SeededRNG(rngSeed + currentYear * 17713)
  const newYear = currentYear + 1
  leagueConfig.activeClubIds = leagueConfig.activeClubIds.filter((id) => Boolean(clubs[id]))
  leagueConfig.totalTeams = leagueConfig.activeClubIds.length

  if (!settings.realism.aflHouseInterference) {
    return { settings, leagueConfig, clubs, players, stateLeagues, news }
  }

  // Existing expansion plans can mature into AFL entry even in quiet years.
  if (settings.realism.aflHouseExpansionEvolution) {
    for (const plan of leagueConfig.expansionPlans) {
      if (plan.status === 'planned' && plan.aflEntryYear <= newYear) {
        activateExpansionPlan({
          plan,
          clubs,
          players,
          leagueConfig,
          settings,
          newYear,
          rng,
          news,
          currentDate,
        })
      } else if (plan.status === 'active' && newYear - plan.aflEntryYear >= 3) {
        plan.status = 'established'
      }
    }
  }

  // Unlikely yearly chance of AFL House policy evolution.
  if (!rng.chance(0.22)) {
    return { settings, leagueConfig, clubs, players, stateLeagues, news }
  }

  const enabledCategories: EvolutionCategory[] = []
  if (settings.realism.aflHouseExpansionEvolution) enabledCategories.push('expansion')
  if (settings.realism.aflHouseCompetitionEvolution) enabledCategories.push('competition')
  if (settings.realism.aflHouseFinalsEvolution) enabledCategories.push('finals')
  if (settings.realism.aflHouseListRulesEvolution) enabledCategories.push('list-rules')
  if (settings.realism.aflHouseSalaryCapEvolution) enabledCategories.push('salary-cap')
  if (settings.realism.aflHouseFixtureEvolution) enabledCategories.push('fixture')
  if (enabledCategories.length === 0) {
    return { settings, leagueConfig, clubs, players, stateLeagues, news }
  }

  const shuffled = rng.shuffle(enabledCategories)
  const eventCount = Math.min(shuffled.length, rng.chance(0.18) ? 2 : 1)
  const selected = shuffled.slice(0, eventCount)

  for (const category of selected) {
    if (category === 'expansion') {
      const plannedIds = new Set(leagueConfig.expansionPlans.map((p) => p.clubId))
      const candidates = EXPANSION_CANDIDATES.filter(
        (c) => !leagueConfig.activeClubIds.includes(c.id) && !plannedIds.has(c.id),
      )
      if (candidates.length > 0) {
        const candidate = rng.pick(candidates)
        const entryOffset = rng.nextInt(1, 3)
        const entryYear = newYear + entryOffset
        leagueConfig.expansionPlans.push({
          clubId: candidate.id,
          vflEntryYear: entryYear - 1,
          aflEntryYear: entryYear,
          priorityPicksPerYear: 1,
          priorityPickYears: 2,
          salaryCapConcession: 1_200_000,
          salaryCapConcessionYears: 2,
          status: 'planned',
        })
        news.push(buildNews(
          currentDate,
          `AFL House approves ${candidate.fullName} expansion roadmap`,
          `${candidate.fullName} has been approved for staged entry. ` +
            `Target AFL launch year: ${entryYear}.`,
          [candidate.id],
        ))
      }
      continue
    }

    if (category === 'competition') {
      const order: Array<NonNullable<LeagueConfig['competitionModel']>> = ['single-table', 'conferences', 'divisions']
      const current = leagueConfig.competitionModel ?? 'single-table'
      const next = order[(order.indexOf(current) + 1) % order.length]
      leagueConfig.competitionModel = next
      if (next === 'conferences') {
        leagueConfig.conferenceCount = 2
        leagueConfig.divisionCount = undefined
      } else if (next === 'divisions') {
        leagueConfig.divisionCount = leagueConfig.totalTeams >= 20 ? 4 : 2
        leagueConfig.conferenceCount = undefined
      } else {
        leagueConfig.conferenceCount = undefined
        leagueConfig.divisionCount = undefined
      }
      news.push(buildNews(
        currentDate,
        'AFL House announces competition structure review outcome',
        next === 'single-table'
          ? 'League governance has reverted to a single-table model for next season.'
          : next === 'conferences'
            ? 'League governance has shifted to a conference-aligned model for next season.'
            : 'League governance has shifted to a divisional model for next season.',
      ))
      if (rng.chance(0.6)) {
        const restructureNews = runStateLeagueRestructure(stateLeagues, rng, currentDate)
        news.push(...restructureNews)
      }
      continue
    }

    if (category === 'finals') {
      const options: Array<GameSettings['finals']['finalsFormat']> = [
        'afl-top-8',
        'top-6',
        'page-mcintyre-top-4',
        'straight-knockout',
      ]
      const current = settings.finals.finalsFormat
      const candidates = options.filter((f) => f !== current)
      if (candidates.length > 0) {
        const next = rng.pick(candidates)
        settings.finals.finalsFormat = next
        settings.finals.finalsQualifyingTeams =
          next === 'top-6' ? 6 : next === 'page-mcintyre-top-4' ? 4 : 8
        news.push(buildNews(
          currentDate,
          'AFL House updates finals framework',
          `Finals format for ${newYear} has been set to ${next}.`,
        ))
      }
      continue
    }

    if (category === 'list-rules') {
      const oldSenior = settings.listRules.seniorListSize
      const oldRookie = settings.listRules.rookieListSize
      const seniorDelta = rng.pick([-1, 1])
      const rookieDelta = rng.pick([-1, 1])
      settings.listRules.seniorListSize = Math.max(34, Math.min(42, oldSenior + seniorDelta))
      settings.listRules.rookieListSize = Math.max(4, Math.min(8, oldRookie + rookieDelta))
      if (
        settings.listRules.seniorListSize !== oldSenior ||
        settings.listRules.rookieListSize !== oldRookie
      ) {
        news.push(buildNews(
          currentDate,
          'AFL House revises list rules',
          `Senior list limit ${oldSenior} -> ${settings.listRules.seniorListSize}, ` +
            `rookie list limit ${oldRookie} -> ${settings.listRules.rookieListSize} for ${newYear}.`,
        ))
      }
      continue
    }

    if (category === 'salary-cap') {
      const oldCapEnabled = settings.salaryCap
      const oldCap = settings.salaryCapAmount
      if (!oldCapEnabled) {
        settings.salaryCap = true
        settings.salaryCapAmount = 15_500_000
      } else {
        const pct = rng.nextFloat(-0.05, 0.08)
        settings.salaryCapAmount = Math.max(
          8_000_000,
          Math.round((oldCap * (1 + pct)) / 100_000) * 100_000,
        )
      }
      for (const club of Object.values(clubs)) {
        club.finances.salaryCap = settings.salaryCapAmount
      }
      news.push(buildNews(
        currentDate,
        'AFL House updates salary cap policy',
        !oldCapEnabled
          ? `A league salary cap has been introduced at $${settings.salaryCapAmount.toLocaleString()} for ${newYear}.`
          : `Salary cap adjusted from $${oldCap.toLocaleString()} to $${settings.salaryCapAmount.toLocaleString()} for ${newYear}.`,
      ))
      continue
    }

    if (category === 'fixture') {
      const policy = rng.pick(['rounds', 'byes', 'rivalries'] as const)
      if (policy === 'rounds') {
        const minRounds = Math.max(10, leagueConfig.totalTeams - 1)
        const maxRounds = Math.max(minRounds, leagueConfig.totalTeams * 2)
        const oldRounds = settings.seasonStructure.regularSeasonRounds
        const delta = rng.pick([-1, 1])
        settings.seasonStructure.regularSeasonRounds = Math.max(
          minRounds,
          Math.min(maxRounds, oldRounds + delta),
        )
        if (settings.seasonStructure.regularSeasonRounds !== oldRounds) {
          news.push(buildNews(
            currentDate,
            'AFL House tweaks fixture framework',
            `Home-and-away season length set to ${settings.seasonStructure.regularSeasonRounds} rounds for ${newYear}.`,
          ))
        }
      } else if (policy === 'byes') {
        settings.seasonStructure.byeRounds = !settings.seasonStructure.byeRounds
        settings.seasonStructure.byeRoundCount = settings.seasonStructure.byeRounds
          ? Math.max(1, settings.seasonStructure.byeRoundCount)
          : 0
        news.push(buildNews(
          currentDate,
          'AFL House updates bye-round policy',
          settings.seasonStructure.byeRounds
            ? `Bye rounds enabled for ${newYear} with ${settings.seasonStructure.byeRoundCount} bye rounds.`
            : `Bye rounds removed for ${newYear}.`,
        ))
      } else {
        settings.realism.fixtureRivalryScheduling = !settings.realism.fixtureRivalryScheduling
        settings.realism.fixtureBlockbusterBias = !settings.realism.fixtureBlockbusterBias
        news.push(buildNews(
          currentDate,
          'AFL House revises fixture weighting policy',
          `Rivalry scheduling is now ${settings.realism.fixtureRivalryScheduling ? 'enabled' : 'disabled'}; ` +
            `blockbuster weighting is now ${settings.realism.fixtureBlockbusterBias ? 'enabled' : 'disabled'}.`,
        ))
      }
      continue
    }
  }

  return { settings, leagueConfig, clubs, players, stateLeagues, news }
}
