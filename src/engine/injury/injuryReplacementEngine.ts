/**
 * Injury Replacement Puzzle Engine
 * ---------------------------------
 * When a key user-club player is injured, this engine generates a "tactical
 * problem card" that identifies what the team is losing and offers four
 * concrete replacement pathways with stat-driven player suggestions.
 *
 * Consequences are applied to the selected player when the user resolves a
 * puzzle (form/fatigue deltas, emergency eligibility grants).
 */

import type { Player, PlayerPositionType } from '@/types/player'
import type {
  InjuryReplacementPuzzle,
  ReplacementPathway,
  ReplacementPathwayType,
} from '@/types/game'
import { getOverallRating } from '@/engine/player/playerRating'

// ── Key attribute groups per position ────────────────────────────────────────

interface AttrEntry {
  attr: keyof Player['attributes']
  label: string
}

const KEY_ATTRS_BY_POSITION: Partial<Record<PlayerPositionType, AttrEntry[]>> = {
  RK:  [
    { attr: 'hitouts',      label: 'Hitouts' },
    { attr: 'ruckCreative', label: 'Ruck Creative' },
    { attr: 'followUp',     label: 'Follow Up' },
    { attr: 'contested',    label: 'Contested' },
    { attr: 'centreBounce', label: 'Centre Bounce' },
  ],
  FF:  [
    { attr: 'goalkicking',     label: 'Goalkicking' },
    { attr: 'scoringInstinct', label: 'Scoring Instinct' },
    { attr: 'markingOverhead', label: 'Overhead Mark' },
    { attr: 'markingContested',label: 'Contested Mark' },
    { attr: 'setShot',         label: 'Set Shot' },
  ],
  CHF: [
    { attr: 'goalkicking',     label: 'Goalkicking' },
    { attr: 'scoringInstinct', label: 'Scoring Instinct' },
    { attr: 'markingContested',label: 'Contested Mark' },
    { attr: 'leadingPatterns', label: 'Leading Patterns' },
    { attr: 'insideForward',   label: 'Inside Forward' },
  ],
  HFF: [
    { attr: 'speed',            label: 'Speed' },
    { attr: 'fieldKicking',     label: 'Field Kicking' },
    { attr: 'disposalDecision', label: 'Disposal Decision' },
    { attr: 'insideForward',    label: 'Inside Forward' },
    { attr: 'groundBallGet',    label: 'Ground Ball Get' },
  ],
  FP:  [
    { attr: 'snap',            label: 'Snap' },
    { attr: 'pressure',        label: 'Pressure' },
    { attr: 'groundBallGet',   label: 'Ground Ball Get' },
    { attr: 'insideForward',   label: 'Inside Forward' },
    { attr: 'agility',         label: 'Agility' },
  ],
  IM:  [
    { attr: 'clearance',      label: 'Clearance' },
    { attr: 'contested',      label: 'Contested' },
    { attr: 'groundBallGet',  label: 'Ground Ball Get' },
    { attr: 'pressure',       label: 'Pressure' },
    { attr: 'hardness',       label: 'Hardness' },
  ],
  OM:  [
    { attr: 'speed',            label: 'Speed' },
    { attr: 'disposalDecision', label: 'Disposal Decision' },
    { attr: 'fieldKicking',     label: 'Field Kicking' },
    { attr: 'creativity',       label: 'Creativity' },
    { attr: 'acceleration',     label: 'Acceleration' },
  ],
  W:   [
    { attr: 'speed',            label: 'Speed' },
    { attr: 'endurance',        label: 'Endurance' },
    { attr: 'disposalDecision', label: 'Disposal Decision' },
    { attr: 'fieldKicking',     label: 'Field Kicking' },
    { attr: 'workRate',         label: 'Work Rate' },
  ],
  CHB: [
    { attr: 'oneOnOne',        label: 'One-On-One' },
    { attr: 'intercept',       label: 'Intercept' },
    { attr: 'zonalAwareness',  label: 'Zonal Awareness' },
    { attr: 'rebounding',      label: 'Rebounding' },
    { attr: 'markingContested',label: 'Contested Mark' },
  ],
  HBF: [
    { attr: 'intercept',        label: 'Intercept' },
    { attr: 'rebounding',       label: 'Rebounding' },
    { attr: 'speed',            label: 'Speed' },
    { attr: 'disposalDecision', label: 'Disposal Decision' },
    { attr: 'fieldKicking',     label: 'Field Kicking' },
  ],
  FB:  [
    { attr: 'oneOnOne',        label: 'One-On-One' },
    { attr: 'spoiling',        label: 'Spoiling' },
    { attr: 'zonalAwareness',  label: 'Zonal Awareness' },
    { attr: 'intercept',       label: 'Intercept' },
    { attr: 'strength',        label: 'Strength' },
  ],
  BP:  [
    { attr: 'intercept',       label: 'Intercept' },
    { attr: 'rebounding',      label: 'Rebounding' },
    { attr: 'spoiling',        label: 'Spoiling' },
    { attr: 'oneOnOne',        label: 'One-On-One' },
    { attr: 'workRate',        label: 'Work Rate' },
  ],
}

const POSITION_GROUP_LABEL: Record<PlayerPositionType, string> = {
  BP:  'Back Pocket',
  FB:  'Full Back',
  HBF: 'Half Back Flanker',
  CHB: 'Centre Half Back',
  W:   'Wingman',
  IM:  'Inside Midfielder',
  OM:  'Outside Midfielder',
  RK:  'Ruckman',
  HFF: 'Half Forward Flanker',
  CHF: 'Centre Half Forward',
  FP:  'Forward Pocket',
  FF:  'Full Forward',
}

// Positions that share enough attribute overlap to be "same line"
const POSITION_LINE_GROUP: Record<PlayerPositionType, PlayerPositionType[]> = {
  BP:  ['BP', 'HBF', 'FB'],
  FB:  ['FB', 'BP', 'CHB'],
  HBF: ['HBF', 'BP', 'CHB'],
  CHB: ['CHB', 'HBF', 'FB'],
  W:   ['W', 'OM', 'HFF'],
  IM:  ['IM', 'OM', 'W'],
  OM:  ['OM', 'IM', 'W'],
  RK:  ['RK'],
  HFF: ['HFF', 'W', 'OM', 'FP'],
  CHF: ['CHF', 'FF', 'HFF'],
  FP:  ['FP', 'HFF', 'CHF'],
  FF:  ['FF', 'CHF', 'FP'],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAttrEntries(pos: PlayerPositionType): AttrEntry[] {
  return KEY_ATTRS_BY_POSITION[pos] ?? KEY_ATTRS_BY_POSITION['IM']!
}

function attrScore(player: Player, attrs: AttrEntry[]): number {
  const sum = attrs.reduce((acc, { attr }) => acc + (player.attributes[attr] ?? 50), 0)
  return sum / attrs.length
}

function getStatusLabel(player: Player, allClubPlayers: Player[]): string {
  const rating = getOverallRating(player)
  const pos = player.position.primary
  const samePos = allClubPlayers.filter(
    (p) => p.id !== player.id && p.position.primary === pos && !p.injury
  )
  if (samePos.length === 0) return `Only ${pos} — critical`
  const rank = samePos.filter((p) => getOverallRating(p) > rating).length
  if (rank === 0) return `First-choice ${pos}`
  if (rank === 1) return `Second-choice ${pos}`
  return `Squad depth ${pos}`
}

function getMatchupValue(player: Player): number {
  const rating = getOverallRating(player)
  const form = player.form ?? 50
  return Math.min(100, Math.round(rating * 0.65 + form * 0.35))
}

// ── Pathway factories ─────────────────────────────────────────────────────────

function buildLikeForLikePathway(
  injuredPlayer: Player,
  candidates: Player[],
): ReplacementPathway {
  const attrs = getAttrEntries(injuredPlayer.position.primary)
  const samePositionCandidates = candidates.filter(
    (p) => p.position.primary === injuredPlayer.position.primary
      || (p.position.secondary ?? []).includes(injuredPlayer.position.primary)
  )
  const pool = samePositionCandidates.length > 0 ? samePositionCandidates : candidates
  const best = pool
    .map((p) => ({ player: p, score: attrScore(p, attrs) }))
    .sort((a, b) => b.score - a.score)[0]

  return {
    type: 'like-for-like',
    label: 'Like-for-Like',
    description: 'Direct replacement — find the closest attribute match at the same position.',
    suggestedPlayerId: best?.player.id ?? null,
    consequences: {
      formDelta: -3,
      fatigueDelta: 2,
      cohesionPenalty: 0.04,
      upsidePotential: 0,
      roleNote: best
        ? `${best.player.firstName} ${best.player.lastName} slides into the ${injuredPlayer.position.primary} role.`
        : 'No direct positional match found.',
    },
  }
}

function buildStructureShiftPathway(
  injuredPlayer: Player,
  candidates: Player[],
): ReplacementPathway {
  const lineGroup = POSITION_LINE_GROUP[injuredPlayer.position.primary]
  const lineCandidates = candidates.filter(
    (p) => lineGroup.includes(p.position.primary) && p.position.primary !== injuredPlayer.position.primary
  )
  const attrs = getAttrEntries(injuredPlayer.position.primary)
  const pool = lineCandidates.length > 0 ? lineCandidates : candidates
  const best = pool
    .map((p) => ({ player: p, score: attrScore(p, attrs) - 8 })) // offset for out-of-pos
    .sort((a, b) => b.score - a.score)[0]

  return {
    type: 'structure-shift',
    label: 'Structure Shift',
    description: 'Adjust the game plan — move a player from a related role to fill the gap.',
    suggestedPlayerId: best?.player.id ?? null,
    consequences: {
      formDelta: -5,
      fatigueDelta: 5,
      cohesionPenalty: 0.08,
      upsidePotential: 0,
      roleNote: best
        ? `${best.player.firstName} ${best.player.lastName} shifts from ${best.player.position.primary} — structure disruption expected.`
        : 'No nearby line player available.',
    },
  }
}

function buildYouthPromotionPathway(
  injuredPlayer: Player,
  candidates: Player[],
): ReplacementPathway {
  const youthCandidates = candidates.filter((p) => p.age <= 23)
  const attrs = getAttrEntries(injuredPlayer.position.primary)
  const pool = youthCandidates.length > 0 ? youthCandidates : candidates.filter((p) => p.age <= 25)
  const best = pool
    .map((p) => ({ player: p, score: attrScore(p, attrs) + (p.hiddenAttributes?.developmentRate ?? 1) * 5 }))
    .sort((a, b) => b.score - a.score)[0]

  const hasYouth = pool.length > 0

  return {
    type: 'youth-promotion',
    label: 'Youth Promotion',
    description: 'Give a developing player their shot — higher risk, higher ceiling.',
    suggestedPlayerId: best?.player.id ?? null,
    consequences: {
      formDelta: -2,
      fatigueDelta: 3,
      cohesionPenalty: 0.05,
      upsidePotential: hasYouth ? 0.10 : 0.04,
      roleNote: best
        ? `${best.player.firstName} ${best.player.lastName} (age ${best.player.age}) gets a breakout opportunity.`
        : 'No young players available for promotion.',
    },
  }
}

function buildEmergencyCoveragePathway(
  injuredPlayer: Player,
  candidates: Player[],
): ReplacementPathway {
  // Find a player who has secondary eligibility near this position OR is a utility
  const targetPos = injuredPlayer.position.primary
  const attrs = getAttrEntries(targetPos)
  const emergencyPool = candidates.filter(
    (p) => p.preferredRole === 'utility'
      || (p.position.secondary ?? []).length >= 2
  )
  const pool = emergencyPool.length > 0 ? emergencyPool : candidates
  const best = pool
    .map((p) => ({ player: p, score: attrScore(p, attrs) }))
    .sort((a, b) => b.score - a.score)[0]

  return {
    type: 'emergency-coverage',
    label: 'Emergency Coverage',
    description: 'Grant a versatile player emergency eligibility at this position.',
    suggestedPlayerId: best?.player.id ?? null,
    emergencyPositions: [targetPos],
    consequences: {
      formDelta: -8,
      fatigueDelta: 10,
      cohesionPenalty: 0.12,
      upsidePotential: 0.02,
      roleNote: best
        ? `${best.player.firstName} ${best.player.lastName} granted emergency ${targetPos} status — significant disruption.`
        : 'No versatile player found for emergency coverage.',
    },
  }
}

// ── Trigger logic ─────────────────────────────────────────────────────────────

/**
 * Returns true if the injury is significant enough to warrant a puzzle.
 * Triggers for user's club if: severity ≥ moderate OR weeksOut ≥ 2.
 * Also requires the player to have an overall rating ≥ 62 (squad contributor).
 */
export function shouldGeneratePuzzle(
  player: Player,
  weeksOut: number,
): boolean {
  if (weeksOut < 2) return false
  const rating = getOverallRating(player)
  return rating >= 62
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate an InjuryReplacementPuzzle for a key injured user-club player.
 *
 * @param injuredPlayer  The player who was just injured.
 * @param allClubPlayers ALL players on the user's club list (incl. injured).
 * @param weeksOut       How many weeks they're expected to miss.
 * @param round          Current round number.
 * @param date           Current ISO date string.
 */
export function generateInjuryReplacementPuzzle(
  injuredPlayer: Player,
  allClubPlayers: Player[],
  weeksOut: number,
  round: number,
  date: string,
): InjuryReplacementPuzzle {
  // Available candidates: not injured, not the same player
  const candidates = allClubPlayers.filter(
    (p) => p.id !== injuredPlayer.id && !p.injury
  )

  const attrs = getAttrEntries(injuredPlayer.position.primary).slice(0, 3)
  const keyAttributes = attrs.map(({ attr, label }) => ({
    attr,
    label,
    value: Math.round(injuredPlayer.attributes[attr] ?? 50),
  }))

  const pathways: ReplacementPathway[] = [
    buildLikeForLikePathway(injuredPlayer, candidates),
    buildStructureShiftPathway(injuredPlayer, candidates),
    buildYouthPromotionPathway(injuredPlayer, candidates),
    buildEmergencyCoveragePathway(injuredPlayer, candidates),
  ]

  const playerName = `${injuredPlayer.firstName} ${injuredPlayer.lastName}`
  const pos = injuredPlayer.position.primary

  return {
    id: crypto.randomUUID(),
    round,
    date,
    injuredPlayerId: injuredPlayer.id,
    injuredPlayerName: playerName,
    injuredPlayerPosition: pos,
    injuredPlayerRole: injuredPlayer.preferredRole
      ? injuredPlayer.preferredRole.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : POSITION_GROUP_LABEL[pos],
    weeksOut,
    roleImpact: {
      positionGroup: POSITION_GROUP_LABEL[pos],
      keyAttributes,
      matchupValue: getMatchupValue(injuredPlayer),
      statusLabel: getStatusLabel(injuredPlayer, allClubPlayers),
    },
    pathways,
    chosenPathwayType: null,
    resolved: false,
    dismissed: false,
  }
}

/**
 * Apply the consequences of resolving a puzzle with a given pathway.
 * Mutates the players record directly (called inside Zustand `set()`).
 *
 * @returns The emergency positions to grant (if any), or null.
 */
export function applyPuzzleResolution(
  puzzle: InjuryReplacementPuzzle,
  pathwayType: ReplacementPathwayType,
  players: Record<string, Player>,
): { playerId: string; emergencyPositions: PlayerPositionType[] } | null {
  const pathway = puzzle.pathways.find((p) => p.type === pathwayType)
  if (!pathway?.suggestedPlayerId) return null

  const target = players[pathway.suggestedPlayerId]
  if (!target) return null

  // Apply form/fatigue consequences
  target.form = Math.max(1, Math.min(100, (target.form ?? 50) + pathway.consequences.formDelta))
  target.fatigue = Math.max(0, Math.min(100, (target.fatigue ?? 20) + pathway.consequences.fatigueDelta))

  // Youth upside: boost their pulse modifier via a note (handled in squadPulseEngine)
  // Cohesion penalty flows through form reduction already

  // Return emergency positions if applicable
  if (pathway.type === 'emergency-coverage' && pathway.emergencyPositions?.length) {
    return {
      playerId: pathway.suggestedPlayerId,
      emergencyPositions: pathway.emergencyPositions,
    }
  }

  return null
}
