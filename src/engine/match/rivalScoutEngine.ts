/**
 * Rival Scout Engine
 *
 * Analyses the opposition club's tactical identity, gameplan, AI personality,
 * and squad composition to produce:
 *  - Derived tendencies (pressure, tempo, corridor use, tagging, squad age)
 *  - A natural-language scouting report
 *  - A set of deployable counters that feed into the match simulation
 */

import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import { getOverallRating } from '@/engine/player/playerRating'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PressureStyle = 'high' | 'medium' | 'low'
export type TempoStyle = 'fast' | 'balanced' | 'slow'
export type CorridorUse = 'wide' | 'central' | 'balanced'
export type TaggingLikelihood = 'high' | 'medium' | 'low'
export type SquadBalance = 'youth-heavy' | 'veteran-heavy' | 'balanced'

export interface OppositionTendencies {
  pressureStyle: PressureStyle
  tempo: TempoStyle
  corridorUse: CorridorUse
  taggingLikelihood: TaggingLikelihood
  squadBalance: SquadBalance
  /** The player on the opposition's list they're most likely to use as a tagger */
  tagTargetPlayerId: string | null
  /** Top 3 opposition players by overall */
  keyPlayerIds: string[]
}

/**
 * Modifiers applied to the user's club in simulateMatch when the counter is selected.
 * All multipliers are applied on top of the base GameplanModifiers.
 */
export interface ScoutCounterModifier {
  /** Multiply user's inside-50 rate */
  inside50Mult?: number
  /** Multiply user's contested possession rate */
  contestedMult?: number
  /** Multiply user's tackle rate */
  tackleMult?: number
  /** Multiply user's mark rate */
  markMult?: number
  /** Multiply user's accuracy (goal chance) */
  accuracyMult?: number
  /** Multiply user's clearance contribution (applied via possessionBonus) */
  possessionBonus?: number
  /** Multiply opposition's inside-50 rate (applied to their mods) */
  oppInside50Mult?: number
  /** Multiply opposition's contested possession rate */
  oppContestedMult?: number
}

export interface ScoutCounter {
  id: string
  label: string
  description: string
  /** Concrete actions the coach can take */
  actionableSteps: string[]
  /** Which tendency this counter directly addresses */
  targetsTendency: keyof OppositionTendencies
  /** True when the opposition actually displays that tendency */
  isEffective: boolean
  /** Modifiers applied to the match sim when this counter is selected */
  modifier: ScoutCounterModifier
}

export interface ScoutKeyThreat {
  playerId: string
  playerName: string
  position: string
  overall: number
  reason: string
}

export interface RivalScoutReport {
  clubId: string
  clubName: string
  tendencies: OppositionTendencies
  headline: string
  tacticalSummary: string
  keyThreats: ScoutKeyThreat[]
  counters: ScoutCounter[]
}

// ---------------------------------------------------------------------------
// Tendency derivation
// ---------------------------------------------------------------------------

function derivePressureStyle(club: Club): PressureStyle {
  const { tacticalIdentity, gameplan, aiPersonality } = club
  // Defensive and contested identities are naturally high-pressure
  if (tacticalIdentity === 'defensive') return 'high'
  if (tacticalIdentity === 'contested' && gameplan.aggression === 'high') return 'high'
  // Fast-movement rarely sits in a press
  if (tacticalIdentity === 'fast-movement' && gameplan.aggression !== 'high') return 'low'
  // Aggressive personality with pressing defensive line
  if (aiPersonality.riskTolerance === 'aggressive' && gameplan.defensiveLine === 'press') return 'high'
  if (gameplan.aggression === 'high') return 'medium'
  if (gameplan.aggression === 'low') return 'low'
  return 'medium'
}

function deriveTempo(club: Club): TempoStyle {
  const { tacticalIdentity, gameplan } = club
  if (tacticalIdentity === 'stoppage-focused') return 'slow'
  if (tacticalIdentity === 'fast-movement' && gameplan.tempo !== 'slow') return 'fast'
  if (gameplan.tempo === 'fast') return 'fast'
  if (gameplan.tempo === 'slow') return 'slow'
  return 'balanced'
}

function deriveCorridorUse(club: Club): CorridorUse {
  const { tacticalIdentity } = club
  if (tacticalIdentity === 'corridor-heavy') return 'wide'
  if (tacticalIdentity === 'contested' || tacticalIdentity === 'stoppage-focused') return 'central'
  if (tacticalIdentity === 'defensive') return 'central'
  return 'balanced'
}

function deriveTaggingLikelihood(club: Club): TaggingLikelihood {
  const { tacticalIdentity, gameplan, aiPersonality } = club
  if (tacticalIdentity === 'defensive') return 'high'
  if (tacticalIdentity === 'contested' && gameplan.midfieldLine === 'press') return 'high'
  if (aiPersonality.riskTolerance === 'aggressive' && gameplan.aggression === 'high') return 'medium'
  if (gameplan.midfieldLine === 'press') return 'medium'
  return 'low'
}

function deriveSquadBalance(oppPlayers: Player[], oppClubId: string): SquadBalance {
  const clubPlayers = Object.values(oppPlayers)
    .filter((p) => p.clubId === oppClubId)
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
    .slice(0, 22)

  if (clubPlayers.length === 0) return 'balanced'
  const avgAge = clubPlayers.reduce((sum, p) => sum + p.age, 0) / clubPlayers.length
  if (avgAge >= 27) return 'veteran-heavy'
  if (avgAge < 24) return 'youth-heavy'
  return 'balanced'
}

/** Find the best midfielder on the opponent team — their likely tag weapon */
function deriveTagTarget(oppPlayers: Player[], oppClubId: string): string | null {
  const mids = Object.values(oppPlayers)
    .filter((p) => p.clubId === oppClubId && ['W', 'IM', 'OM', 'HBF', 'HFF', 'CHB', 'CHF'].includes(p.position.primary))
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
  return mids[0]?.id ?? null
}

function deriveKeyPlayers(oppPlayers: Player[], oppClubId: string): string[] {
  return Object.values(oppPlayers)
    .filter((p) => p.clubId === oppClubId)
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
    .slice(0, 3)
    .map((p) => p.id)
}

export function deriveOppositionTendencies(
  club: Club,
  allPlayers: Record<string, Player>,
): OppositionTendencies {
  const oppPlayers = Object.values(allPlayers)
  return {
    pressureStyle: derivePressureStyle(club),
    tempo: deriveTempo(club),
    corridorUse: deriveCorridorUse(club),
    taggingLikelihood: deriveTaggingLikelihood(club),
    squadBalance: deriveSquadBalance(oppPlayers, club.id),
    tagTargetPlayerId: deriveTagTarget(oppPlayers, club.id),
    keyPlayerIds: deriveKeyPlayers(oppPlayers, club.id),
  }
}

// ---------------------------------------------------------------------------
// Counter definitions
// ---------------------------------------------------------------------------

interface CounterTemplate {
  id: string
  label: string
  description: string
  actionableSteps: string[]
  targetsTendency: keyof OppositionTendencies
  modifier: ScoutCounterModifier
}

const COUNTER_TEMPLATES: CounterTemplate[] = [
  {
    id: 'handball-circuit',
    label: 'Handball Circuit',
    description: 'Use rapid short handball chains to bypass their pressure and recycle the ball to free players on the flanks.',
    actionableSteps: [
      'Prioritise handballs out of stoppages rather than speculative kicks',
      'Set up two-man banking at every contest to create easy recycles',
      'Use your running half-backs as safety outlets',
    ],
    targetsTendency: 'pressureStyle',
    modifier: {
      inside50Mult: 1.05,
      oppContestedMult: 0.94,
    },
  },
  {
    id: 'tempo-anchor',
    label: 'Tempo Anchor',
    description: 'Slow the game to a deliberate pace. Set shots, long kick-ins, and planned rotations will kill their high-energy system.',
    actionableSteps: [
      'Always accept set shot opportunities rather than playing on',
      'Use long kick-ins and structured set-ups rather than quick hands',
      'Hold the ball at stoppages and control the pace through the centre',
    ],
    targetsTendency: 'tempo',
    modifier: {
      accuracyMult: 1.06,
      possessionBonus: 1,
    },
  },
  {
    id: 'wing-flood',
    label: 'Wing Overload',
    description: 'Deploy extra numbers on the wings to suffocate their corridor switches and cut off their preferred entry paths.',
    actionableSteps: [
      'Station your wing defenders higher to intercept their switches',
      'Push your half-forwards into wide positions to shadow their wingers',
      'Blitz transitions — don\'t let their corridor run develop',
    ],
    targetsTendency: 'corridorUse',
    modifier: {
      markMult: 1.06,
      oppInside50Mult: 0.93,
    },
  },
  {
    id: 'decoy-tag',
    label: 'Decoy the Tag',
    description: 'Pre-plan your star midfielder to play as a decoy — pulling their tagger out of position to free your other on-ballers.',
    actionableSteps: [
      'Move your tagged player to the forward 50 early to drag their tagger forward',
      'Flood the vacated midfield space with your other on-ballers',
      'Look for quick switches back to the tagged player once the tagger is isolated',
    ],
    targetsTendency: 'taggingLikelihood',
    modifier: {
      inside50Mult: 1.07,
      possessionBonus: 1.5,
    },
  },
  {
    id: 'pack-centre',
    label: 'Pack the Centre',
    description: 'Match their central congestion by packing bodies through the corridor and winning the clearance battle at the source.',
    actionableSteps: [
      'Rotate extra midfielders through the stoppage contest',
      'Use your ruck to control tap direction and set up short ball',
      'Flood the defensive corridor to cut off their inside-50 chain',
    ],
    targetsTendency: 'corridorUse',
    modifier: {
      contestedMult: 1.07,
      possessionBonus: 1,
    },
  },
  {
    id: 'exploit-youth',
    label: 'Exploit Inexperience',
    description: 'Bring relentless pressure in big moments — young players crack under sustained intensity and game-defining pressure.',
    actionableSteps: [
      'Push pressure into their back half to force young defenders into decisions',
      'Target their youngest defender in aerial contests',
      'Build early scoreboard pressure to expose their inexperience late in games',
    ],
    targetsTendency: 'squadBalance',
    modifier: {
      tackleMult: 1.07,
      oppContestedMult: 0.95,
    },
  },
  {
    id: 'stifle-veterans',
    label: 'Stifle the Veterans',
    description: 'Deny their experienced core players time and space — limit their decision-making windows and force rushed disposal.',
    actionableSteps: [
      'Assign your hardest-working taggers to their key veterans',
      'Press them immediately off every exit kick',
      'Target their older defenders with high-intensity forward pressure',
    ],
    targetsTendency: 'squadBalance',
    modifier: {
      tackleMult: 1.06,
      oppInside50Mult: 0.94,
    },
  },
]

// ---------------------------------------------------------------------------
// Natural language generation
// ---------------------------------------------------------------------------

const PRESSURE_LABELS: Record<PressureStyle, string> = {
  high: 'intense pressure',
  medium: 'structured pressure',
  low: 'patient possession play',
}

const TEMPO_LABELS: Record<TempoStyle, string> = {
  fast: 'a high-tempo running game',
  balanced: 'a balanced pace',
  slow: 'a slow, deliberate game style',
}

const CORRIDOR_LABELS: Record<CorridorUse, string> = {
  wide: 'wide corridor use and wing switches',
  central: 'through the corridor and central congestion',
  balanced: 'varied corridor patterns',
}

const SQUAD_LABELS: Record<SquadBalance, string> = {
  'veteran-heavy': 'a veteran-laden roster',
  'youth-heavy': 'a youth-heavy squad',
  'balanced': 'a balanced age profile',
}

const TAG_LABELS: Record<TaggingLikelihood, string> = {
  high: 'strong tagging tendencies',
  medium: 'selective use of taggers',
  low: 'minimal tagging',
}

function generateHeadline(club: Club, tendencies: OppositionTendencies): string {
  const { tacticalIdentity } = club
  const identityLabel: Record<string, string> = {
    'fast-movement': 'Speed-and-Space',
    'contested': 'Contested-Beast',
    'defensive': 'Defensive-Lock',
    'stoppage-focused': 'Stoppage-Dominator',
    'corridor-heavy': 'Corridor-Master',
  }
  return `${club.name}: ${identityLabel[tacticalIdentity] ?? 'Unknown'} system with ${PRESSURE_LABELS[tendencies.pressureStyle]}`
}

function generateTacticalSummary(club: Club, tendencies: OppositionTendencies): string {
  const parts: string[] = []
  parts.push(
    `${club.name} operate ${TEMPO_LABELS[tendencies.tempo]}, preferring to move the ball ${CORRIDOR_LABELS[tendencies.corridorUse]}.`,
  )
  parts.push(
    `They apply ${PRESSURE_LABELS[tendencies.pressureStyle]} and typically employ ${TAG_LABELS[tendencies.taggingLikelihood]}.`,
  )
  parts.push(
    `Their list is built around ${SQUAD_LABELS[tendencies.squadBalance]}, which shapes their selection and big-game approach.`,
  )
  const windowLabel: Record<string, string> = {
    'win-now': 'are firmly in flag contention mode',
    'balanced': 'are balancing short-term results with development',
    'rebuilding': 'are prioritising future seasons over immediate wins',
  }
  parts.push(
    `Club leadership ${windowLabel[club.aiPersonality.competitiveWindow] ?? 'have a mixed agenda'}, so expect ${
      club.aiPersonality.competitiveWindow === 'win-now' ? 'a fully committed, no-excuses game plan' : 'some experimentation in selection and tactics'
    }.`,
  )
  return parts.join(' ')
}

function generateKeyThreats(
  club: Club,
  keyPlayerIds: string[],
  allPlayers: Record<string, Player>,
): ScoutKeyThreat[] {
  return keyPlayerIds
    .map((id) => allPlayers[id])
    .filter(Boolean)
    .map((p) => {
      const ovr = getOverallRating(p)
      const pos = p.position.primary
      let reason = `${ovr} OVR ${pos} who is ${club.name}'s most dangerous weapon`
      if (['FF', 'CHF', 'FP'].includes(pos)) reason = `Elite forward (${ovr} OVR) — limit their entries and he'll hurt you`
      else if (['RK'].includes(pos)) reason = `Dominant ruck (${ovr} OVR) — control the hitout and you control the game`
      else if (['W', 'IM', 'OM'].includes(pos)) reason = `High-volume midfielder (${ovr} OVR) — a key neutralisation target`
      else if (['FB', 'BP', 'HBF', 'CHB'].includes(pos)) reason = `Intercept defender (${ovr} OVR) — avoid speculative kicks into their zone`
      return {
        playerId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        position: pos,
        overall: ovr,
        reason,
      }
    })
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateRivalScoutReport(
  oppClub: Club,
  allPlayers: Record<string, Player>,
): RivalScoutReport {
  const tendencies = deriveOppositionTendencies(oppClub, allPlayers)

  // Build counters with effectiveness flags
  // Filter: only show counters relevant to this opponent, including at most
  // one per tendency; always show 5 options.
  const templatePool = [...COUNTER_TEMPLATES]

  // Mark pack-centre vs wing-flood based on which is relevant for corridor use
  const counters: ScoutCounter[] = templatePool
    .filter((t) => {
      // Exclude stifle-veterans if not veteran-heavy; exclude exploit-youth if not youth-heavy
      if (t.id === 'stifle-veterans' && tendencies.squadBalance !== 'veteran-heavy') return false
      if (t.id === 'exploit-youth' && tendencies.squadBalance !== 'youth-heavy') return false
      // Exclude pack-centre if wing-flood is more relevant (wide corridor)
      if (t.id === 'pack-centre' && tendencies.corridorUse === 'wide') return false
      // Exclude wing-flood if pack-centre is more relevant (central)
      if (t.id === 'wing-flood' && tendencies.corridorUse === 'central') return false
      return true
    })
    .slice(0, 6)
    .map((t) => {
      let isEffective = false
      switch (t.targetsTendency) {
        case 'pressureStyle': isEffective = tendencies.pressureStyle === 'high'; break
        case 'tempo': isEffective = tendencies.tempo === 'fast'; break
        case 'corridorUse':
          if (t.id === 'wing-flood') isEffective = tendencies.corridorUse === 'wide'
          else if (t.id === 'pack-centre') isEffective = tendencies.corridorUse === 'central'
          break
        case 'taggingLikelihood': isEffective = tendencies.taggingLikelihood === 'high'; break
        case 'squadBalance':
          if (t.id === 'exploit-youth') isEffective = tendencies.squadBalance === 'youth-heavy'
          if (t.id === 'stifle-veterans') isEffective = tendencies.squadBalance === 'veteran-heavy'
          break
      }
      return { ...t, isEffective }
    })

  return {
    clubId: oppClub.id,
    clubName: oppClub.name,
    tendencies,
    headline: generateHeadline(oppClub, tendencies),
    tacticalSummary: generateTacticalSummary(oppClub, tendencies),
    keyThreats: generateKeyThreats(oppClub, tendencies.keyPlayerIds, allPlayers),
    counters,
  }
}

// ---------------------------------------------------------------------------
// Apply counter modifiers to GameplanModifiers
// ---------------------------------------------------------------------------

import type { GameplanModifiers } from '@/engine/match/simulateMatch'

export function applyScoutCounterToMods(
  userMods: GameplanModifiers,
  oppMods: GameplanModifiers,
  counterId: string,
  tendencies: OppositionTendencies,
): { userMods: GameplanModifiers; oppMods: GameplanModifiers } {
  const template = COUNTER_TEMPLATES.find((t) => t.id === counterId)
  if (!template) return { userMods, oppMods }

  // Full modifier when the counter correctly reads the tendency,
  // 50% benefit when used regardless (scouting always has some value)
  let effectiveness = 0.5
  switch (template.targetsTendency) {
    case 'pressureStyle': if (tendencies.pressureStyle === 'high') effectiveness = 1.0; break
    case 'tempo': if (tendencies.tempo === 'fast') effectiveness = 1.0; break
    case 'corridorUse':
      if (template.id === 'wing-flood' && tendencies.corridorUse === 'wide') effectiveness = 1.0
      if (template.id === 'pack-centre' && tendencies.corridorUse === 'central') effectiveness = 1.0
      break
    case 'taggingLikelihood': if (tendencies.taggingLikelihood === 'high') effectiveness = 1.0; break
    case 'squadBalance':
      if (template.id === 'exploit-youth' && tendencies.squadBalance === 'youth-heavy') effectiveness = 1.0
      if (template.id === 'stifle-veterans' && tendencies.squadBalance === 'veteran-heavy') effectiveness = 1.0
      break
  }

  const m = template.modifier
  const lerp = (base: number, target: number, t: number) => base + (target - base) * t

  const nextUser: GameplanModifiers = {
    ...userMods,
    inside50Mult: m.inside50Mult ? lerp(userMods.inside50Mult, userMods.inside50Mult * m.inside50Mult, effectiveness) : userMods.inside50Mult,
    contestedMult: m.contestedMult ? lerp(userMods.contestedMult, userMods.contestedMult * m.contestedMult, effectiveness) : userMods.contestedMult,
    tackleMult: m.tackleMult ? lerp(userMods.tackleMult, userMods.tackleMult * m.tackleMult, effectiveness) : userMods.tackleMult,
    markMult: m.markMult ? lerp(userMods.markMult, userMods.markMult * m.markMult, effectiveness) : userMods.markMult,
    accuracyMult: m.accuracyMult ? lerp(userMods.accuracyMult, userMods.accuracyMult * m.accuracyMult, effectiveness) : userMods.accuracyMult,
    possessionBonus: m.possessionBonus ? userMods.possessionBonus + m.possessionBonus * effectiveness : userMods.possessionBonus,
  }
  const nextOpp: GameplanModifiers = {
    ...oppMods,
    inside50Mult: m.oppInside50Mult ? lerp(oppMods.inside50Mult, oppMods.inside50Mult * m.oppInside50Mult, effectiveness) : oppMods.inside50Mult,
    contestedMult: m.oppContestedMult ? lerp(oppMods.contestedMult, oppMods.contestedMult * m.oppContestedMult, effectiveness) : oppMods.contestedMult,
  }
  return { userMods: nextUser, oppMods: nextOpp }
}
