/**
 * chainEngine.ts — Unified possession chain engine
 *
 * Replaces the two-phase architecture (simulateQuarter + generateQuarterTicks)
 * with a single-pass simulation that produces MatchTick[] directly.
 *
 * The ball travels through zones via chains of disposals. Scoring only happens
 * when the ball reaches forward50 through actual play. Each disposal IS a tick.
 */

import type { FieldZone, PossessionType, MatchTick } from '@/types/matchTick'
import type { MatchPlayerStats, MatchKeyEvent, PlayByPlayEvent } from '@/types/match'
import type { Player } from '@/types/player'
import type { ClubGameplan } from '@/types/club'
import { SeededRNG } from '@/engine/core/rng'
import { POSITION_LINE } from '@/engine/core/constants'
import { getRoleSimulationMultiplier } from '@/engine/player/roles'
import { getMoraleModifier } from '@/engine/players/morale'
import { getReadinessMod } from '@/engine/player/readinessEngine'
import { getClutchModifier } from '@/engine/leadership/leadershipEngine'
import type { MatchContext, WeatherModifiers, GameplanModifiers, TacticalRuntime } from './simulateMatch'
import { VENUES } from '@/data/venues'
import type { RotationEvent } from '@/types/game'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TeamLine = 'DEF' | 'MID' | 'FWD' | 'RK'

interface GranularRatings {
  speed: number
  endurance: number
  kicking: number
  marking: number
  tackling: number
  strength: number
  decisionMaking: number
  agility: number
  spoiling: number
  intercepting: number
  goalSense: number
  discipline: number
}

interface ChainState {
  chainId: number
  zone: FieldZone
  clubId: string          // team currently possessing
  disposalsInChain: number
  isHomeTeam: boolean
  /** True when this chain started from a centre bounce (after goal or quarter start).
   *  The first few ticks follow structured centre-bounce positioning. */
  isCentreBounce: boolean
}

interface ClutchContext {
  quarter: number
  margin: number
  isFinal: boolean
  captainPresent: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZONES: FieldZone[] = ['back50', 'backHalf', 'midfield', 'forwardHalf', 'forward50']
const ZONE_INDEX: Record<FieldZone, number> = { back50: 0, backHalf: 1, midfield: 2, forwardHalf: 3, forward50: 4 }

/** How many ticks to generate per quarter. ~190–210 total, matching AFL pace. */
const TICKS_PER_QUARTER_MIN = 190
const TICKS_PER_QUARTER_MAX = 210

/**
 * Zone-based positional line weights — who touches the ball in each zone.
 * AFL is uniquely fluid: there are no rules about where players can go.
 * A half-back can run into forward50, a forward can drop back to midfield.
 * These weights provide a soft bias, not a hard lock.
 * Every line has meaningful weight in every zone.
 */
const ZONE_LINE_WEIGHTS: Record<FieldZone, Record<TeamLine, number>> = {
  back50:      { DEF: 0.42, MID: 0.28, FWD: 0.14, RK: 0.16 },
  backHalf:    { DEF: 0.34, MID: 0.33, FWD: 0.17, RK: 0.16 },
  midfield:    { DEF: 0.20, MID: 0.38, FWD: 0.22, RK: 0.20 },
  forwardHalf: { DEF: 0.16, MID: 0.30, FWD: 0.38, RK: 0.16 },
  forward50:   { DEF: 0.12, MID: 0.22, FWD: 0.48, RK: 0.18 },
}

/** Zone-based disposal type weights. */
const ZONE_DISPOSAL_WEIGHTS: Record<FieldZone, Record<string, number>> = {
  back50: {
    kick: 38, handball: 18, mark: 10, tackle: 8, clearance: 3,
    contest: 6, 'free-for': 3, spoil: 5, 'out-of-bounds': 5, 'ball-up': 2, 'out-on-full': 2,
  },
  backHalf: {
    kick: 32, handball: 20, mark: 14, tackle: 8, clearance: 4,
    contest: 6, 'free-for': 3, spoil: 4, 'out-of-bounds': 4, 'ball-up': 2, 'out-on-full': 3,
  },
  midfield: {
    kick: 24, handball: 24, mark: 10, tackle: 12, clearance: 8,
    contest: 8, 'free-for': 3, spoil: 4, 'out-of-bounds': 3, 'ball-up': 3, 'out-on-full': 1,
  },
  forwardHalf: {
    kick: 28, handball: 18, mark: 16, tackle: 9, clearance: 4,
    contest: 8, 'free-for': 4, spoil: 5, 'out-of-bounds': 4, 'ball-up': 2, 'out-on-full': 2,
  },
  forward50: {
    kick: 26, handball: 16, mark: 18, tackle: 7, clearance: 2,
    contest: 10, 'free-for': 4, spoil: 8, 'out-of-bounds': 4, 'ball-up': 3, 'out-on-full': 2,
  },
}

// ---------------------------------------------------------------------------
// Commentary templates (migrated from tickEngine.ts)
// ---------------------------------------------------------------------------

const KICK_BY_ZONE: Record<FieldZone, string[]> = {
  back50: [
    '{name} thumps it out of the back line.',
    'Kick from {name} clears the defensive 50.',
    '{name} drives it long out of defence.',
    '{name} gets boot to ball — launches it from the back line.',
  ],
  backHalf: [
    '{name} kicks it through the corridor from half-back.',
    'Nice use from {name} off half-back.',
    '{name} delivers it on the boot from the back half.',
    '{name} switches play across half-back.',
  ],
  midfield: [
    '{name} drills it through the midfield.',
    'Kick from {name} finds space on the wing.',
    '{name} swings it wide to the wing.',
    '{name} fires it forward from the centre.',
    '{name} takes the kick from the stoppage — finds a teammate.',
    'Nice kick by {name} — switches the play.',
  ],
  forwardHalf: [
    '{name} delivers it inside 50.',
    '{name} pumps it long into the forward line.',
    '{name} bombs it forward — looking for a contest up forward.',
    '{name} finds the corridor with a precise kick from the forward half.',
  ],
  forward50: [
    '{name} snaps at goal from close range.',
    '{name} steadies inside 50 and delivers by foot.',
    '{name} fires it goalward from the forward pocket.',
    'Clinical from {name} — the ball zips through inside 50.',
  ],
}

const COMMENTARY: Record<Exclude<PossessionType, 'kick'>, string[]> = {
  handball: [
    '{name} threads a handball through traffic.',
    'Quick handball from {name} keeps the chain going.',
    '{name} finds a teammate with a deft handpass.',
    'Short pass from {name} — the ball moves quickly.',
    'Brilliant handball from {name} beats the tackler.',
    '{name} fires a laser handball under pressure.',
    '{name} snaps a handball off both hands — great vision.',
    '{name} shovels it out of the stoppage — chain maintained.',
  ],
  mark: [
    '{name} takes a strong overhead mark.',
    '{name} marks it cleanly under pressure.',
    'Strong hands from {name} — a fine mark.',
    '{name} takes the grab and plays on.',
    '{name} takes a screamer! What a mark!',
    'Courageous mark to {name} — held it through heavy contact.',
    '{name} positions perfectly and takes the clean grab.',
    '{name} judges the flight beautifully — safe hands.',
  ],
  tackle: [
    'Tackle applied! {name} wins the free kick.',
    '{name} smothers the kick — great defensive work.',
    '{name} clamps on and forces the turnover.',
    'Solid tackle from {name}.',
    '{name} drives through the ball-carrier — big hit!',
    '{name} wraps both arms around and drags them down.',
  ],
  clearance: [
    '{name} wins the clearance from the stoppage.',
    'Ball breaks free — {name} gathers and fires it out.',
    '{name} crumbs it from the pack.',
    'Strong clearance by {name}.',
    '{name} sweeps it clear — possession changed.',
    'The ball spills and {name} is first to react — clearance!',
  ],
  contest: [
    'Contested ball — {name} comes up with it.',
    'Disputed possession — {name} holds on.',
    '{name} wins the hitout to advantage.',
    'Hard at the ball — {name} emerges.',
    '{name} muscles through the contest — strong possession.',
    'Bodies everywhere — {name} comes out with the ball.',
  ],
  'free-for': [
    'Free kick to {name} — high contact.',
    'Umpire rewards {name} with a free kick.',
    '{name} wins the free — holding the ball called.',
    'Late contact from behind — free kick to {name}.',
  ],
  goal: [
    'GOAL! {name} slots it through from {zone}!',
    "It's a major! {name} converts brilliantly!",
    'GOAL — {name} makes no mistake!',
    'SIX POINTS! {name} nails it from {zone}!',
    'GOAL! {name} splits the big sticks!',
    'The chain is complete — {name} finishes with a GOAL!',
  ],
  behind: [
    'Behind. {name} just missed to the right.',
    'Point — unlucky from {name}.',
    '{name} registers a behind — just wide.',
    'One point. {name} could not convert.',
    '{name} goes for goal but it drifts across — behind.',
  ],
  injury: [
    '{name} is down on the ground — play stopped.',
    'Concern for {name} — trainer on the ground.',
    '{name} has pulled up sore. Trainer rushing on.',
    'Medical staff attend to {name}.',
  ],
  interchange: [
    '{name} heads to the bench for a breather.',
    'Interchange — {name} off for a rest.',
    '{name} rotated off the ground.',
  ],
  spoil: [
    '{name} gets a fist to it — spoil!',
    'Great spoil from {name} — denies the mark.',
    '{name} punches it clear — no mark.',
    '{name} flies in and gets a hand to it.',
    'Brilliant spoil by {name} — the ball goes to ground.',
    '{name} times the punch perfectly — contested ball.',
  ],
  'out-of-bounds': [
    'Ball sails out of bounds — throw-in coming.',
    'Bundled over the boundary — throw-in on the {zone}.',
    'It spills out of bounds — umpire signals the throw-in.',
    'Carried over the line — the ball is out of play.',
    'Scragged over the boundary. Throw-in.',
  ],
  'ball-up': [
    "Ball-up! Neither side can win clean possession.",
    'Umpire calls ball-up — both sides locked together.',
    'Play stopped — ball-up called in the {zone}.',
    "It's a throw-in — the ruckmen set up again.",
    'Congested in the {zone} — ball-up called.',
  ],
  'out-on-full': [
    'Out on the full! Free kick — poor kick across the boundary.',
    "That's gone out on the full — free kick the other way.",
    'Kicked it out on the full — the umpire calls the free.',
    'Out on the full — shanked kick gives away a free.',
  ],
}

// Chain-context commentary additions
const CHAIN_BUILDING_COMMENTARY: string[] = [
  '{name} extends the chain — beautiful ball movement.',
  'Linking up again — {name} keeps it alive.',
  '{name} builds from {zone} — the chain continues.',
  'Patient build-up — {name} finds space and keeps possession.',
  '{name} continues the passage of play — {count} disposals and counting.',
]

const RECYCLE_COMMENTARY: string[] = [
  '{name} goes backward to reset — patient play.',
  '{name} kicks it back across half-back to recycle.',
  'Lateral ball movement — {name} switches the point of attack.',
  '{name} goes sideways — looking to open up space on the other side.',
  'No direct option — {name} kicks it back to maintain possession.',
  '{name} finds a teammate behind the play — reset and rebuild.',
  'Recycled possession — {name} takes it back through the corridor.',
  '{name} opts for the safe option — ball goes back to regroup.',
]

const TURNOVER_COMMENTARY: string[] = [
  'Turnover! {name} wins it back for the other side.',
  '{name} intercepts — new chain starts here.',
  'The ball spills and {name} picks it up — change of possession.',
  '{name} pounces on the loose ball — momentum shifts.',
]

function fillTemplate(template: string, name: string, zone: FieldZone, chainCount?: number): string {
  return template
    .replace('{name}', name)
    .replace('{zone}', zone.replace(/([A-Z])/g, ' $1').toLowerCase().trim())
    .replace('{count}', String(chainCount ?? 0))
}

function pickCommentary(
  rng: SeededRNG,
  type: PossessionType,
  name: string,
  zone: FieldZone,
  chainDisposals?: number,
  zoneRetreat?: boolean,
): string {
  // When the ball has gone backward, use recycle commentary
  if (zoneRetreat && (type === 'kick' || type === 'handball') && rng.chance(0.55)) {
    const tmpl = RECYCLE_COMMENTARY[rng.nextInt(0, RECYCLE_COMMENTARY.length - 1)]
    return fillTemplate(tmpl, name, zone, chainDisposals)
  }

  // Occasionally use chain-building commentary for mid-chain disposals
  if (chainDisposals && chainDisposals >= 3 && (type === 'kick' || type === 'handball') && rng.chance(0.3)) {
    const tmpl = CHAIN_BUILDING_COMMENTARY[rng.nextInt(0, CHAIN_BUILDING_COMMENTARY.length - 1)]
    return fillTemplate(tmpl, name, zone, chainDisposals)
  }

  const templates = type === 'kick' ? KICK_BY_ZONE[zone] : COMMENTARY[type]
  const template = templates[rng.nextInt(0, templates.length - 1)]
  return fillTemplate(template, name, zone)
}

// ---------------------------------------------------------------------------
// Player attribute helpers (mirrors simulateMatch.ts private helpers)
// ---------------------------------------------------------------------------

function avg(...vals: number[]): number {
  if (vals.length === 0) return 50
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function clampChance(value: number): number {
  return Math.max(0.01, Math.min(0.95, value))
}

function getGranularRatings(player: Player): GranularRatings {
  const a = player.attributes
  return {
    speed: avg(a.speed, a.acceleration, a.workRate),
    endurance: avg(a.endurance, a.recovery, a.workRate),
    kicking: avg(a.kickingEfficiency, a.kickingDistance, a.fieldKicking, a.dropPunt, a.setShot),
    marking: avg(a.markingOverhead, a.markingContested, a.markingUncontested, a.markingLeading),
    tackling: avg(a.tackling, a.pressure, a.hardness, a.oneOnOne),
    strength: avg(a.strength, a.contested, a.hardness),
    decisionMaking: avg(a.disposalDecision, a.positioning, a.anticipation, a.composure, a.consistency),
    agility: avg(a.agility, a.acceleration, a.speed, a.recovery),
    spoiling: avg(a.spoiling, a.oneOnOne, a.zonalAwareness, a.hardness),
    intercepting: avg(a.intercept, a.anticipation, a.zonalAwareness, a.markingContested),
    goalSense: avg(a.goalkicking, a.scoringInstinct, a.insideForward, a.leadingPatterns, a.snap),
    discipline: avg(player.personality.temperament, a.teamPlayer, a.composure, a.pressure),
  }
}

function getOverall(p: Player): number {
  const g = getGranularRatings(p)
  const base = (
    g.speed + g.endurance + g.kicking + g.marking + g.tackling + g.strength +
    g.decisionMaking + g.agility + g.spoiling + g.intercepting + g.goalSense + g.discipline
  ) / 12
  return base * getAvailabilityMultiplier(p)
}

function getAvailabilityMultiplier(player: Player, posFitMult = 1.0): number {
  const fitnessMult = 0.6 + player.fitness / 250
  const fatigueMult = 1 - player.fatigue / 260
  const injuryMult = player.injury
    ? player.injury.weeksRemaining <= 1 ? 0.9 : 0.75
    : 1
  return Math.max(0.15, fitnessMult * fatigueMult * injuryMult * posFitMult)
}

function getForwardModifier(player: Player): number {
  const pos = player.position.primary
  if (pos === 'FF') return 1.8
  if (pos === 'FP' || pos === 'CHF') return 1.5
  if (pos === 'HFF') return 1.4
  if (pos === 'RK') return 0.6
  if (pos === 'IM' || pos === 'OM') return 0.8
  if (pos === 'W') return 0.5
  return 0.3
}

// ---------------------------------------------------------------------------
// Zone-aware player picking
// ---------------------------------------------------------------------------

/** Pick a player weighted by zone position group and skill. */
function pickZonePlayer(
  rng: SeededRNG,
  players: Player[],
  zone: FieldZone,
  positionFitMults: Map<string, number>,
  clutchCtx?: ClutchContext,
  weather?: WeatherModifiers,
): Player {
  const lineWeights = ZONE_LINE_WEIGHTS[zone]
  const weights = players.map((p) => {
    const line: TeamLine = POSITION_LINE[p.position.primary]
    const lineW = lineWeights[line]
    const g = getGranularRatings(p)
    const contestedProfile = (p.attributes.contested + p.attributes.hardness + p.attributes.tackling) / 3
    const contestedMult = 1 + (contestedProfile / 100) * (weather?.contestedPlayerBoost ?? 0)
    const moraleMult = getMoraleModifier(p.morale)
    const readinessMult = getReadinessMod(p)
    const clutchMult = clutchCtx
      ? getClutchModifier(p, clutchCtx.quarter, clutchCtx.margin, clutchCtx.isFinal, clutchCtx.captainPresent)
      : 1.0
    const posFitMult = positionFitMults.get(p.id) ?? 1.0
    const skill = (
      getOverall(p) * 0.35 +
      g.decisionMaking * 0.2 +
      g.endurance * 0.15 +
      g.speed * 0.1 +
      g.kicking * 0.1 +
      g.marking * 0.1
    )
    return Math.max(0.01,
      skill *
      lineW *
      getAvailabilityMultiplier(p, posFitMult) *
      getRoleSimulationMultiplier(p.preferredRole, 'general') *
      contestedMult * moraleMult * readinessMult * clutchMult,
    )
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}

/** Pick a scoring player (heavily weighted toward forwards). */
function pickScoringPlayer(
  rng: SeededRNG,
  players: Player[],
  positionOverrides: Map<string, 'forward' | 'back'>,
  positionFitMults: Map<string, number>,
  clutchCtx?: ClutchContext,
): Player {
  const weights = players.map((p) => {
    const moraleMult = getMoraleModifier(p.morale)
    const readinessMult = getReadinessMod(p)
    const clutchMult = clutchCtx
      ? getClutchModifier(p, clutchCtx.quarter, clutchCtx.margin, clutchCtx.isFinal, clutchCtx.captainPresent)
      : 1.0
    const override = positionOverrides.get(p.id)
    const forwardMod = getForwardModifier(p) * (override === 'forward' ? 1.5 : override === 'back' ? 0.4 : 1)
    const posFitMult = positionFitMults.get(p.id) ?? 1.0
    return Math.max(0.01,
      forwardMod *
      (getGranularRatings(p).goalSense * 0.65 + getGranularRatings(p).marking * 0.2 + getGranularRatings(p).agility * 0.15 + 16) *
      getAvailabilityMultiplier(p, posFitMult) *
      getRoleSimulationMultiplier(p.preferredRole, 'scoring') *
      moraleMult * readinessMult * clutchMult,
    )
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}

// ---------------------------------------------------------------------------
// Centre bounce player picking
// ---------------------------------------------------------------------------

/**
 * Centre-bounce position weights.
 *
 * At a centre bounce the players are in fixed starting positions:
 *  - RK contests the bounce in the centre circle
 *  - IM/OM are inside or at the edge of the centre square
 *  - W are hard against the centre-square boundary line
 *  - DEF are in their defensive half (not at the contest)
 *  - FWD are in their forward half (not at the contest)
 *
 * The first touch is almost always the ruck or an inside mid.
 * Wingers are the next outlet. Defenders and forwards are
 * nowhere near the ball — they only get it if the clearance
 * reaches them.
 */
const CENTRE_BOUNCE_WEIGHTS: Record<string, Record<TeamLine, number>> = {
  /** Tick 0: the actual ruck contest / first clearance. */
  hitout: { DEF: 0.00, MID: 0.20, FWD: 0.00, RK: 0.80 },
  /** Tick 1: the ball spills from the ruck — inside mids and wingers. */
  firstClearance: { DEF: 0.02, MID: 0.72, FWD: 0.02, RK: 0.24 },
  /** Tick 2: ball exits the centre square — wingers/mids, some forward. */
  exitSquare: { DEF: 0.08, MID: 0.52, FWD: 0.18, RK: 0.22 },
}

/** Pick a player for a centre-bounce tick based on how far through the bounce sequence we are. */
function pickCentreBouncePlayer(
  rng: SeededRNG,
  players: Player[],
  tickInBounce: number,
  positionFitMults: Map<string, number>,
  clutchCtx?: ClutchContext,
  weather?: WeatherModifiers,
): Player {
  const phase =
    tickInBounce === 0 ? 'hitout'
    : tickInBounce === 1 ? 'firstClearance'
    : 'exitSquare'
  const lineWeights = CENTRE_BOUNCE_WEIGHTS[phase]

  const weights = players.map((p) => {
    const line: TeamLine = POSITION_LINE[p.position.primary]
    const lineW = lineWeights[line]
    if (lineW <= 0) return 0.001 // near-zero but not impossible

    const g = getGranularRatings(p)
    const moraleMult = getMoraleModifier(p.morale)
    const readinessMult = getReadinessMod(p)
    const clutchMult = clutchCtx
      ? getClutchModifier(p, clutchCtx.quarter, clutchCtx.margin, clutchCtx.isFinal, clutchCtx.captainPresent)
      : 1.0
    const posFitMult = positionFitMults.get(p.id) ?? 1.0
    const contestedProfile = (p.attributes.contested + p.attributes.hardness + p.attributes.tackling) / 3
    const contestedMult = 1 + (contestedProfile / 100) * (weather?.contestedPlayerBoost ?? 0)

    // For the hitout phase, ruck attributes dominate
    let skill: number
    if (phase === 'hitout') {
      skill = (
        (p.attributes.hitouts ?? 50) * 0.35 +
        (p.attributes.leap ?? 50) * 0.20 +
        g.strength * 0.20 +
        g.endurance * 0.15 +
        g.agility * 0.10
      )
    } else {
      // Clearance / exit phases: contested ball-winning + decision-making
      skill = (
        g.decisionMaking * 0.25 +
        g.speed * 0.15 +
        g.endurance * 0.15 +
        (p.attributes.clearance ?? 50) * 0.20 +
        g.kicking * 0.15 +
        g.strength * 0.10
      )
    }

    return Math.max(0.001,
      skill * lineW *
      getAvailabilityMultiplier(p, posFitMult) *
      getRoleSimulationMultiplier(p.preferredRole, phase === 'hitout' ? 'ruck' : 'general') *
      contestedMult * moraleMult * readinessMult * clutchMult,
    )
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * totalWeight
  for (let i = 0; i < players.length; i++) {
    r -= weights[i]
    if (r <= 0) return players[i]
  }
  return players[players.length - 1]
}

/** Centre-bounce specific commentary. */
const CENTRE_BOUNCE_COMMENTARY: Record<string, string[]> = {
  hitout: [
    '{name} taps it from the ruck contest.',
    '{name} gets first hands on it at the bounce.',
    '{name} palms it out of the centre.',
    'Ruck contest — {name} directs it to advantage.',
    '{name} wins the hit-out from the centre bounce.',
  ],
  firstClearance: [
    '{name} gathers at the feet of the ruck — fires it out.',
    '{name} crumbs the centre bounce and clears.',
    'Clean hands from {name} at the stoppage — drives it forward.',
    '{name} swoops on the loose ball in the centre square.',
    '{name} wins first possession from the centre.',
  ],
  exitSquare: [
    '{name} receives on the wing — play opens up.',
    '{name} collects outside the square and pushes forward.',
    'Ball spills to {name} on the centre-square boundary.',
    '{name} gathers on the wing and drives it wide.',
    '{name} takes the ball out of the centre and into open space.',
  ],
}

// ---------------------------------------------------------------------------
// Zone movement profile — gameplan-aware
// ---------------------------------------------------------------------------

/**
 * Zone movement probabilities derived from the attacking team's gameplan.
 * AFL ball movement is NOT a linear march from back50 to forward50.
 * Teams recycle, switch, kick backwards to reset, flood back, etc.
 * The gameplan shapes how the ball tends to move.
 */
interface ZoneMovementProfile {
  /** Chance the ball moves toward the attacking goal (forward). */
  forwardBias: number
  /** Chance the ball stays in the same zone (switches, short handballs, sideways movement). */
  holdBias: number
  /** Chance the ball deliberately retreats (recycling, kicking back to reset). */
  retreatBias: number
  /** Chance of skipping a zone (long kick forward or backward). */
  skipChance: number
}

/**
 * Build a zone movement profile from the attacking gameplan.
 * This shapes HOW the ball moves through zones within a chain.
 */
function getZoneMovementProfile(gameplan: ClubGameplan, zone: FieldZone): ZoneMovementProfile {
  // Base profile — tuned to produce AFL-realistic scoring (~12 goals/team/match).
  // The ball must be able to reach forward50 frequently enough for scoring to occur.
  // Real AFL: teams average ~50–55 inside-50s per match, ~12 goals, ~8 behinds.
  let forwardBias = 0.44
  let holdBias = 0.41
  let retreatBias = 0.15
  let skipChance = 0.12

  // --- Tempo ---
  // Fast tempo: push forward more, less recycling
  // Slow tempo: more recycling (hold/retreat), patient build-up
  if (gameplan.tempo === 'fast') {
    forwardBias += 0.08
    holdBias -= 0.04
    retreatBias -= 0.04
    skipChance += 0.03
  } else if (gameplan.tempo === 'slow') {
    forwardBias -= 0.07
    holdBias += 0.03
    retreatBias += 0.04
    skipChance -= 0.03
  }

  // --- Offensive style ---
  // Attacking: push forward aggressively
  // Defensive: sit deep, recycle, keep ball in back half
  if (gameplan.offensiveStyle === 'attacking') {
    forwardBias += 0.06
    retreatBias -= 0.04
    skipChance += 0.02
  } else if (gameplan.offensiveStyle === 'defensive') {
    forwardBias -= 0.06
    retreatBias += 0.04
    holdBias += 0.02
  }

  // --- Kick-in tactic ---
  // play-on-short / set-up-short: ball starts deep and works through slowly
  // play-on-long / set-up-long: ball launches forward immediately
  if (zone === 'back50' || zone === 'backHalf') {
    if (gameplan.kickInTactic === 'play-on-short' || gameplan.kickInTactic === 'set-up-short') {
      holdBias += 0.08
      forwardBias -= 0.05
      retreatBias += 0.02
      skipChance -= 0.04
    } else if (gameplan.kickInTactic === 'play-on-long' || gameplan.kickInTactic === 'set-up-long') {
      forwardBias += 0.06
      skipChance += 0.06
      holdBias -= 0.06
    }
  }

  // --- Play style: switch frequency ---
  // Switching = sideways movement = ball stays in same zone
  if (gameplan.playStyle?.switchFrequency === 'often') {
    holdBias += 0.06
    forwardBias -= 0.03
    retreatBias -= 0.02
  } else if (gameplan.playStyle?.switchFrequency === 'rarely') {
    holdBias -= 0.04
    forwardBias += 0.03
  }

  // --- Play style: no U-turns ---
  // When enabled: no backward kicks, strongly forward-biased
  // When disabled (default): recycling is allowed and common
  if (gameplan.playStyle?.noUTurns) {
    retreatBias = Math.max(0.05, retreatBias - 0.10)
    forwardBias += 0.06
  }

  // --- Play style: stoppage movement ---
  if (gameplan.playStyle?.stoppageMovement === 'flood-back') {
    retreatBias += 0.06
    forwardBias -= 0.04
  } else if (gameplan.playStyle?.stoppageMovement === 'push-forward') {
    forwardBias += 0.05
    retreatBias -= 0.03
  }

  // --- Play style: no kick back across goal ---
  // In forward50, prevents backward kicks
  if (gameplan.playStyle?.noKickBackAcrossGoal && (zone === 'forward50' || zone === 'forwardHalf')) {
    retreatBias = Math.max(0.04, retreatBias - 0.08)
    holdBias += 0.05
    forwardBias += 0.03
  }

  // --- Defensive line affects how the ball moves when in your own half ---
  if (zone === 'back50' || zone === 'backHalf') {
    if (gameplan.defensiveLine === 'run') {
      // Run and carry out of defence — more forward movement from deep
      forwardBias += 0.05
      skipChance += 0.02
    } else if (gameplan.defensiveLine === 'hold') {
      // Hold position — more controlled, sideways
      holdBias += 0.04
      forwardBias -= 0.02
    }
  }

  // --- Zone-specific adjustments ---
  // From forward50, some retreat (defensive pressure) but not excessive
  if (zone === 'forward50') {
    retreatBias += 0.03
    forwardBias -= 0.02
  }
  // From back50, forward is more likely (teams rarely kick it deeper into trouble)
  if (zone === 'back50') {
    forwardBias += 0.08
    retreatBias = Math.max(0.03, retreatBias - 0.08)
    skipChance += 0.04 // long kicks out of defence are common
  }

  // Normalize
  const total = forwardBias + holdBias + retreatBias
  return {
    forwardBias: Math.max(0.05, forwardBias / total),
    holdBias: Math.max(0.05, holdBias / total),
    retreatBias: Math.max(0.03, retreatBias / total),
    skipChance: Math.max(0.01, Math.min(0.20, skipChance)),
  }
}

// ---------------------------------------------------------------------------
// Zone advancement logic
// ---------------------------------------------------------------------------

/**
 * Advance the zone based on disposal type, current zone, gameplan, and player skill.
 *
 * AFL ball movement is fluid and non-linear. The ball frequently:
 * - Moves sideways (switch of play) — stays in same zone
 * - Goes backward (recycle to reset) — retreats a zone
 * - Gets bombed long (skip a zone forward)
 * - Gets driven backwards by defensive pressure
 * - Stays congested in one zone for multiple disposals
 *
 * The gameplan profile shapes the bias: fast/attacking teams push forward more,
 * slow/defensive teams recycle and hold. Switches and recycling keep the ball
 * in the same zone or move it backward.
 */
function advanceZone(
  rng: SeededRNG,
  zone: FieldZone,
  disposal: PossessionType,
  playerKickingSkill: number,
  profile: ZoneMovementProfile,
): FieldZone {
  const idx = ZONE_INDEX[zone]

  if (disposal === 'kick') {
    const skillBonus = (playerKickingSkill - 50) / 800 // subtle skill influence

    // Use the gameplan-derived movement profile
    const roll = rng.nextFloat(0, 1)

    // Skip forward (long kick) — capped by both profile and skill
    if (roll < profile.skipChance + skillBonus * 0.5) {
      if (idx < 3) return ZONES[idx + 2]
      if (idx < 4) return ZONES[idx + 1]
      // In forward50, skip means staying (can't go further)
      return zone
    }

    // Forward one zone
    if (roll < profile.skipChance + profile.forwardBias + skillBonus) {
      if (idx < 4) return ZONES[idx + 1]
      return zone
    }

    // Hold (switch of play, short kick to same zone)
    if (roll < profile.skipChance + profile.forwardBias + profile.holdBias) {
      return zone
    }

    // Retreat (recycle kick backward, poor kick, or deliberate reset)
    if (idx > 0) return ZONES[idx - 1]
    return zone
  }

  if (disposal === 'handball') {
    // Handballs are short — mostly hold zone, but running handoffs can advance
    const roll = rng.nextFloat(0, 1)
    const handballForward = profile.forwardBias * 0.55 // run-and-carry handballs can advance
    const handballHold = profile.holdBias + profile.forwardBias * 0.25
    if (roll < handballForward && idx < 4) return ZONES[idx + 1]
    if (roll < handballForward + handballHold) return zone
    if (idx > 0) return ZONES[idx - 1]
    return zone
  }

  if (disposal === 'free-for') {
    // Free kicks: usually advance slightly or hold
    if (rng.chance(profile.forwardBias * 0.7) && idx < 4) return ZONES[idx + 1]
    if (rng.chance(0.08) && idx > 0) return ZONES[idx - 1]
    return zone
  }

  if (disposal === 'mark') {
    // Marks: ball has arrived from a kick — often advances (lead, contest won)
    const roll = rng.nextFloat(0, 1)
    if (roll < profile.forwardBias * 0.65 && idx < 4) return ZONES[idx + 1]
    if (roll > 1 - profile.retreatBias * 0.3 && idx > 0) return ZONES[idx - 1]
    return zone
  }

  if (disposal === 'tackle' || disposal === 'contest') {
    // Contested: ball gets pushed around — can go any direction
    const roll = rng.nextFloat(0, 1)
    if (roll < 0.32 && idx > 0) return ZONES[idx - 1]  // pushed back
    if (roll < 0.78) return zone                         // held
    if (idx < 4) return ZONES[idx + 1]                   // breaks forward
    return zone
  }

  if (disposal === 'spoil') {
    // Spoil: ball goes to ground, often drifts back
    if (rng.chance(0.38) && idx > 0) return ZONES[idx - 1]
    if (rng.chance(0.10) && idx < 4) return ZONES[idx + 1]
    return zone
  }

  if (disposal === 'clearance') {
    // Clearance: ball exits the congestion, could go anywhere
    const roll = rng.nextFloat(0, 1)
    if (roll < 0.15) return 'backHalf'
    if (roll < 0.65) return 'midfield'
    if (roll < 0.85) return 'forwardHalf'
    return zone
  }

  // out-of-bounds, ball-up, out-on-full — zone stays
  return zone
}

// ---------------------------------------------------------------------------
// Disposal type picker (zone-aware)
// ---------------------------------------------------------------------------

function pickDisposalType(
  rng: SeededRNG,
  zone: FieldZone,
  gameplanMods: Record<string, number>,
): PossessionType {
  const baseWeights = ZONE_DISPOSAL_WEIGHTS[zone]
  const types: PossessionType[] = []
  const cumulative: number[] = []
  let total = 0

  for (const [type, base] of Object.entries(baseWeights)) {
    const adjusted = Math.max(0.5, base + (gameplanMods[type] ?? 0))
    total += adjusted
    types.push(type as PossessionType)
    cumulative.push(total)
  }

  const r = rng.nextFloat(0, 1) * total
  for (let i = 0; i < cumulative.length; i++) {
    if (r < cumulative[i]) return types[i]
  }
  return 'kick'
}

// ---------------------------------------------------------------------------
// Gameplan possession modifiers (reuses tickEngine logic)
// ---------------------------------------------------------------------------

function buildPossessionModifiers(
  home?: ClubGameplan | null,
  away?: ClubGameplan | null,
): Record<string, number> {
  const mods: Record<string, number> = {}

  for (const gp of [home, away]) {
    if (!gp) continue

    if (gp.stoppageTactic === 'cluster') {
      mods['ball-up'] = (mods['ball-up'] ?? 0) + 1.5
      mods['contest'] = (mods['contest'] ?? 0) + 1.0
      mods['spoil'] = (mods['spoil'] ?? 0) + 0.5
    } else if (gp.stoppageTactic === 'spread') {
      mods['ball-up'] = (mods['ball-up'] ?? 0) - 0.5
      mods['kick'] = (mods['kick'] ?? 0) + 1.0
      mods['mark'] = (mods['mark'] ?? 0) + 0.5
    }

    if (gp.tempo === 'fast') {
      mods['out-of-bounds'] = (mods['out-of-bounds'] ?? 0) + 1.0
      mods['out-on-full'] = (mods['out-on-full'] ?? 0) + 0.5
    } else if (gp.tempo === 'slow') {
      mods['ball-up'] = (mods['ball-up'] ?? 0) + 0.5
      mods['contest'] = (mods['contest'] ?? 0) + 0.5
      mods['handball'] = (mods['handball'] ?? 0) + 1.0
    }

    if (gp.aggression === 'high') {
      mods['tackle'] = (mods['tackle'] ?? 0) + 1.5
      mods['spoil'] = (mods['spoil'] ?? 0) + 1.0
      mods['free-for'] = (mods['free-for'] ?? 0) + 0.5
    } else if (gp.aggression === 'low') {
      mods['tackle'] = (mods['tackle'] ?? 0) - 1.0
      mods['spoil'] = (mods['spoil'] ?? 0) - 0.5
    }

    if (gp.defensiveLine === 'press') {
      mods['spoil'] = (mods['spoil'] ?? 0) + 1.0
      mods['out-of-bounds'] = (mods['out-of-bounds'] ?? 0) + 0.5
      mods['tackle'] = (mods['tackle'] ?? 0) + 0.5
    } else if (gp.defensiveLine === 'zone') {
      mods['kick'] = (mods['kick'] ?? 0) + 0.5
      mods['mark'] = (mods['mark'] ?? 0) + 0.5
    }

    if (gp.playStyle?.switchFrequency === 'often') {
      mods['out-on-full'] = (mods['out-on-full'] ?? 0) + 0.5
      mods['out-of-bounds'] = (mods['out-of-bounds'] ?? 0) + 0.5
      mods['kick'] = (mods['kick'] ?? 0) + 0.5
    } else if (gp.playStyle?.switchFrequency === 'rarely') {
      mods['contest'] = (mods['contest'] ?? 0) + 0.5
      mods['handball'] = (mods['handball'] ?? 0) + 0.5
    }
  }

  return mods
}

// ---------------------------------------------------------------------------
// Turnover probability
// ---------------------------------------------------------------------------

/**
 * Calculate turnover probability for this disposal.
 * Increases with chain length (pressure mounts), weather, and defender quality.
 */
function getTurnoverChance(
  rng: SeededRNG,
  chain: ChainState,
  player: Player,
  weather: WeatherModifiers,
  defenderPressure: number,
  disposalType: PossessionType,
): number {
  const g = getGranularRatings(player)

  // Base turnover by disposal type — tuned lower so chains can develop and reach forward50
  let base: number
  switch (disposalType) {
    case 'kick':
      base = 0.08 - g.kicking * 0.0006 - g.decisionMaking * 0.0003
      break
    case 'handball':
      base = 0.05 - g.decisionMaking * 0.0003
      break
    case 'mark':
    case 'free-for':
      base = 0.02 // Very safe disposals
      break
    case 'contest':
    case 'clearance':
      base = 0.14 - g.strength * 0.0005 - g.decisionMaking * 0.0003
      break
    default:
      base = 0.07
  }

  // Chain length pressure: longer chains = more defensive pressure
  const chainPressure = Math.min(0.12, chain.disposalsInChain * 0.012)

  // Weather and defensive modifiers
  const weatherMod = (weather.turnoverMult - 1) * 0.5
  const defMod = defenderPressure * 0.08

  return clampChance(base + chainPressure + weatherMod + defMod)
}

// ---------------------------------------------------------------------------
// Shot on goal resolution
// ---------------------------------------------------------------------------

interface ShotResult {
  isGoal: boolean
  isBehind: boolean
}

function resolveShot(
  rng: SeededRNG,
  player: Player,
  weather: WeatherModifiers,
  accuracyMult: number,
  venueScoringCoeff: number,
): ShotResult {
  const g = getGranularRatings(player)
  const goalChance = clampChance(
    (0.28 + g.goalSense * 0.004 + g.kicking * 0.0015)
    * accuracyMult
    * weather.accuracyMult
    * venueScoringCoeff,
  )

  if (rng.chance(goalChance)) {
    return { isGoal: true, isBehind: false }
  }

  // Miss but still registered as behind ~60% of the time
  if (rng.chance(0.60)) {
    return { isGoal: false, isBehind: true }
  }

  return { isGoal: false, isBehind: false }
}

// ---------------------------------------------------------------------------
// Player name helper
// ---------------------------------------------------------------------------

function getPlayerDisplayName(player: Player): string {
  return `#${player.jerseyNumber} ${player.firstName[0]}. ${player.lastName}`
}

// ---------------------------------------------------------------------------
// Stat helper
// ---------------------------------------------------------------------------

function findStatIndex(stats: MatchPlayerStats[], playerId: string): number {
  return stats.findIndex((s) => s.playerId === playerId)
}

// ---------------------------------------------------------------------------
// Main chain engine
// ---------------------------------------------------------------------------

export function simulateQuarterChain(ctx: MatchContext, quarterIndex: number): MatchTick[] {
  const {
    rng, input, homeStats, awayStats, keyEvents,
    homeMods, awayMods, matchup, homeTactical, awayTactical,
    weather, homeTeamFreeRisk, awayTeamFreeRisk,
    adjustedHomeRating, adjustedAwayRating,
    homeCaptainPresent, awayCaptainPresent,
    pointsPerGoal, pointsPerBehind,
    suspensionStrictness, positionOverrides,
    resolvedHomeGameplan, resolvedAwayGameplan,
    positionFitMults,
  } = ctx
  const { homeClubId, awayClubId, isFinal } = input

  // Venue data
  const venueData = ctx.venueId ? VENUES[ctx.venueId] : undefined
  const venueScoringCoeff = venueData?.scoringCoefficient ?? 1.0
  const venueKickBias = venueData?.kickToHandballRatio ?? 1.0
  const venueContestedCoeff = venueData?.contestedCoefficient ?? 1.0
  const venueMarkCoeff = venueData?.markCoefficient ?? 1.0

  // Active players (may be reduced by mid-match injuries)
  const homePlayers = ctx.homeActivePlayers
  const awayPlayers = ctx.awayActivePlayers

  // Snapshot disposals at quarter start for tag-failing detection
  for (const stat of [...homeStats, ...awayStats]) {
    ctx.quarterStartDisposals.set(stat.playerId, stat.disposals)
  }

  // Gameplan possession modifiers
  const possessionMods = buildPossessionModifiers(resolvedHomeGameplan, resolvedAwayGameplan)

  // Determine total ticks for this quarter
  const avgPossessionBonus = Math.round((homeMods.possessionBonus + awayMods.possessionBonus) / 2)
  const tickTarget = Math.max(
    TICKS_PER_QUARTER_MIN,
    Math.min(TICKS_PER_QUARTER_MAX,
      TICKS_PER_QUARTER_MIN + Math.round(avgPossessionBonus * 0.5) + rng.nextInt(-5, 10),
    ),
  )

  // Rotation setup
  const quarterNum = (quarterIndex + 1) as 1 | 2 | 3 | 4
  const pendingHomeRotations = ctx.homeRotationEvents
    .filter((e) => e.quarter === quarterNum)
    .sort((a, b) => a.minute - b.minute)
  const pendingAwayRotations = ctx.awayRotationEvents
    .filter((e) => e.quarter === quarterNum)
    .sort((a, b) => a.minute - b.minute)
  const appliedRotationIds = new Set<string>()

  // Play-by-play tracking
  const pbp = ctx.playByPlay
  const qNum = quarterIndex + 1
  let pbpCtr = pbp.length

  // Quarter-break divider
  pbp.push({
    id: `pbp-qbreak-${qNum}`,
    quarter: qNum,
    minute: 0,
    type: 'quarter-break',
    clubId: '',
    commentary: `Quarter ${qNum}`,
    isHighlight: false,
  })

  // Score tracking
  let homeGoals = 0
  let homeBehinds = 0
  let awayGoals = 0
  let awayBehinds = 0

  // Cumulative score from previous quarters
  const priorHomeTotal = ctx.currentHomeTotal
  const priorAwayTotal = ctx.currentAwayTotal

  // Chain state
  let chainId = 0
  const chain: ChainState = {
    chainId: 0,
    zone: 'midfield',
    clubId: homeClubId,
    disposalsInChain: 0,
    isHomeTeam: true,
  }

  // Tick output
  const ticks: MatchTick[] = []

  // Helper: get running score at any point
  function homeScore(): number {
    return priorHomeTotal + homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind
  }
  function awayScore(): number {
    return priorAwayTotal + awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind
  }

  // Helper: start a new chain
  function startNewChain(clubId: string, zone: FieldZone, centreBounce = false) {
    chainId++
    chain.chainId = chainId
    chain.zone = zone
    chain.clubId = clubId
    chain.isHomeTeam = clubId === homeClubId
    chain.disposalsInChain = 0
    chain.isCentreBounce = centreBounce
  }

  // Helper: get clutch context
  function getClutchCtx(isHome: boolean): ClutchContext {
    return {
      quarter: quarterIndex,
      margin: Math.abs(homeScore() - awayScore()),
      isFinal: !!isFinal,
      captainPresent: isHome ? homeCaptainPresent : awayCaptainPresent,
    }
  }

  // Helper: apply rotations for a given minute
  function applyRotations(currentMinute: number) {
    for (const event of pendingHomeRotations) {
      if (appliedRotationIds.has(event.id)) continue
      if (currentMinute < event.minute) break
      applyRotation(event, ctx.homeActivePlayers, ctx.allHomePlayers, ctx.homeStats, true)
      appliedRotationIds.add(event.id)
    }
    for (const event of pendingAwayRotations) {
      if (appliedRotationIds.has(event.id)) continue
      if (currentMinute < event.minute) break
      applyRotation(event, ctx.awayActivePlayers, ctx.allAwayPlayers, ctx.awayStats, false)
      appliedRotationIds.add(event.id)
    }
  }

  function applyRotation(
    event: RotationEvent,
    activePlayers: Player[],
    allPlayers: Player[],
    stats: MatchPlayerStats[],
    _isHome: boolean,
  ) {
    const offIdx = activePlayers.findIndex((pl) => pl.id === event.playerOffId)
    const onPlayer = allPlayers.find((pl) => pl.id === event.playerOnId)

    if (offIdx !== -1 && onPlayer && !activePlayers.some((pl) => pl.id === event.playerOnId)) {
      activePlayers.splice(offIdx, 1, onPlayer)
      if (!stats.some((s) => s.playerId === event.playerOnId)) {
        stats.push(createEmptyStats(event.playerOnId))
      }
    }
  }

  // Helper: average defender pressure for a team
  function avgDefenderPressure(players: Player[]): number {
    if (players.length === 0) return 50
    let sum = 0
    for (const p of players) {
      const g = getGranularRatings(p)
      sum += (g.tackling + g.spoiling + g.intercepting) / 3
    }
    return sum / players.length
  }

  // First chain: centre bounce → midfield
  const firstTeamHome = rng.chance(adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating))
  startNewChain(firstTeamHome ? homeClubId : awayClubId, 'midfield', true)

  // ---------------------------------------------------------------------------
  // Main tick loop
  // ---------------------------------------------------------------------------

  for (let t = 0; t < tickTarget; t++) {
    const currentMinute = Math.round((t / (tickTarget - 1)) * 30)

    // Apply any due rotations
    applyRotations(currentMinute)

    const isHome = chain.isHomeTeam
    const attackingPlayers = isHome ? homePlayers : awayPlayers
    const defendingPlayers = isHome ? awayPlayers : homePlayers
    const attackingStats = isHome ? homeStats : awayStats
    const defendingStats = isHome ? awayStats : homeStats
    const attMods = isHome ? homeMods : awayMods
    const defMods = isHome ? awayMods : homeMods
    const attackClubId = chain.clubId
    const attTactical = isHome ? homeTactical : awayTactical
    const defTactical = isHome ? awayTactical : homeTactical
    const matchupAccuracyMult = isHome ? matchup.homeAccuracyMult : matchup.awayAccuracyMult
    const matchupMarkMult = isHome ? matchup.homeMarkMult : matchup.awayMarkMult
    const matchupTackleMult = isHome ? matchup.awayTackleMult : matchup.homeTackleMult
    const attackingTeamFreeRisk = isHome ? homeTeamFreeRisk : awayTeamFreeRisk
    const defendingTeamFreeRisk = isHome ? awayTeamFreeRisk : homeTeamFreeRisk
    const attackingGameplan = isHome ? resolvedHomeGameplan : resolvedAwayGameplan

    // Zone movement profile — shaped by attacking gameplan and current zone
    const moveProfile = getZoneMovementProfile(attackingGameplan, chain.zone)

    const clutchCtx = getClutchCtx(isHome)
    const defClutchCtx = getClutchCtx(!isHome)

    // -----------------------------------------------------------------------
    // Centre bounce handling
    // At a centre bounce, the first few ticks follow structured positioning:
    //   tick 0: ruck contest (hitout)
    //   tick 1: first clearance — inside mids scramble for the ball
    //   tick 2: exit centre square — wingers and mids
    //   tick 3+: normal play resumes
    // -----------------------------------------------------------------------
    if (chain.isCentreBounce && chain.disposalsInChain < 3) {
      const bouncePhase = chain.disposalsInChain
      const bouncePlayer = pickCentreBouncePlayer(
        rng, attackingPlayers, bouncePhase, positionFitMults, clutchCtx, weather,
      )
      const bpIdx = findStatIndex(attackingStats, bouncePlayer.id)
      const bpName = getPlayerDisplayName(bouncePlayer)
      const phaseKey = bouncePhase === 0 ? 'hitout' : bouncePhase === 1 ? 'firstClearance' : 'exitSquare'
      const templates = CENTRE_BOUNCE_COMMENTARY[phaseKey]
      const commentary = fillTemplate(
        templates[rng.nextInt(0, templates.length - 1)],
        bpName, 'midfield',
      )

      // Stats
      if (bouncePhase === 0) {
        // Ruck hitout
        if (bpIdx >= 0) {
          const ruckSkill = (bouncePlayer.attributes.hitouts + bouncePlayer.attributes.leap + bouncePlayer.attributes.strength) / 3
          const gain = rng.chance(
            clampChance(getRoleSimulationMultiplier(bouncePlayer.preferredRole, 'ruck') - 0.9 + ruckSkill * 0.003),
          ) ? 2 : 1
          attackingStats[bpIdx].hitouts += gain
        }
      } else if (bouncePhase === 1) {
        // First clearance attempt
        if (bpIdx >= 0) {
          attackingStats[bpIdx].clearances++
          attackingStats[bpIdx].contestedPossessions++
          attackingStats[bpIdx].disposals++
          // Clearance is usually a kick or handball
          if (rng.chance(0.6)) {
            attackingStats[bpIdx].kicks++
          } else {
            attackingStats[bpIdx].handballs++
          }
        }
        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'clearance', clubId: attackClubId, playerId: bouncePlayer.id,
          commentary,
          isHighlight: false,
        })
      } else {
        // Exit square — general disposal
        if (bpIdx >= 0) {
          attackingStats[bpIdx].disposals++
          if (rng.chance(0.55)) {
            attackingStats[bpIdx].kicks++
          } else {
            attackingStats[bpIdx].handballs++
          }
          // Winger receives often get an uncontested possession
          if (POSITION_LINE[bouncePlayer.position.primary] === 'MID' && rng.chance(0.4)) {
            attackingStats[bpIdx].uncontestedPossessions++
          }
        }
      }

      // Zone: centre bounces start in midfield and may advance on tick 2
      let bounceZone: FieldZone = 'midfield'
      if (bouncePhase === 2) {
        // Ball exits the square — could go to forwardHalf, backHalf, or stay mid
        const exitRoll = rng.nextFloat(0, 1)
        if (exitRoll < moveProfile.forwardBias * 0.8) bounceZone = 'forwardHalf'
        else if (exitRoll < moveProfile.forwardBias * 0.8 + moveProfile.retreatBias * 0.5) bounceZone = 'backHalf'
        // else stays midfield
        chain.zone = bounceZone
      }

      const bounceDisposal: PossessionType =
        bouncePhase === 0 ? 'contest'
        : bouncePhase === 1 ? 'clearance'
        : 'kick'

      ticks.push({
        tickIndex: t,
        quarter: qNum,
        minute: currentMinute,
        zone: bounceZone,
        possessionType: bounceDisposal,
        clubId: attackClubId,
        playerId: bouncePlayer.id,
        playerName: bpName,
        homeScore: homeScore(),
        awayScore: awayScore(),
        isStoppage: false,
        commentary,
        chainId: chain.chainId,
      })

      chain.disposalsInChain++
      // After 3 ticks the centre bounce flag auto-clears (checked at top)
      continue
    }

    // 1. Pick disposal type (zone-aware)
    let disposal = pickDisposalType(rng, chain.zone, possessionMods)

    // Long-range shot from forwardHalf (~50m set shots, checkside snaps, etc.)
    // In real AFL, ~8–10% of goals come from outside forward50
    if (chain.zone === 'forwardHalf' && (disposal === 'kick' || disposal === 'mark') && rng.chance(0.10)) {
      const scorer = pickScoringPlayer(rng, attackingPlayers, positionOverrides, positionFitMults, clutchCtx)
      const scorerIdx = findStatIndex(attackingStats, scorer.id)
      const name = getPlayerDisplayName(scorer)

      // Long-range shots have reduced accuracy (0.55 multiplier)
      const shot = resolveShot(rng, scorer, weather, attMods.accuracyMult * matchupAccuracyMult * 0.55, venueScoringCoeff)

      if (shot.isGoal) {
        if (isHome) homeGoals++; else awayGoals++
        attackingStats[scorerIdx].goals++
        attackingStats[scorerIdx].scoreInvolvements++
        attackingStats[scorerIdx].insideFifties++

        keyEvents.push({
          quarter: qNum, minute: currentMinute,
          type: 'goal',
          description: `${scorer.firstName} ${scorer.lastName} kicks a long-range goal`,
          playerId: scorer.id, clubId: attackClubId,
        })

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'goal', clubId: attackClubId, playerId: scorer.id,
          commentary: `GOAL! ${name} bombs it through from outside 50 — what a kick!`,
          isHighlight: true,
        })

        ticks.push({
          tickIndex: t, quarter: qNum, minute: currentMinute,
          zone: 'forwardHalf', possessionType: 'goal',
          clubId: attackClubId, playerId: scorer.id, playerName: name,
          homeScore: homeScore(), awayScore: awayScore(),
          isStoppage: true, stoppageType: 'goal', goalPlayerId: scorer.id,
          commentary: `GOAL! ${name} bombs it through from outside 50!`,
          chainId: chain.chainId,
        })

        const nextTeamHome = rng.chance(adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating))
        startNewChain(nextTeamHome ? homeClubId : awayClubId, 'midfield', true)
        continue
      }

      if (shot.isBehind) {
        if (isHome) homeBehinds++; else awayBehinds++
        attackingStats[scorerIdx].behinds++
        attackingStats[scorerIdx].insideFifties++

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'behind', clubId: attackClubId, playerId: scorer.id,
          commentary: `${name} goes long from outside 50 — just misses`,
          isHighlight: false,
        })

        ticks.push({
          tickIndex: t, quarter: qNum, minute: currentMinute,
          zone: 'forwardHalf', possessionType: 'behind',
          clubId: attackClubId, playerId: scorer.id, playerName: name,
          homeScore: homeScore(), awayScore: awayScore(),
          isStoppage: false,
          commentary: `${name} goes long from outside 50 — just misses`,
          chainId: chain.chainId,
        })

        startNewChain(isHome ? awayClubId : homeClubId, 'back50')
        continue
      }
      // Miss completely — play continues, no score
    }

    // Override disposal in certain scenarios:
    // In forward50, ~45% of kick/mark ticks lead to a shot attempt
    if (chain.zone === 'forward50' && (disposal === 'kick' || disposal === 'mark') && rng.chance(0.45)) {
      // Shot on goal attempt
      const scorer = pickScoringPlayer(rng, attackingPlayers, positionOverrides, positionFitMults, clutchCtx)
      const scorerIdx = findStatIndex(attackingStats, scorer.id)
      const scorerRatings = getGranularRatings(scorer)
      const name = getPlayerDisplayName(scorer)

      // Who delivered inside 50 (the previous player in the chain, approximate with zone player)
      const deliverer = chain.disposalsInChain > 0
        ? pickZonePlayer(rng, attackingPlayers, 'forwardHalf', positionFitMults, clutchCtx, weather)
        : scorer

      const shot = resolveShot(rng, scorer, weather, attMods.accuracyMult * matchupAccuracyMult, venueScoringCoeff)

      if (shot.isGoal) {
        if (isHome) homeGoals++; else awayGoals++
        attackingStats[scorerIdx].goals++
        attackingStats[scorerIdx].scoreInvolvements++

        // Goal assist
        if (deliverer.id !== scorer.id) {
          const delIdx = findStatIndex(attackingStats, deliverer.id)
          if (delIdx >= 0) {
            attackingStats[delIdx].goalAssists++
            attackingStats[delIdx].scoreInvolvements++
          }
        }

        keyEvents.push({
          quarter: qNum,
          minute: currentMinute,
          type: 'goal',
          description: `${scorer.firstName} ${scorer.lastName} kicks a goal`,
          playerId: scorer.id,
          clubId: attackClubId,
        })

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'goal', clubId: attackClubId, playerId: scorer.id,
          receiverPlayerId: deliverer.id !== scorer.id ? deliverer.id : undefined,
          commentary: pickCommentary(rng, 'goal', name, 'forward50'),
          isHighlight: true,
        })

        ticks.push({
          tickIndex: t,
          quarter: qNum,
          minute: currentMinute,
          zone: 'forward50',
          possessionType: 'goal',
          clubId: attackClubId,
          playerId: scorer.id,
          playerName: name,
          homeScore: homeScore(),
          awayScore: awayScore(),
          isStoppage: true,
          stoppageType: 'goal',
          goalPlayerId: scorer.id,
          commentary: pickCommentary(rng, 'goal', name, 'forward50'),
          chainId: chain.chainId,
        })

        // Reset to midfield — centre bounce
        const nextTeamHome = rng.chance(adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating))
        startNewChain(nextTeamHome ? homeClubId : awayClubId, 'midfield', true)
        continue
      }

      if (shot.isBehind) {
        if (isHome) homeBehinds++; else awayBehinds++
        attackingStats[scorerIdx].behinds++

        keyEvents.push({
          quarter: qNum,
          minute: currentMinute,
          type: 'behind',
          description: `${scorer.firstName} ${scorer.lastName} kicks a behind`,
          playerId: scorer.id,
          clubId: attackClubId,
        })

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'behind', clubId: attackClubId, playerId: scorer.id,
          commentary: pickCommentary(rng, 'behind', name, 'forward50'),
          isHighlight: false,
        })

        ticks.push({
          tickIndex: t,
          quarter: qNum,
          minute: currentMinute,
          zone: 'forward50',
          possessionType: 'behind',
          clubId: attackClubId,
          playerId: scorer.id,
          playerName: name,
          homeScore: homeScore(),
          awayScore: awayScore(),
          isStoppage: false,
          commentary: pickCommentary(rng, 'behind', name, 'forward50'),
          chainId: chain.chainId,
        })

        // Behind → kick-in from back50 for defending team
        startNewChain(isHome ? awayClubId : homeClubId, 'back50')
        continue
      }

      // Miss (no score) — ball stays in forward50 area, possible turnover
      pbp.push({
        id: `pbp-${qNum}-${pbpCtr++}`,
        quarter: qNum, minute: currentMinute,
        type: 'miss', clubId: attackClubId, playerId: scorer.id,
        commentary: `${name} has a shot but misses — ball spills in the forward 50`,
        isHighlight: false,
      })

      // After a miss, ~50% turnover (kick-in/rebound), ~50% chain continues with crumbing
      if (rng.chance(0.50)) {
        startNewChain(isHome ? awayClubId : homeClubId, 'back50')

        ticks.push({
          tickIndex: t,
          quarter: qNum,
          minute: currentMinute,
          zone: 'forward50',
          possessionType: 'spoil',
          clubId: isHome ? awayClubId : homeClubId,
          playerName: name,
          homeScore: homeScore(),
          awayScore: awayScore(),
          isStoppage: false,
          commentary: `${name} misses — ball rebounds out of the forward line`,
          chainId: chain.chainId,
        })
        continue
      }
      // Chain continues in forward50
      chain.disposalsInChain++
      disposal = 'contest' // crumbing contest
    }

    // 2. Pick the acting player (zone-aware)
    const player = pickZonePlayer(rng, attackingPlayers, chain.zone, positionFitMults, clutchCtx, weather)
    const playerIdx = findStatIndex(attackingStats, player.id)
    const playerRatings = getGranularRatings(player)
    const name = getPlayerDisplayName(player)

    // Tactical tag penalty
    const tacticalFocus = defTactical.focusByTarget.get(player.id)
    const tagPenalty = tacticalFocus?.tagPressure ?? 0
    const roughPenalty = tacticalFocus?.roughPressure ?? 0
    const pressurePenalty = tagPenalty + roughPenalty * 0.6

    // 3. Process the disposal and accumulate stats
    let chainBreaks = false
    let newChainTeam: string | null = null
    let newChainZone: FieldZone = chain.zone
    const zoneBeforeDisposal = chain.zone

    switch (disposal) {
      case 'kick': {
        attackingStats[playerIdx].kicks++
        attackingStats[playerIdx].disposals++

        // Kick execution check
        const kickExecution = clampChance(
          weather.kickingEfficiencyMult * (0.70 + playerRatings.kicking / 280) * (1 - pressurePenalty * 0.28),
        )
        if (!rng.chance(kickExecution)) {
          // Failed kick — turnover
          attackingStats[playerIdx].turnovers++
          if (rng.chance(0.55)) attackingStats[playerIdx].clangers++
          chainBreaks = true
          newChainTeam = isHome ? awayClubId : homeClubId
          newChainZone = chain.zone

          pbp.push({
            id: `pbp-${qNum}-${pbpCtr++}`,
            quarter: qNum, minute: currentMinute,
            type: 'turnover', clubId: attackClubId, playerId: player.id,
            commentary: `${name} turns it over — kick out on the full`,
            isHighlight: true,
          })
        } else {
          // Successful kick — advance zone
          chain.zone = advanceZone(rng, chain.zone, 'kick', playerRatings.kicking, moveProfile)

          // Kick-based inside-50 recording
          if (ZONE_INDEX[chain.zone] >= 4) {
            attackingStats[playerIdx].insideFifties++
            pbp.push({
              id: `pbp-${qNum}-${pbpCtr++}`,
              quarter: qNum, minute: currentMinute,
              type: 'inside50', clubId: attackClubId, playerId: player.id,
              commentary: `${name} delivers into the forward 50`,
              isHighlight: false,
            })
          }

          // Metres gained
          attackingStats[playerIdx].metresGained += Math.max(1,
            Math.round(rng.nextInt(6, 24) * (0.75 + (playerRatings.speed + playerRatings.kicking) / 200)),
          )
        }
        break
      }

      case 'handball': {
        attackingStats[playerIdx].handballs++
        attackingStats[playerIdx].disposals++
        chain.zone = advanceZone(rng, chain.zone, 'handball', playerRatings.kicking, moveProfile)

        // Handball inside-50 recording (rare but possible)
        if (ZONE_INDEX[chain.zone] >= 4 && rng.chance(0.15)) {
          attackingStats[playerIdx].insideFifties++
        }

        attackingStats[playerIdx].metresGained += Math.max(0, rng.nextInt(2, 10))
        break
      }

      case 'mark': {
        attackingStats[playerIdx].marks++

        // Contested mark check
        if (rng.chance(clampChance(0.08 + player.attributes.markingContested * 0.005))) {
          attackingStats[playerIdx].contestedMarks++
          attackingStats[playerIdx].contestedPossessions++
          pbp.push({
            id: `pbp-${qNum}-${pbpCtr++}`,
            quarter: qNum, minute: currentMinute,
            type: 'contested-mark', clubId: attackClubId, playerId: player.id,
            commentary: `${name} takes a contested mark`,
            isHighlight: true,
          })
        } else {
          attackingStats[playerIdx].uncontestedPossessions++
          pbp.push({
            id: `pbp-${qNum}-${pbpCtr++}`,
            quarter: qNum, minute: currentMinute,
            type: 'mark', clubId: attackClubId, playerId: player.id,
            commentary: `${name} takes the mark`,
            isHighlight: false,
          })
        }

        chain.zone = advanceZone(rng, chain.zone, 'mark', playerRatings.kicking, moveProfile)
        break
      }

      case 'tackle': {
        // Tackle is a defensive action — pick defender
        const tackler = pickZonePlayer(rng, defendingPlayers, chain.zone, positionFitMults, defClutchCtx, weather)
        const tacklerIdx = findStatIndex(defendingStats, tackler.id)
        const tacklerRatings = getGranularRatings(tackler)
        const tacklerName = getPlayerDisplayName(tackler)

        const tackleGain = rng.chance(
          clampChance(
            getRoleSimulationMultiplier(tackler.preferredRole, 'defense') - 0.95 +
            tacklerRatings.tackling * 0.0025 +
            tacklerRatings.strength * 0.0015,
          ),
        ) ? 2 : 1
        defendingStats[tacklerIdx].tackles += tackleGain

        // High contact check — free kick to attacking team
        const tacklerFreeRisk = getPlayerFreeRiskMultiplier(tackler, weather)
        const highContactChance = clampChance(
          0.0075 * defendingTeamFreeRisk * tacklerFreeRisk * matchupTackleMult *
          (1 + (tacticalFocus?.extraFreeRisk ?? 0) * 2.8) * suspensionStrictness,
        )
        if (rng.chance(highContactChance)) {
          defendingStats[tacklerIdx].freesAgainst++
          attackingStats[playerIdx].freesFor++
          // Free kick awarded — chain continues for attacking team
          pbp.push({
            id: `pbp-${qNum}-${pbpCtr++}`,
            quarter: qNum, minute: currentMinute,
            type: 'free-kick', clubId: attackClubId, playerId: player.id,
            defenderPlayerId: tackler.id, defenderClubId: isHome ? awayClubId : homeClubId,
            commentary: `Free kick to ${name} — high contact tackle`,
            detail: 'High contact tackle',
            isHighlight: false,
          })
          disposal = 'free-for'
        } else {
          // Tackle forces turnover ~45% of the time
          if (rng.chance(0.45)) {
            chainBreaks = true
            newChainTeam = isHome ? awayClubId : homeClubId
            newChainZone = chain.zone
          }
          pbp.push({
            id: `pbp-${qNum}-${pbpCtr++}`,
            quarter: qNum, minute: currentMinute,
            type: 'tackle', clubId: isHome ? awayClubId : homeClubId,
            playerId: tackler.id, defenderPlayerId: player.id,
            commentary: `${tacklerName} tackles ${name}`,
            isHighlight: false,
          })
        }
        chain.zone = advanceZone(rng, chain.zone, 'tackle', playerRatings.kicking, moveProfile)
        break
      }

      case 'contest': {
        attackingStats[playerIdx].contestedPossessions++

        // Holding-the-ball free kick check
        const attackerFreeRisk = getPlayerFreeRiskMultiplier(player, weather)
        const holdingBallChance = clampChance(0.006 * attackingTeamFreeRisk * attackerFreeRisk)
        if (rng.chance(holdingBallChance)) {
          const tackler = pickZonePlayer(rng, defendingPlayers, chain.zone, positionFitMults, defClutchCtx, weather)
          const tacklerIdx = findStatIndex(defendingStats, tackler.id)
          attackingStats[playerIdx].freesAgainst++
          if (tacklerIdx >= 0) defendingStats[tacklerIdx].freesFor++
          chainBreaks = true
          newChainTeam = isHome ? awayClubId : homeClubId
          newChainZone = chain.zone
        }
        chain.zone = advanceZone(rng, chain.zone, 'contest', playerRatings.kicking, moveProfile)
        break
      }

      case 'clearance': {
        attackingStats[playerIdx].clearances++
        attackingStats[playerIdx].contestedPossessions++
        chain.zone = 'midfield'

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'clearance', clubId: attackClubId, playerId: player.id,
          commentary: `${name} wins the clearance`,
          isHighlight: false,
        })
        break
      }

      case 'free-for': {
        attackingStats[playerIdx].freesFor++
        // Pick a defender who gave away the free
        const offender = pickZonePlayer(rng, defendingPlayers, chain.zone, positionFitMults, defClutchCtx, weather)
        const offenderIdx = findStatIndex(defendingStats, offender.id)
        if (offenderIdx >= 0) defendingStats[offenderIdx].freesAgainst++
        chain.zone = advanceZone(rng, chain.zone, 'free-for', playerRatings.kicking, moveProfile)

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'free-kick', clubId: attackClubId, playerId: player.id,
          commentary: `Free kick to ${name}`,
          isHighlight: false,
        })
        break
      }

      case 'spoil': {
        // Spoil is a defensive action
        const spoiler = pickZonePlayer(rng, defendingPlayers, chain.zone, positionFitMults, defClutchCtx, weather)
        const spoilerIdx = findStatIndex(defendingStats, spoiler.id)
        defendingStats[spoilerIdx].onePercenters++

        chain.zone = advanceZone(rng, chain.zone, 'spoil', playerRatings.kicking, moveProfile)

        // Spoil often leads to turnover or loose ball
        if (rng.chance(0.55)) {
          chainBreaks = true
          newChainTeam = isHome ? awayClubId : homeClubId
          newChainZone = chain.zone
        }
        break
      }

      case 'out-of-bounds': {
        // Chain breaks — throw-in at same zone
        chainBreaks = true
        // 50/50 who gets it from the throw-in
        newChainTeam = rng.chance(adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating))
          ? homeClubId : awayClubId
        newChainZone = chain.zone
        break
      }

      case 'ball-up': {
        // Chain breaks — ball-up at same zone
        chainBreaks = true
        newChainTeam = rng.chance(adjustedHomeRating / (adjustedHomeRating + adjustedAwayRating))
          ? homeClubId : awayClubId
        newChainZone = chain.zone
        break
      }

      case 'out-on-full': {
        // Turnover — free kick to other team
        attackingStats[playerIdx].turnovers++
        attackingStats[playerIdx].clangers++
        chainBreaks = true
        newChainTeam = isHome ? awayClubId : homeClubId
        newChainZone = chain.zone
        break
      }

      default:
        break
    }

    // Hitout check for rucks (on any tick in midfield)
    if (chain.zone === 'midfield' && rng.chance(0.06 * attMods.hitoutMult)) {
      const ruck = attackingPlayers.find((pl) => pl.position.primary === 'RK')
      if (ruck) {
        const ruckIdx = findStatIndex(attackingStats, ruck.id)
        if (ruckIdx >= 0) {
          const ruckSkill = (ruck.attributes.hitouts + ruck.attributes.leap + ruck.attributes.strength) / 3
          const hitoutGain = rng.chance(
            clampChance(getRoleSimulationMultiplier(ruck.preferredRole, 'ruck') - 0.9 + ruckSkill * 0.003),
          ) ? 2 : 1
          attackingStats[ruckIdx].hitouts += hitoutGain
        }
      }
    }

    // Intercept check (defensive)
    if (!chainBreaks && disposal !== 'goal' && disposal !== 'behind' && rng.chance(0.025)) {
      const interceptor = pickZonePlayer(rng, defendingPlayers, chain.zone, positionFitMults, defClutchCtx, weather)
      const intIdx = findStatIndex(defendingStats, interceptor.id)
      if (intIdx >= 0) {
        const interceptorRatings = getGranularRatings(interceptor)
        const interceptBoost = defTactical.interceptBoostByPlayer.get(interceptor.id) ?? 0
        const interceptGain = rng.chance(
          clampChance(
            getRoleSimulationMultiplier(interceptor.preferredRole, 'defense') - 0.92 +
            interceptorRatings.intercepting * 0.002 +
            interceptorRatings.spoiling * 0.0012 +
            interceptBoost,
          ),
        ) ? 2 : 1
        defendingStats[intIdx].intercepts += interceptGain

        pbp.push({
          id: `pbp-${qNum}-${pbpCtr++}`,
          quarter: qNum, minute: currentMinute,
          type: 'intercept',
          clubId: isHome ? awayClubId : homeClubId,
          playerId: interceptor.id, defenderPlayerId: player.id, defenderClubId: attackClubId,
          commentary: `${getPlayerDisplayName(interceptor)} intercepts`,
          isHighlight: true,
        })

        chainBreaks = true
        newChainTeam = isHome ? awayClubId : homeClubId
        newChainZone = chain.zone
      }
    }

    // Rebound-50 check when defending team regains in back zones
    if (chainBreaks && newChainTeam && ZONE_INDEX[newChainZone] <= 1) {
      const reboundTeamStats = newChainTeam === homeClubId ? homeStats : awayStats
      const reboundPlayers = newChainTeam === homeClubId ? homePlayers : awayPlayers
      const rebounder = pickZonePlayer(rng, reboundPlayers, newChainZone, positionFitMults, getClutchCtx(newChainTeam === homeClubId), weather)
      const rebIdx = findStatIndex(reboundTeamStats, rebounder.id)
      if (rebIdx >= 0 && rng.chance(0.12)) {
        reboundTeamStats[rebIdx].rebound50s++
      }
    }

    // Bounce check
    if (disposal === 'kick' && !chainBreaks && rng.chance(clampChance(0.01 + playerRatings.speed * 0.0002 + playerRatings.agility * 0.0002))) {
      attackingStats[playerIdx].bounces++
    }

    // One-percenter check (defensive)
    if (rng.chance(0.025)) {
      const defender = pickZonePlayer(rng, defendingPlayers, chain.zone, positionFitMults, defClutchCtx, weather)
      const defIdx = findStatIndex(defendingStats, defender.id)
      if (defIdx >= 0) defendingStats[defIdx].onePercenters++
    }

    // Uncontested/contested possession tracking for non-special disposals
    if (disposal === 'kick' || disposal === 'handball') {
      const contestedChance = clampChance(
        (0.22 + playerRatings.strength * 0.0012 + playerRatings.tackling * 0.0012) *
        attMods.contestedMult * weather.contestedMult * venueContestedCoeff *
        (1 + tagPenalty * 0.1),
      )
      if (rng.chance(contestedChance)) {
        attackingStats[playerIdx].contestedPossessions++
      } else {
        const uncontestedRoll = 0.65 + (playerRatings.decisionMaking + playerRatings.agility) / 220
        if (rng.chance(clampChance(uncontestedRoll * attMods.uncontestedMult * (1 - pressurePenalty * 0.22)))) {
          attackingStats[playerIdx].uncontestedPossessions++
        }
      }
    }

    // Natural turnover check (additional to disposal-specific turnovers)
    if (!chainBreaks && disposal !== 'goal' && disposal !== 'behind' && disposal !== 'mark' && disposal !== 'free-for') {
      const turnoverChance = getTurnoverChance(rng, chain, player, weather, avgDefenderPressure(defendingPlayers), disposal)
      if (rng.chance(turnoverChance)) {
        attackingStats[playerIdx].turnovers++
        if (rng.chance(clampChance(0.3 + (100 - playerRatings.decisionMaking) * 0.004))) {
          attackingStats[playerIdx].clangers++
        }
        chainBreaks = true
        newChainTeam = isHome ? awayClubId : homeClubId
        newChainZone = chain.zone
      }
    }

    // Inside-50 recording: when ball enters forward50 from a less-forward zone
    if (!chainBreaks && chain.zone === 'forward50' && ZONE_INDEX[zoneBeforeDisposal] < 4 && disposal !== 'kick') {
      attackingStats[playerIdx].insideFifties++
    }

    // Detect if the ball went backward (zone retreated within the same chain)
    const zoneRetreated = !chainBreaks && ZONE_INDEX[chain.zone] < ZONE_INDEX[zoneBeforeDisposal]

    // Generate the tick
    const isStoppageType = disposal === 'ball-up'
    ticks.push({
      tickIndex: t,
      quarter: qNum,
      minute: currentMinute,
      zone: chain.zone,
      possessionType: disposal,
      clubId: chainBreaks && newChainTeam && (disposal === 'tackle' || disposal === 'spoil')
        ? newChainTeam // attribute defensive actions to the defending team
        : attackClubId,
      playerId: player.id,
      playerName: name,
      homeScore: homeScore(),
      awayScore: awayScore(),
      isStoppage: isStoppageType,
      stoppageType: isStoppageType ? 'ball-up' : undefined,
      commentary: pickCommentary(rng, disposal, name, chain.zone, chain.disposalsInChain, zoneRetreated),
      chainId: chain.chainId,
    })

    // Increment chain disposals
    chain.disposalsInChain++

    // Apply chain break if needed
    if (chainBreaks && newChainTeam) {
      startNewChain(newChainTeam, newChainZone)
    }
  }

  // ---------------------------------------------------------------------------
  // Finalize quarter scores
  // ---------------------------------------------------------------------------

  const homeQScore = homeGoals * pointsPerGoal + homeBehinds * pointsPerBehind
  const awayQScore = awayGoals * pointsPerGoal + awayBehinds * pointsPerBehind
  ctx.homeScores.push({ goals: homeGoals, behinds: homeBehinds, total: homeQScore })
  ctx.awayScores.push({ goals: awayGoals, behinds: awayBehinds, total: awayQScore })
  ctx.currentHomeTotal += homeQScore
  ctx.currentAwayTotal += awayQScore
  ctx.quartersCompleted++

  // Ensure final tick reflects exact quarter-end scores
  if (ticks.length > 0) {
    const last = ticks[ticks.length - 1]
    last.homeScore = ctx.currentHomeTotal
    last.awayScore = ctx.currentAwayTotal
  }

  return ticks
}

// ---------------------------------------------------------------------------
// Helper: create empty player stats (mirrors simulateMatch.ts)
// ---------------------------------------------------------------------------

function createEmptyStats(playerId: string): MatchPlayerStats {
  return {
    playerId,
    participated: true,
    minutesPlayed: 0,
    aflFantasyPoints: 0,
    superCoachPoints: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    goals: 0,
    behinds: 0,
    hitouts: 0,
    contestedPossessions: 0,
    uncontestedPossessions: 0,
    clearances: 0,
    insideFifties: 0,
    rebound50s: 0,
    freesFor: 0,
    freesAgainst: 0,
    contestedMarks: 0,
    scoreInvolvements: 0,
    metresGained: 0,
    turnovers: 0,
    intercepts: 0,
    onePercenters: 0,
    bounces: 0,
    clangers: 0,
    goalAssists: 0,
  }
}

// ---------------------------------------------------------------------------
// Helper: player free risk multiplier (mirrors simulateMatch.ts)
// ---------------------------------------------------------------------------

function getPlayerFreeRiskMultiplier(player: Player, weather: WeatherModifiers): number {
  const discipline = getGranularRatings(player).discipline
  const aggressionProfile = (player.attributes.pressure + player.attributes.hardness + player.attributes.tackling) / 3
  const disciplinePenalty = Math.max(0, (72 - discipline) / 110)
  const aggressionPenalty = Math.max(0, (aggressionProfile - 60) / 170)
  const temperamentPenalty = Math.max(0, (55 - player.personality.temperament) / 135)
  const weatherPenalty = weather.condition === 'wet' ? 0.06 : weather.groundCondition === 'muddy' ? 0.1 : 0
  return Math.max(0.75, Math.min(1.65, 1 + disciplinePenalty + aggressionPenalty + temperamentPenalty + weatherPenalty))
}
