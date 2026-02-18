import type { Club } from '@/types/club'
import type { CustomLeagueTemplate, CustomLeagueTeam } from '@/types/customLeague'
import type { GameSettings } from '@/types/game'
import type { LeagueConfig } from '@/types/expansion'
import { createDefaultSettings } from '@/engine/core/defaultSettings'
import { createDefaultCulture } from '@/engine/culture/cultureEngine'
import { createInitialClubIdentity } from '@/engine/clubs/identity'
import { createDefaultGameplan } from '@/engine/gameplan/defaults'

function inferTier(teamCount: number): Club['tier'] {
  if (teamCount >= 20) return 'large'
  if (teamCount >= 14) return 'medium'
  return 'small'
}

function toClub(team: CustomLeagueTeam, teamCount: number): Club {
  const teamFinances = team.finances ?? { revenue: 12_000_000, expenses: 9_500_000, balance: 8_000_000 }
  const club: Club = {
    id: team.id,
    name: team.name,
    fullName: team.fullName,
    abbreviation: team.abbreviation,
    mascot: team.mascot,
    logoUrl: team.logoUrl,
    homeGround: team.homeVenue,
    established: team.established,
    premierships: 0,
    tier: team.tier ?? inferTier(teamCount),
    colors: { ...team.colors },
    facilities: {
      trainingGround: 3,
      gym: 3,
      medicalCentre: 3,
      recoveryPool: 3,
      analysisSuite: 3,
      youthAcademy: 3,
    },
    finances: {
      salaryCap: 18_300_000,
      currentSpend: 0,
      revenue: teamFinances.revenue,
      expenses: teamFinances.expenses,
      balance: teamFinances.balance,
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
      competitiveWindow: 'balanced',
      draftPhilosophy: 'best-available',
      riskTolerance: 'moderate',
      tradeActivity: 'moderate',
    },
    hallOfFame: [],
    notes: team.notes,
    secondaryHomeGrounds: team.secondaryHomeGrounds ? [...team.secondaryHomeGrounds] : undefined,
    guernseyStyle: team.guernseyStyle ? { ...team.guernseyStyle } : undefined,
    rivalryClubIds: team.rivalryClubIds ? [...team.rivalryClubIds] : undefined,
    fanSatisfaction: team.fanSatisfaction ?? 50,
  }
  club.identity = createInitialClubIdentity(club, 2026)
  return club
}

export function buildClubsFromTemplate(template: CustomLeagueTemplate): Club[] {
  return template.teams.map((team) => toClub(team, template.teams.length))
}

export function buildSettingsFromTemplate(template: CustomLeagueTemplate): GameSettings {
  const defaults = createDefaultSettings()
  const settings: GameSettings = {
    ...defaults,
    leagueMode: 'custom',
    teamCount: template.teams.length,
    seasonStructure: {
      ...defaults.seasonStructure,
      regularSeasonRounds: template.fixtureRules.roundCount,
      byeRounds: template.fixtureRules.byeRounds,
      byeRoundCount: template.fixtureRules.byeRoundCount,
    },
    ladderPoints: {
      ...defaults.ladderPoints,
      pointsForWin: template.ladderRules.pointsForWin,
      pointsForDraw: template.ladderRules.pointsForDraw,
      pointsForLoss: template.ladderRules.pointsForLoss,
    },
    finals: {
      ...defaults.finals,
      finalsFormat: template.finalsRules.finalsFormat,
      finalsQualifyingTeams: template.finalsRules.finalsTeams,
      customFinalsFormat: template.finalsRules.customFinalsFormat,
    },
    realism: {
      ...defaults.realism,
      fixtureRivalryScheduling: template.fixtureRules.enforceRivalries,
    },
    ladderSorting: {
      primary: template.ladderRules.primarySort,
      tieBreakers: [...template.ladderRules.tieBreakers],
    },
    fixturePolicy: {
      homeAwayBalance: template.fixtureRules.enforceHomeAwayBalance,
      travelWeighting: template.fixtureRules.travelWeighting,
      venueSharingRules: template.fixtureRules.venueSharingRules,
    },
    customRivalryPairs: [...template.rivalries],
  }
  return settings
}

export function buildLeagueConfigFromTemplate(template: CustomLeagueTemplate): LeagueConfig {
  const activeClubIds = template.teams.map((t) => t.id)
  const tierCount = template.structure.enablePromotionRelegation
    ? Math.max(1, template.structure.tierCount)
    : 1
  const clubTierMap: Record<string, number> = {}
  if (tierCount > 1) {
    const split = Math.ceil(activeClubIds.length / tierCount)
    for (let i = 0; i < activeClubIds.length; i++) {
      clubTierMap[activeClubIds[i]] = Math.min(tierCount, Math.floor(i / split) + 1)
    }
  } else {
    for (const id of activeClubIds) clubTierMap[id] = 1
  }

  return {
    activeClubIds,
    expansionPlans: [],
    competitionModel: template.structure.model,
    conferenceCount:
      template.structure.model === 'conferences' ? template.structure.conferenceCount : undefined,
    divisionCount:
      template.structure.model === 'divisions'
        ? template.structure.conferenceCount * template.structure.divisionsPerConference
        : undefined,
    enablePromotionRelegation: template.structure.enablePromotionRelegation,
    tierCount,
    promotionRelegationSpots: Math.max(0, template.structure.promotionRelegationSpots),
    clubTierMap,
    totalTeams: template.teams.length,
  }
}
