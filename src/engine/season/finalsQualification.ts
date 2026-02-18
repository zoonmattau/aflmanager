/**
 * Finals qualification rules engine.
 *
 * Computes how teams qualify for finals under different competition models
 * (single-table, conferences, divisions) and returns labelling information
 * for UI rendering.
 */

import type { LeagueConfig } from '@/types/expansion'
import type { LadderEntry } from '@/types/season'

export type QualificationType = 'auto' | 'wildcard' | 'double-chance' | 'none'

export interface QualificationSlot {
  /** 0-based ladder position */
  position: number
  type: QualificationType
  /** Display label, e.g. "Conf A #1", "Wildcard", "Top 4 (DC)" */
  label: string
  /** Short badge text for compact display */
  badge: string
  /** Which group this position belongs to (null for single-table) */
  groupName: string | null
}

export interface GroupQualificationRule {
  groupName: string
  groupIndex: number
  clubIds: string[]
  autoSpots: number
}

export interface QualificationRules {
  /** The competition model driving these rules */
  model: 'single-table' | 'conferences' | 'divisions'
  /** Total number of qualifying teams */
  totalQualifying: number
  /** Qualification slots for each ladder position */
  slots: QualificationSlot[]
  /** Group breakdown (empty for single-table) */
  groups: GroupQualificationRule[]
  /** Number of wildcard spots across all groups */
  wildcardSpots: number
  /** How wildcards are selected */
  wildcardRule: string
  /** Whether top-4 get a double-chance advantage */
  hasDoubleChance: boolean
}

/**
 * Distributes clubs into groups (conferences or divisions) based on league config.
 * Since there's no explicit clubConferenceMap in LeagueConfig yet, we distribute
 * clubs evenly across groups based on their order in activeClubIds.
 */
function distributeClubsToGroups(
  activeClubIds: string[],
  groupCount: number,
  groupLabel: string,
): GroupQualificationRule[] {
  const groups: GroupQualificationRule[] = []
  const perGroup = Math.ceil(activeClubIds.length / groupCount)

  for (let g = 0; g < groupCount; g++) {
    const start = g * perGroup
    const end = Math.min(start + perGroup, activeClubIds.length)
    const letter = String.fromCharCode(65 + g) // A, B, C, ...
    groups.push({
      groupName: `${groupLabel} ${letter}`,
      groupIndex: g,
      clubIds: activeClubIds.slice(start, end),
      autoSpots: 0, // computed later
    })
  }
  return groups
}

/**
 * Computes qualification rules given league config and finals settings.
 */
export function computeQualificationRules(
  leagueConfig: LeagueConfig,
  finalsQualifyingTeams: number,
  hasDoubleChance: boolean,
): QualificationRules {
  const model = leagueConfig.competitionModel ?? 'single-table'
  const totalTeams = leagueConfig.activeClubIds.length
  const qualifying = Math.min(finalsQualifyingTeams, totalTeams)

  if (model === 'single-table' || qualifying <= 0) {
    return buildSingleTableRules(qualifying, hasDoubleChance, totalTeams)
  }

  const groupCount = model === 'conferences'
    ? (leagueConfig.conferenceCount ?? 2)
    : (leagueConfig.divisionCount ?? 2)

  if (groupCount <= 1) {
    return buildSingleTableRules(qualifying, hasDoubleChance, totalTeams)
  }

  const groups = distributeClubsToGroups(
    leagueConfig.activeClubIds,
    groupCount,
    model === 'conferences' ? 'Conference' : 'Division',
  )

  // Distribute auto-qualifier spots evenly across groups
  const autoPerGroup = Math.floor(qualifying / groupCount)
  const wildcards = qualifying - (autoPerGroup * groupCount)

  for (const group of groups) {
    group.autoSpots = Math.min(autoPerGroup, group.clubIds.length)
  }

  // Build position slots
  const slots: QualificationSlot[] = []

  // For the overall ladder, we need to label each position
  // Auto qualifiers: top N from each group
  // Wildcards: best remaining teams across all groups
  for (let pos = 0; pos < totalTeams; pos++) {
    if (pos < qualifying) {
      // This position qualifies - but how?
      // In a single merged ladder, we can't directly determine group membership
      // without the actual ladder data. We'll mark generically here.
      const isDoubleChance = hasDoubleChance && pos < 4
      slots.push({
        position: pos,
        type: isDoubleChance ? 'double-chance' : 'auto',
        label: isDoubleChance ? 'Top 4 (Double Chance)' : `Finals #${pos + 1}`,
        badge: isDoubleChance ? 'DC' : `F${pos + 1}`,
        groupName: null,
      })
    } else {
      slots.push({
        position: pos,
        type: 'none',
        label: '',
        badge: '',
        groupName: null,
      })
    }
  }

  const wildcardRule = wildcards > 0
    ? `Top ${autoPerGroup} from each ${model === 'conferences' ? 'conference' : 'division'} auto-qualify. ` +
      `Best ${wildcards} remaining team${wildcards > 1 ? 's' : ''} across all groups earn wildcard spots. ` +
      `Wildcards are decided by ladder points, then percentage, then points for.`
    : `Top ${autoPerGroup} from each ${model === 'conferences' ? 'conference' : 'division'} auto-qualify.`

  return {
    model,
    totalQualifying: qualifying,
    slots,
    groups,
    wildcardSpots: wildcards,
    wildcardRule,
    hasDoubleChance,
  }
}

/**
 * Given an actual sorted ladder + league config, label each ladder entry
 * with its qualification status. This is more accurate than the generic
 * computeQualificationRules because it knows which clubs are in which groups.
 */
export function labelLadderQualification(
  ladder: LadderEntry[],
  leagueConfig: LeagueConfig,
  finalsQualifyingTeams: number,
  hasDoubleChance: boolean,
): QualificationSlot[] {
  const model = leagueConfig.competitionModel ?? 'single-table'
  const qualifying = Math.min(finalsQualifyingTeams, ladder.length)

  if (model === 'single-table' || qualifying <= 0) {
    return labelSingleTable(ladder, qualifying, hasDoubleChance)
  }

  const groupCount = model === 'conferences'
    ? (leagueConfig.conferenceCount ?? 2)
    : (leagueConfig.divisionCount ?? 2)

  if (groupCount <= 1) {
    return labelSingleTable(ladder, qualifying, hasDoubleChance)
  }

  const groupLabel = model === 'conferences' ? 'Conf' : 'Div'
  const groups = distributeClubsToGroups(
    leagueConfig.activeClubIds,
    groupCount,
    groupLabel,
  )

  // Map clubId -> group
  const clubToGroup = new Map<string, GroupQualificationRule>()
  for (const group of groups) {
    for (const cid of group.clubIds) {
      clubToGroup.set(cid, group)
    }
  }

  const autoPerGroup = Math.floor(qualifying / groupCount)
  const wildcardCount = qualifying - (autoPerGroup * groupCount)

  // Track how many auto slots each group has used
  const groupAutoUsed = new Map<string, number>()
  for (const group of groups) {
    groupAutoUsed.set(group.groupName, 0)
  }

  // First pass: assign auto-qualifiers (top N per group by ladder order)
  const autoQualified = new Set<number>() // ladder positions that auto-qualified
  const remainingForWildcard: number[] = [] // ladder positions eligible for wildcard

  for (let i = 0; i < ladder.length; i++) {
    const group = clubToGroup.get(ladder[i].clubId)
    if (!group) continue
    const used = groupAutoUsed.get(group.groupName) ?? 0
    if (used < autoPerGroup) {
      autoQualified.add(i)
      groupAutoUsed.set(group.groupName, used + 1)
    } else {
      remainingForWildcard.push(i)
    }
  }

  // Second pass: assign wildcards (best remaining by ladder position)
  const wildcardPositions = new Set<number>()
  for (let w = 0; w < wildcardCount && w < remainingForWildcard.length; w++) {
    wildcardPositions.add(remainingForWildcard[w])
  }

  // Build slots
  const slots: QualificationSlot[] = []
  const groupPositionCounter = new Map<string, number>()

  for (let i = 0; i < ladder.length; i++) {
    const group = clubToGroup.get(ladder[i].clubId)
    const gn = group?.groupName ?? null

    if (autoQualified.has(i)) {
      const posInGroup = (groupPositionCounter.get(gn ?? '') ?? 0) + 1
      groupPositionCounter.set(gn ?? '', posInGroup)

      const isDoubleChance = hasDoubleChance && i < 4
      slots.push({
        position: i,
        type: isDoubleChance ? 'double-chance' : 'auto',
        label: isDoubleChance
          ? `${gn} #${posInGroup} (Double Chance)`
          : `${gn} #${posInGroup}`,
        badge: isDoubleChance ? 'DC' : `${gn?.split(' ')[1] ?? ''}${posInGroup}`,
        groupName: gn,
      })
    } else if (wildcardPositions.has(i)) {
      const isDoubleChance = hasDoubleChance && i < 4
      slots.push({
        position: i,
        type: isDoubleChance ? 'double-chance' : 'wildcard',
        label: isDoubleChance ? 'Wildcard (Double Chance)' : 'Wildcard',
        badge: isDoubleChance ? 'WC-DC' : 'WC',
        groupName: gn,
      })
    } else {
      slots.push({
        position: i,
        type: 'none',
        label: '',
        badge: '',
        groupName: gn,
      })
    }
  }

  return slots
}

function buildSingleTableRules(
  qualifying: number,
  hasDoubleChance: boolean,
  totalTeams: number,
): QualificationRules {
  const slots: QualificationSlot[] = []
  for (let pos = 0; pos < totalTeams; pos++) {
    if (pos < qualifying) {
      const isDoubleChance = hasDoubleChance && pos < 4
      slots.push({
        position: pos,
        type: isDoubleChance ? 'double-chance' : 'auto',
        label: isDoubleChance ? `#${pos + 1} (Double Chance)` : `#${pos + 1}`,
        badge: isDoubleChance ? 'DC' : `${pos + 1}`,
        groupName: null,
      })
    } else {
      slots.push({
        position: pos,
        type: 'none',
        label: '',
        badge: '',
        groupName: null,
      })
    }
  }
  return {
    model: 'single-table',
    totalQualifying: qualifying,
    slots,
    groups: [],
    wildcardSpots: 0,
    wildcardRule: `Top ${qualifying} teams on the ladder qualify for finals.`,
    hasDoubleChance,
  }
}

function labelSingleTable(
  ladder: LadderEntry[],
  qualifying: number,
  hasDoubleChance: boolean,
): QualificationSlot[] {
  return ladder.map((_, i) => {
    if (i >= qualifying) {
      return { position: i, type: 'none' as const, label: '', badge: '', groupName: null }
    }
    const isDoubleChance = hasDoubleChance && i < 4
    return {
      position: i,
      type: isDoubleChance ? 'double-chance' as const : 'auto' as const,
      label: isDoubleChance ? `#${i + 1} (Double Chance)` : `#${i + 1}`,
      badge: isDoubleChance ? 'DC' : `${i + 1}`,
      groupName: null,
    }
  })
}
