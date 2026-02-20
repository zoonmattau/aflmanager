import type {
  YouthPlayer,
  YouthCompetition,
  YouthCompId,
  YouthPathwayState,
  YouthScoutAssignment,
} from '@/types/youthPathway'
import type { DraftProspect, DraftProspectBackground, Scout } from '@/types/draft'
import type { PlayerAttributes, HiddenAttributes, PlayerPersonality } from '@/types/player'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// All 52 attribute keys
// ---------------------------------------------------------------------------

const ALL_ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

// Proxy → full attribute group mappings
const PROXY_ATTR_GROUPS: Record<
  'athleticism' | 'footballIQ' | 'contested' | 'kicking' | 'marking' | 'goalkicking' | 'workRate' | 'leadership',
  (keyof PlayerAttributes)[]
> = {
  athleticism:  ['speed', 'acceleration', 'endurance', 'agility', 'leap', 'recovery', 'strength'],
  footballIQ:   ['disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure'],
  contested:    ['contested', 'clearance', 'groundBallGet', 'tackling', 'hardness', 'centreBounce', 'boundaryThrowIn', 'stoppage'],
  kicking:      ['kickingEfficiency', 'kickingDistance', 'dropPunt', 'snap', 'handballEfficiency', 'handballDistance', 'handballReceive'],
  marking:      ['markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested', 'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding'],
  goalkicking:  ['goalkicking', 'setShot', 'scoringInstinct', 'insideForward', 'leadingPatterns'],
  workRate:     ['workRate', 'pressure', 'determination', 'consistency', 'teamPlayer'],
  leadership:   ['leadership', 'clutch'],
}

// Ruck-specific overrides
const RUCK_OVERRIDES: Partial<Record<keyof PlayerAttributes, number>> = {
  hitouts: 1.4,
  ruckCreative: 1.3,
  followUp: 1.2,
  centreBounce: 1.3,
  boundaryThrowIn: 1.3,
  stoppage: 1.2,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function mapCompToPathway(comp: YouthCompetition): DraftProspect['pathway'] {
  if (comp.id === 'coates-u18') return 'Coates Talent League'
  if (comp.level === 'school') return 'APS'
  return 'School Football'
}

function mapRegionToU18Team(player: YouthPlayer): DraftProspectBackground['nationalU18Team'] {
  const map: Record<string, DraftProspectBackground['nationalU18Team']> = {
    VIC: 'VIC Metro',
    SA: 'SA',
    WA: 'WA',
    'NSW/ACT': 'NSW/ACT',
    QLD: 'QLD',
    TAS: 'Tasmania',
    NT: 'NT',
  }
  return map[player.region] ?? 'Allies'
}

function expandYouthAttributesToFull(
  youth: YouthPlayer,
  rng: SeededRNG,
): PlayerAttributes {
  // Build a base value for unmapped attrs
  const base = youth.rawTalentScore * 0.4 + rng.nextInt(-8, 8)
  const attrs: Record<keyof PlayerAttributes, number> = {} as Record<keyof PlayerAttributes, number>

  // Initialize all to base
  for (const key of ALL_ATTRIBUTE_KEYS) {
    attrs[key] = clamp(Math.round(base + rng.nextInt(-12, 12)), 20, 80)
  }

  // Fan out each proxy attr to its group
  for (const [proxyAttr, keys] of Object.entries(PROXY_ATTR_GROUPS) as [
    keyof typeof PROXY_ATTR_GROUPS,
    (keyof PlayerAttributes)[]
  ][]) {
    const proxyValue = youth[proxyAttr]
    for (const key of keys) {
      const multiplier = youth.position === 'RK' && key in RUCK_OVERRIDES
        ? RUCK_OVERRIDES[key]!
        : 1.0
      attrs[key] = clamp(Math.round(proxyValue * multiplier + rng.nextInt(-10, 10)), 20, 95)
    }
  }

  // Ruck-specific: hitouts etc boosted separately
  if (youth.position === 'RK') {
    attrs.hitouts = clamp(Math.round(youth.athleticism * 1.1 + youth.contested * 0.3 + rng.nextInt(-8, 8)), 40, 95)
    attrs.ruckCreative = clamp(Math.round(youth.footballIQ * 0.9 + rng.nextInt(-8, 8)), 30, 90)
    attrs.followUp = clamp(Math.round(youth.workRate * 0.9 + rng.nextInt(-8, 8)), 30, 90)
  } else {
    // Non-rucks: scale down ruck attrs
    attrs.hitouts = clamp(Math.round(10 + rng.nextInt(0, 20)), 10, 38)
    attrs.ruckCreative = clamp(Math.round(10 + rng.nextInt(0, 18)), 10, 34)
    attrs.followUp = clamp(Math.round(12 + rng.nextInt(0, 22)), 12, 40)
  }

  return attrs as PlayerAttributes
}

function generateHiddenAttrs(rawTalentScore: number, rng: SeededRNG): HiddenAttributes {
  const ceilingBase = rawTalentScore >= 70 ? 80 : rawTalentScore >= 50 ? 68 : rawTalentScore >= 30 ? 58 : 46
  return {
    potentialCeiling: clamp(ceilingBase + rng.nextInt(-8, 12), 30, 99),
    developmentRate: Math.round(rng.nextFloat(0.6, 1.8) * 100) / 100,
    peakAgeStart: rng.nextInt(24, 28),
    peakAgeEnd: rng.nextInt(27, 33),
    declineRate: Math.round(rng.nextFloat(0.5, 1.8) * 100) / 100,
    injuryProneness: rng.nextInt(5, 80),
    durability: clamp(100 - rng.nextInt(5, 80) + rng.nextInt(-12, 12), 20, 95),
    bigGameModifier: rng.nextInt(-10, 10),
  }
}

function generatePersonality(rng: SeededRNG): PlayerPersonality {
  return {
    ambition: rng.nextInt(20, 95),
    loyalty: rng.nextInt(20, 95),
    professionalism: rng.nextInt(20, 95),
    temperament: rng.nextInt(20, 95),
  }
}

function rawTalentToTier(_rawTalentScore: number, convertScore: number): DraftProspect['tier'] {
  if (convertScore >= 75) return 'elite'
  if (convertScore >= 60) return 'first-round'
  if (convertScore >= 45) return 'second-round'
  return 'late'
}

function pickProjectedPick(tier: DraftProspect['tier'], rng: SeededRNG): number {
  const ranges: Record<DraftProspect['tier'], [number, number]> = {
    elite: [1, 6],
    'first-round': [3, 22],
    'second-round': [18, 45],
    late: [35, 75],
    'rookie-list': [60, 80],
  }
  const [min, max] = ranges[tier]
  return rng.nextInt(min, max)
}

function pickPosition(youth: YouthPlayer): DraftProspect['position'] {
  const secondaryMap: Partial<Record<string, string[]>> = {
    FB: ['BP', 'CHB'],
    BP: ['FB', 'HBF'],
    CHB: ['FB', 'HBF'],
    HBF: ['CHB', 'W'],
    W: ['OM', 'HBF', 'HFF'],
    IM: ['OM', 'HFF'],
    OM: ['IM', 'W'],
    CHF: ['FF', 'HFF'],
    HFF: ['CHF', 'OM'],
    FF: ['CHF', 'FP'],
    FP: ['FF', 'HFF'],
    RK: ['FF', 'CHF'],
  }

  return {
    primary: youth.position as DraftProspect['position']['primary'],
    secondary: (secondaryMap[youth.position as string] ?? []) as DraftProspect['position']['secondary'],
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function convertYouthPlayersToDraftProspects(
  youthPlayers: Record<string, YouthPlayer>,
  competitions: Record<YouthCompId, YouthCompetition>,
  tournaments: YouthPathwayState['tournaments'],
  _existingProspects: DraftProspect[],
  year: number,
  rng: SeededRNG,
): {
  newProspects: DraftProspect[]
  stateLeagueExits: string[]
  retiredIds: string[]
  convertedIds: Record<string, string>
} {
  const newProspects: DraftProspect[] = []
  const stateLeagueExits: string[] = []
  const retiredIds: string[] = []
  const convertedIds: Record<string, string> = {}

  // Eligible: age 18, u18 ageGroup
  const eligible = Object.values(youthPlayers).filter(
    (p) => p.ageGroup === 'u18' && p.age === 18,
  )

  for (const player of eligible) {
    const comp = competitions[player.compId]

    // Tournament bonus
    const inU18Tourney = tournaments.u18?.teams.some(
      (t) => t.playerIds.includes(player.id),
    )

    const convertScore =
      player.rawTalentScore +
      player.seasonStats.standoutGames * 3 +
      (player.seasonStats.avgRating - 5) * 2 +
      (inU18Tourney ? 8 : 0) +
      rng.nextInt(-5, 5)

    if (convertScore >= 45) {
      // Convert to DraftProspect
      const tier = rawTalentToTier(player.rawTalentScore, convertScore)
      const fullAttrs = expandYouthAttributesToFull(player, rng)
      const hiddenAttrs = generateHiddenAttrs(player.rawTalentScore, rng)
      const personality = generatePersonality(rng)
      const position = pickPosition(player)

      const tournamentStats = tournaments.u18?.teams
        .flatMap((t) => Object.entries(t.tournamentStats))
        .find(([id]) => id === player.id)?.[1]

      const background: DraftProspectBackground = {
        schoolSystem: comp?.level === 'school' ? comp.name : '',
        schoolName: '',
        juniorClub: comp?.level !== 'school' ? (comp?.clubs.find((c) => c.id === player.clubId)?.name ?? '') : '',
        scoutingTournament: 'AFL National U18 Championships',
        nationalU18Team: mapRegionToU18Team(player),
        nationalU18Stats: tournamentStats
          ? {
              matches: tournamentStats.gamesPlayed,
              disposalsPerGame: tournamentStats.gamesPlayed > 0
                ? Math.round(tournamentStats.disposals / tournamentStats.gamesPlayed * 10) / 10
                : 0,
              goalsPerGame: tournamentStats.gamesPlayed > 0
                ? Math.round(tournamentStats.goals / tournamentStats.gamesPlayed * 10) / 10
                : 0,
            }
          : { matches: 0, disposalsPerGame: 0, goalsPerGame: 0 },
        stateLeague: null,
        stateLeagueClub: null,
        pathwaySummary: comp ? mapCompToPathway(comp) : 'School Football',
      }

      const prospectId = `prospect-youth-${year}-${player.id}`
      // Pick a sensible archetype/role based on position
      const archetypeByPos: Partial<Record<string, import('@/types/draft').DraftArchetype>> = {
        FB: 'intercept-defender', BP: 'lockdown-defender', HBF: 'rebound-defender',
        CHB: 'intercept-defender', W: 'two-way-wing', IM: 'inside-bull',
        OM: 'outside-runner', RK: 'tap-ruck', HFF: 'lead-up-forward',
        CHF: 'power-forward', FP: 'small-pressure-forward', FF: 'power-forward',
      }
      const roleByPos: Partial<Record<string, import('@/types/draft').DraftRole>> = {
        FB: 'shutdown', BP: 'shutdown', HBF: 'line-breaker', CHB: 'aerial-threat',
        W: 'line-breaker', IM: 'ball-winner', OM: 'line-breaker', RK: 'ruck-craft',
        HFF: 'ground-pressure', CHF: 'contested-mark', FP: 'ground-pressure', FF: 'aerial-threat',
      }

      const prospect: DraftProspect = {
        id: prospectId,
        firstName: player.firstName,
        lastName: player.lastName,
        age: 18,
        region: player.region,
        homeState: player.region === 'NSW/ACT' ? 'NSW' : (player.region as string) as import('@/types/draft').HomeState,
        position,
        archetype: archetypeByPos[player.position] ?? 'outside-runner',
        role: roleByPos[player.position] ?? 'ball-winner',
        height: rng.nextInt(175, 202),
        weight: rng.nextInt(74, 102),
        trueAttributes: fullAttrs,
        hiddenAttributes: hiddenAttrs,
        personality,
        scoutingReports: {},
        projectedPick: pickProjectedPick(tier, rng),
        tier,
        linkedClubId: null,
        linkedType: null,
        pathway: comp ? mapCompToPathway(comp) : 'School Football',
        u18ClubId: comp?.id === 'coates-u18' ? player.clubId : null,
        background,
      }

      newProspects.push(prospect)
      convertedIds[player.id] = prospectId
    } else if (convertScore >= 25 && player.fate === 'state-league') {
      stateLeagueExits.push(player.id)
    } else {
      retiredIds.push(player.id)
    }
  }

  return { newProspects, stateLeagueExits, retiredIds, convertedIds }
}

export function processYouthScoutAssignment(
  _assignment: YouthScoutAssignment,
  scout: Scout,
  comp: YouthCompetition,
  players: Record<string, YouthPlayer>,
  playerClubId: string,
  rng: SeededRNG,
): string[] {
  // Players in this comp who haven't been discovered by this club yet
  const undiscovered = Object.values(players).filter(
    (p) => p.compId === comp.id && !p.discoveredByClubIds.includes(playerClubId),
  )

  if (undiscovered.length === 0) return []

  // Count to discover: based on scout skill
  const discoveryCount = clamp(Math.round(scout.skill / 10 + rng.nextInt(1, 3)), 2, 8)

  // Weight toward higher rawTalentScore (scouts find talent)
  const totalWeight = undiscovered.reduce((s, p) => s + p.rawTalentScore, 0)
  const discovered: string[] = []
  const pool = [...undiscovered]

  for (let i = 0; i < discoveryCount && pool.length > 0; i++) {
    let roll = rng.nextFloat(0, totalWeight)
    let chosen = pool[0]
    for (const p of pool) {
      roll -= p.rawTalentScore
      if (roll <= 0) { chosen = p; break }
    }
    if (chosen) {
      discovered.push(chosen.id)
      pool.splice(pool.indexOf(chosen), 1)
    }
  }

  return discovered
}
