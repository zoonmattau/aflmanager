/**
 * applyBrandingPack
 *
 * Converts a BrandingPack (and optional team-count override) into a fully
 * populated CustomLeagueTemplate, ready to be loaded into the
 * CustomLeagueBuilderPage and optionally saved via AppStore.
 */
import type { BrandingPack, BrandingPackTeam } from '@/types/brandingPack'
import type {
  CustomLeagueTemplate,
  CustomLeagueTeam,
  CustomLeagueStructure,
} from '@/types/customLeague'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function packTeamToCustomTeam(pt: BrandingPackTeam): CustomLeagueTeam {
  return {
    id: pt.id,
    name: pt.name,
    fullName: pt.fullName,
    abbreviation: pt.abbreviation,
    mascot: pt.mascot,
    homeVenue: pt.homeVenue,
    established: pt.established,
    tier: pt.tier,
    colors: { ...pt.colors },
    guernseyStyle: pt.guernseyStyle,
    rivalryClubIds: [], // filled in a second pass
    notes: pt.notes ?? '',
    secondaryHomeGrounds: [],
    finances: { revenue: 12_000_000, expenses: 9_500_000, balance: 2_500_000 },
    fanSatisfaction: 55,
  }
}

/** Auto-distribute teams into conference/division groups as evenly as possible. */
function buildGroupAssignments(
  teams: CustomLeagueTeam[],
  structure: CustomLeagueStructure,
): Record<string, string> | undefined {
  if (structure.model === 'single-table') return undefined

  const groupIds: string[] = []
  if (structure.model === 'conferences') {
    for (let c = 1; c <= structure.conferenceCount; c++) {
      groupIds.push(`conf-${c}`)
    }
  } else {
    for (let c = 1; c <= structure.conferenceCount; c++) {
      for (let d = 1; d <= structure.divisionsPerConference; d++) {
        groupIds.push(`conf-${c}-div-${d}`)
      }
    }
  }

  const assignments: Record<string, string> = {}
  teams.forEach((team, i) => {
    assignments[team.id] = groupIds[i % groupIds.length]
  })
  return assignments
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ApplyBrandingPackOptions {
  /**
   * How many teams to include from the pack. Clamped to pack.minTeams–maxTeams.
   * Defaults to pack.recommendedTeamCount.
   */
  teamCount?: number
  /**
   * Optional name for the resulting template. Defaults to "{pack.name} League".
   */
  templateName?: string
}

export function applyBrandingPack(
  pack: BrandingPack,
  options: ApplyBrandingPackOptions = {},
): CustomLeagueTemplate {
  const teamCount = Math.min(
    pack.maxTeams,
    Math.max(pack.minTeams, options.teamCount ?? pack.recommendedTeamCount),
  )

  // Slice teams — the pack orders them from "highest profile" first so that
  // a reduced count still produces a well-balanced set.
  const selectedPackTeams = pack.teams.slice(0, teamCount)
  const selectedIds = new Set(selectedPackTeams.map((t) => t.id))

  // Convert to CustomLeagueTeam (first pass, no rivalries yet)
  const teams: CustomLeagueTeam[] = selectedPackTeams.map(packTeamToCustomTeam)

  // Second pass — wire up rivalry IDs (only within the selected set)
  const teamMap = new Map(teams.map((t) => [t.id, t]))
  for (const pt of selectedPackTeams) {
    const team = teamMap.get(pt.id)!
    team.rivalryClubIds = pt.rivalIds.filter((rid) => selectedIds.has(rid))
  }

  // Build rivalries array (deduplicated pairs)
  const seen = new Set<string>()
  const rivalries: Array<[string, string]> = []
  for (const team of teams) {
    for (const rid of team.rivalryClubIds ?? []) {
      const key = [team.id, rid].sort().join('::')
      if (!seen.has(key)) {
        seen.add(key)
        rivalries.push([team.id, rid])
      }
    }
  }

  // Build structure
  const divisionsPerConference = pack.defaults.model === 'divisions' ? 2 : 1
  const structure: CustomLeagueStructure = {
    model: pack.defaults.model,
    conferenceCount: pack.defaults.conferenceCount,
    divisionsPerConference,
    teamsPerDivision: Math.ceil(teamCount / pack.defaults.conferenceCount),
    tierCount: 1,
    enablePromotionRelegation: pack.id === 'state-league',
    promotionRelegationSpots: pack.id === 'state-league' ? 2 : 1,
  }
  structure.groupAssignments = buildGroupAssignments(teams, structure)

  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    name: options.templateName ?? `${pack.name} League`,
    description: pack.tagline,
    createdAt: now,
    lastModified: now,
    teams,
    rivalries,
    structure,
    ladderRules: { ...pack.defaults.ladderRules },
    fixtureRules: {
      ...pack.defaults.fixtureRules,
      // Adjust round count for non-standard team counts
      roundCount: teamCount % 2 === 0
        ? Math.max(pack.defaults.fixtureRules.roundCount, teamCount - 1)
        : pack.defaults.fixtureRules.roundCount,
    },
    finalsRules: { ...pack.defaults.finalsRules },
  }
}
