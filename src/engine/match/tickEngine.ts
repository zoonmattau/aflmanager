/**
 * @deprecated This module is superseded by chainEngine.ts.
 * The unified chain engine produces MatchTick[] directly during simulation,
 * eliminating the need for post-hoc tick fabrication.
 * This file is kept temporarily for reference. It can be deleted once
 * chainEngine.ts is confirmed stable.
 */
import type { MatchKeyEvent } from '@/types/match'
import type { FieldZone, PossessionType, MatchTick } from '@/types/matchTick'
import type { ClubGameplan } from '@/types/club'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Commentary templates
// ---------------------------------------------------------------------------

// Zone-aware kick templates: keyed by where the ball is NOW
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

function fillTemplate(template: string, name: string, zone: FieldZone): string {
  return template
    .replace('{name}', name)
    .replace('{zone}', zone.replace(/([A-Z])/g, ' $1').toLowerCase().trim())
}

function pickCommentary(rng: SeededRNG, type: PossessionType, name: string, zone: FieldZone): string {
  const templates = type === 'kick' ? KICK_BY_ZONE[zone] : COMMENTARY[type]
  const template = templates[rng.nextInt(0, templates.length - 1)]
  return fillTemplate(template, name, zone)
}

// ---------------------------------------------------------------------------
// Zone helpers
// ---------------------------------------------------------------------------

const ZONES: FieldZone[] = ['back50', 'backHalf', 'midfield', 'forwardHalf', 'forward50']
const ZONE_INDEX: Record<FieldZone, number> = { back50: 0, backHalf: 1, midfield: 2, forwardHalf: 3, forward50: 4 }

/** Pick an initial zone for a new chain (biased toward midfield / back-half). */
function chainStartZone(rng: SeededRNG): FieldZone {
  const w = [5, 20, 45, 20, 10]
  const total = w.reduce((a, b) => a + b, 0)
  let r = rng.nextInt(0, total - 1)
  for (let i = 0; i < ZONES.length; i++) {
    r -= w[i]
    if (r < 0) return ZONES[i]
  }
  return 'midfield'
}

/**
 * Advance the zone logically within a chain.
 * Kicks/marks tend to push forward (toward forward50).
 * Handballs stay in the same zone.
 * Tackles/contests may push backward.
 */
function advanceZone(rng: SeededRNG, prevZone: FieldZone, possession: PossessionType): FieldZone {
  const idx = ZONE_INDEX[prevZone]

  if (possession === 'handball' || possession === 'free-for') {
    // Short ball — mostly stays, small chance to advance
    if (rng.chance(0.25) && idx < 4) return ZONES[idx + 1]
    return prevZone
  }

  if (possession === 'kick' || possession === 'mark') {
    // Forward movement — 55% advance, 30% stay, 15% big advance (skip 1)
    const roll = rng.nextFloat(0, 1)
    if (roll < 0.15 && idx < 3) return ZONES[Math.min(idx + 2, 4)]
    if (roll < 0.70 && idx < 4) return ZONES[idx + 1]
    return prevZone
  }

  if (possession === 'tackle' || possession === 'contest') {
    // Contested — 30% pushed back, 50% stays, 20% breaks forward
    const roll = rng.nextFloat(0, 1)
    if (roll < 0.30 && idx > 0) return ZONES[idx - 1]
    if (roll < 0.80) return prevZone
    if (idx < 4) return ZONES[idx + 1]
    return prevZone
  }

  if (possession === 'spoil') {
    // Spoiled — ball goes to ground, usually stays or drifts back
    if (rng.chance(0.35) && idx > 0) return ZONES[idx - 1]
    return prevZone
  }

  if (possession === 'out-of-bounds' || possession === 'ball-up') {
    // Stoppage — throw-in or ball-up, zone stays the same
    return prevZone
  }

  if (possession === 'out-on-full') {
    // Penalty — free kick the other way, zone typically stays
    return prevZone
  }

  // clearance — restart from midfield area
  if (possession === 'clearance') {
    return rng.chance(0.7) ? 'midfield' : (rng.chance(0.5) ? 'backHalf' : 'forwardHalf')
  }

  return prevZone
}

function goalZone(rng: SeededRNG): FieldZone {
  return rng.chance(0.7) ? 'forward50' : 'forwardHalf'
}

// ---------------------------------------------------------------------------
// Possession type picker
// ---------------------------------------------------------------------------

const BASE_POSSESSION_WEIGHTS: Record<string, number> = {
  kick: 26,
  handball: 22,
  mark: 13,
  tackle: 10,
  clearance: 7,
  contest: 6,
  'free-for': 3,
  spoil: 5,
  'out-of-bounds': 4,
  'ball-up': 2,
  'out-on-full': 2,
}

/**
 * Derive possession-weight modifiers from both teams' gameplans.
 * Returns multiplier adjustments per possession type — combined effect of both teams.
 */
function buildPossessionModifiers(
  home?: ClubGameplan | null,
  away?: ClubGameplan | null,
): Record<string, number> {
  const mods: Record<string, number> = {}

  for (const gp of [home, away]) {
    if (!gp) continue

    // Cluster stoppage → congested, more ball-ups & contests
    // Spread stoppage → cleaner ball, more kicks/marks
    if (gp.stoppageTactic === 'cluster') {
      mods['ball-up'] = (mods['ball-up'] ?? 0) + 1.5
      mods['contest'] = (mods['contest'] ?? 0) + 1.0
      mods['spoil'] = (mods['spoil'] ?? 0) + 0.5
    } else if (gp.stoppageTactic === 'spread') {
      mods['ball-up'] = (mods['ball-up'] ?? 0) - 0.5
      mods['kick'] = (mods['kick'] ?? 0) + 1.0
      mods['mark'] = (mods['mark'] ?? 0) + 0.5
    }

    // Fast tempo → more out-of-bounds (hurried play), more turnovers
    // Slow tempo → more congestion, more ball-ups
    if (gp.tempo === 'fast') {
      mods['out-of-bounds'] = (mods['out-of-bounds'] ?? 0) + 1.0
      mods['out-on-full'] = (mods['out-on-full'] ?? 0) + 0.5
    } else if (gp.tempo === 'slow') {
      mods['ball-up'] = (mods['ball-up'] ?? 0) + 0.5
      mods['contest'] = (mods['contest'] ?? 0) + 0.5
      mods['handball'] = (mods['handball'] ?? 0) + 1.0
    }

    // High aggression → more tackles, spoils, free kicks
    if (gp.aggression === 'high') {
      mods['tackle'] = (mods['tackle'] ?? 0) + 1.5
      mods['spoil'] = (mods['spoil'] ?? 0) + 1.0
      mods['free-for'] = (mods['free-for'] ?? 0) + 0.5
    } else if (gp.aggression === 'low') {
      mods['tackle'] = (mods['tackle'] ?? 0) - 1.0
      mods['spoil'] = (mods['spoil'] ?? 0) - 0.5
    }

    // Press defensive line → more stoppages near boundary, spoils
    if (gp.defensiveLine === 'press') {
      mods['spoil'] = (mods['spoil'] ?? 0) + 1.0
      mods['out-of-bounds'] = (mods['out-of-bounds'] ?? 0) + 0.5
      mods['tackle'] = (mods['tackle'] ?? 0) + 0.5
    } else if (gp.defensiveLine === 'zone') {
      mods['kick'] = (mods['kick'] ?? 0) + 0.5
      mods['mark'] = (mods['mark'] ?? 0) + 0.5
    }

    // Wide switching → more out on full risk, more out of bounds
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

function buildWeightedTable(
  mods: Record<string, number>,
): { types: PossessionType[]; cumulative: number[] } {
  const types: PossessionType[] = []
  const cumulative: number[] = []
  let total = 0
  for (const [type, base] of Object.entries(BASE_POSSESSION_WEIGHTS)) {
    const adjusted = Math.max(0.5, base + (mods[type] ?? 0))
    total += adjusted
    types.push(type as PossessionType)
    cumulative.push(total)
  }
  return { types, cumulative }
}

function pickPossessionType(
  rng: SeededRNG,
  table: { types: PossessionType[]; cumulative: number[] },
): PossessionType {
  const total = table.cumulative[table.cumulative.length - 1]
  const r = rng.nextFloat(0, 1) * total
  for (let i = 0; i < table.cumulative.length; i++) {
    if (r < table.cumulative[i]) return table.types[i]
  }
  return 'kick'
}

// ---------------------------------------------------------------------------
// Player name helpers
// ---------------------------------------------------------------------------

function pickPlayerName(
  rng: SeededRNG,
  ids: string[],
  playerNames: Record<string, string>,
  fallback: string,
): string {
  if (ids.length === 0) return fallback
  const id = ids[rng.nextInt(0, ids.length - 1)]
  return playerNames[id] ?? fallback
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface QuarterTickContext {
  keyEvents: MatchKeyEvent[]
  quarterIndex: number   // 0-based
  homeClubId: string
  awayClubId: string
  homeAbbr: string
  awayAbbr: string
  playerNames: Record<string, string>   // playerId → display name
  homePlayerIds: string[]               // all home player IDs (for synthetic ticks)
  awayPlayerIds: string[]               // all away player IDs (for synthetic ticks)
  homeScoreAtStart: { goals: number; behinds: number; total: number }
  awayScoreAtStart: { goals: number; behinds: number; total: number }
  quarterHomeScore: { goals: number; behinds: number; total: number }
  quarterAwayScore: { goals: number; behinds: number; total: number }
  /** Optional gameplans — influence commentary flavour (stoppage rates, boundary play, etc.) */
  homeGameplan?: ClubGameplan | null
  awayGameplan?: ClubGameplan | null
}

/**
 * Converts a completed quarter's key events + scores into a replay stream of
 * MatchTick objects to be played back at the user-selected speed.
 *
 * The match engine is NOT touched — this is display-only.
 */
export function generateQuarterTicks(
  ctx: QuarterTickContext,
  displayRng: SeededRNG,
): MatchTick[] {
  const {
    keyEvents,
    quarterIndex,
    homeClubId,
    awayClubId,
    homeAbbr,
    awayAbbr,
    playerNames,
    homePlayerIds,
    awayPlayerIds,
    homeScoreAtStart,
    awayScoreAtStart,
    quarterHomeScore,
    quarterAwayScore,
    homeGameplan,
    awayGameplan,
  } = ctx

  const quarter = quarterIndex + 1

  // Build possession type weights adjusted by both teams' gameplans
  const possessionMods = buildPossessionModifiers(homeGameplan, awayGameplan)
  const possessionTable = buildWeightedTable(possessionMods)

  // Filter key events to this quarter (1-based in the events)
  const qEvents = keyEvents.filter((e) => e.quarter === quarter)

  // Total synthetic possessions for the quarter
  const TOTAL_POSSESSIONS = displayRng.nextInt(65, 95)

  // --- Build a sparse map of possession-slot → key event ---
  // Assign each key event to a slot based on its minute
  const slotMap = new Map<number, MatchKeyEvent>()
  for (const evt of qEvents) {
    const slot = Math.round((evt.minute / 30) * (TOTAL_POSSESSIONS - 1))
    // If slot taken, shift +1
    let s = slot
    while (slotMap.has(s) && s < TOTAL_POSSESSIONS - 1) s++
    slotMap.set(s, evt)
  }

  // --- Running score accumulators ---
  let homeGoals = homeScoreAtStart.goals
  let homeBehinds = homeScoreAtStart.behinds
  let homeTotal = homeScoreAtStart.total
  let awayGoals = awayScoreAtStart.goals
  let awayBehinds = awayScoreAtStart.behinds
  let awayTotal = awayScoreAtStart.total

  // Pre-compute how many goals/behinds each team kicks this quarter
  // so we can distribute the score increments across the tick stream
  const targetHomeGoals = quarterHomeScore.goals
  const targetHomeBehinds = quarterHomeScore.behinds
  const targetAwayGoals = quarterAwayScore.goals
  const targetAwayBehinds = quarterAwayScore.behinds

  // Already-assigned scoring from slotted key events
  let assignedHomeGoals = 0
  let assignedHomeBehinds = 0
  let assignedAwayGoals = 0
  let assignedAwayBehinds = 0

  for (const [, evt] of slotMap) {
    if (evt.type === 'goal') {
      if (evt.clubId === homeClubId) assignedHomeGoals++
      else assignedAwayGoals++
    } else if (evt.type === 'behind') {
      if (evt.clubId === homeClubId) assignedHomeBehinds++
      else assignedAwayBehinds++
    }
  }

  // Remaining goals/behinds to distribute as synthetic scoring ticks
  const remainingHomeGoals = Math.max(0, targetHomeGoals - assignedHomeGoals)
  const remainingHomeBehinds = Math.max(0, targetHomeBehinds - assignedHomeBehinds)
  const remainingAwayGoals = Math.max(0, targetAwayGoals - assignedAwayGoals)
  const remainingAwayBehinds = Math.max(0, targetAwayBehinds - assignedAwayBehinds)

  // Build a pool of extra scoring events for unoccupied slots
  type ExtraScore = { clubId: string; isGoal: boolean }
  const extraScores: ExtraScore[] = []
  for (let i = 0; i < remainingHomeGoals; i++) extraScores.push({ clubId: homeClubId, isGoal: true })
  for (let i = 0; i < remainingHomeBehinds; i++) extraScores.push({ clubId: homeClubId, isGoal: false })
  for (let i = 0; i < remainingAwayGoals; i++) extraScores.push({ clubId: awayClubId, isGoal: true })
  for (let i = 0; i < remainingAwayBehinds; i++) extraScores.push({ clubId: awayClubId, isGoal: false })
  // Shuffle so they're distributed naturally
  const shuffledExtras = displayRng.shuffle(extraScores)

  // Identify free slots for extra scoring ticks
  const freeSlots: number[] = []
  for (let i = 0; i < TOTAL_POSSESSIONS; i++) {
    if (!slotMap.has(i)) freeSlots.push(i)
  }
  const shuffledFreeSlots = displayRng.shuffle(freeSlots)

  // Slot extra scoring events — spaced at least 2 slots away from key events and each other
  // so the player never sees back-to-back empty-chain ticks.
  const allFilledSlots = new Set(slotMap.keys())
  const extraSlotMap = new Map<number, ExtraScore>()
  let extraPlaced = 0
  for (let fi = 0; fi < shuffledFreeSlots.length && extraPlaced < shuffledExtras.length; fi++) {
    const s = shuffledFreeSlots[fi]
    if (!allFilledSlots.has(s - 1) && !allFilledSlots.has(s + 1)) {
      extraSlotMap.set(s, shuffledExtras[extraPlaced++])
      allFilledSlots.add(s)
    }
  }
  // Fallback: place any remaining extras in any free slot (avoids losing score events)
  for (let fi = 0; fi < shuffledFreeSlots.length && extraPlaced < shuffledExtras.length; fi++) {
    const s = shuffledFreeSlots[fi]
    if (!extraSlotMap.has(s)) {
      extraSlotMap.set(s, shuffledExtras[extraPlaced++])
    }
  }

  // --- Build tick array ---
  const ticks: MatchTick[] = []

  // chainId tracks possession chains: increments whenever possession changes team or a
  // clearance / stoppage restarts play. Goals/behinds share the chainId of the chain that scored.
  let chainId = 0
  let lastChainClubId = ''
  let currentZone: FieldZone = 'midfield'  // tracks zone flow within a chain

  for (let i = 0; i < TOTAL_POSSESSIONS; i++) {
    const minute = Math.round((i / (TOTAL_POSSESSIONS - 1)) * 30)

    const keyEvt = slotMap.get(i)
    const extraScore = extraSlotMap.get(i)

    if (keyEvt) {
      // --- Key event tick ---
      const _abbr = keyEvt.clubId === homeClubId ? homeAbbr : awayAbbr
      const name = (keyEvt.playerId ? playerNames[keyEvt.playerId] : undefined) ?? _abbr

      if (keyEvt.type === 'goal') {
        // Goals end the current chain — keep same chainId so they belong to the chain that scored.
        // After this tick, the chain resets (next possession increments chainId automatically).
        if (keyEvt.clubId !== lastChainClubId) { chainId++; lastChainClubId = keyEvt.clubId; currentZone = chainStartZone(displayRng) }
        const zone = goalZone(displayRng)
        currentZone = zone
        homeGoals += keyEvt.clubId === homeClubId ? 1 : 0
        awayGoals += keyEvt.clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone,
          possessionType: 'goal',
          clubId: keyEvt.clubId,
          playerId: keyEvt.playerId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: true,
          stoppageType: 'goal',
          goalPlayerId: keyEvt.playerId,
          commentary: pickCommentary(displayRng, 'goal', name, zone),
          chainId,
        })
        // Force new chain after score
        lastChainClubId = ''
        currentZone = 'midfield'
      } else if (keyEvt.type === 'behind') {
        if (keyEvt.clubId !== lastChainClubId) { chainId++; lastChainClubId = keyEvt.clubId; currentZone = chainStartZone(displayRng) }
        const zone = goalZone(displayRng)
        currentZone = zone
        homeBehinds += keyEvt.clubId === homeClubId ? 1 : 0
        awayBehinds += keyEvt.clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone,
          possessionType: 'behind',
          clubId: keyEvt.clubId,
          playerId: keyEvt.playerId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: false,
          commentary: pickCommentary(displayRng, 'behind', name, zone),
          chainId,
        })
        lastChainClubId = ''
        currentZone = 'midfield'
      } else if (keyEvt.type === 'injury') {
        // Injuries always start a new chain
        chainId++
        lastChainClubId = keyEvt.clubId
        currentZone = 'midfield'
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone: 'midfield',
          possessionType: 'injury',
          clubId: keyEvt.clubId,
          playerId: keyEvt.playerId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: true,
          stoppageType: 'injury',
          injuryPlayerId: keyEvt.playerId,
          commentary: pickCommentary(displayRng, 'injury', name, 'midfield'),
          chainId,
        })
        lastChainClubId = ''
      } else {
        // milestone, tactical-change etc — treat as normal possession tick
        const pt = pickPossessionType(displayRng, possessionTable)
        if (keyEvt.clubId !== lastChainClubId || pt === 'clearance') {
          chainId++
          lastChainClubId = keyEvt.clubId
          currentZone = pt === 'clearance' ? 'midfield' : chainStartZone(displayRng)
        } else {
          currentZone = advanceZone(displayRng, currentZone, pt)
        }
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone: currentZone,
          possessionType: pt,
          clubId: keyEvt.clubId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: false,
          commentary: keyEvt.description || pickCommentary(displayRng, pt, name, currentZone),
          chainId,
        })
      }
    } else if (extraScore) {
      // --- Extra scoring tick (not in key events, synthetic) ---
      const clubId = extraScore.clubId
      const abbr = clubId === homeClubId ? homeAbbr : awayAbbr
      const playerIds = clubId === homeClubId ? homePlayerIds : awayPlayerIds
      const name = pickPlayerName(displayRng, playerIds, playerNames, abbr)

      if (extraScore.isGoal) {
        if (clubId !== lastChainClubId) { chainId++; lastChainClubId = clubId; currentZone = chainStartZone(displayRng) }
        const zone = goalZone(displayRng)
        currentZone = zone
        homeGoals += clubId === homeClubId ? 1 : 0
        awayGoals += clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone,
          possessionType: 'goal',
          clubId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: true,
          stoppageType: 'goal',
          commentary: pickCommentary(displayRng, 'goal', name, zone),
          chainId,
        })
        lastChainClubId = ''
        currentZone = 'midfield'
      } else {
        if (clubId !== lastChainClubId) { chainId++; lastChainClubId = clubId; currentZone = chainStartZone(displayRng) }
        const zone = goalZone(displayRng)
        currentZone = zone
        homeBehinds += clubId === homeClubId ? 1 : 0
        awayBehinds += clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone,
          possessionType: 'behind',
          clubId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: false,
          commentary: pickCommentary(displayRng, 'behind', name, zone),
          chainId,
        })
        lastChainClubId = ''
        currentZone = 'midfield'
      }
    } else {
      // --- Synthetic possession tick ---
      // Loosely alternate home/away
      const clubId = displayRng.chance(0.5) ? homeClubId : awayClubId
      const abbr = clubId === homeClubId ? homeAbbr : awayAbbr
      const playerIds = clubId === homeClubId ? homePlayerIds : awayPlayerIds
      const pt = pickPossessionType(displayRng, possessionTable)
      const name = pickPlayerName(displayRng, playerIds, playerNames, abbr)

      const isStoppageType = pt === 'ball-up'
      const isChainBreaker = pt === 'clearance' || pt === 'ball-up' || pt === 'out-of-bounds' || pt === 'out-on-full'

      // New chain when team changes, or after stoppages / turnovers
      if (clubId !== lastChainClubId || isChainBreaker) {
        chainId++
        lastChainClubId = clubId
        if (pt === 'clearance' || pt === 'ball-up') {
          // Stoppages restart from roughly the same zone or midfield
          currentZone = pt === 'clearance' ? 'midfield' : currentZone
        } else {
          currentZone = chainStartZone(displayRng)
        }
      } else {
        currentZone = advanceZone(displayRng, currentZone, pt)
      }

      ticks.push({
        tickIndex: i,
        quarter,
        minute,
        zone: currentZone,
        possessionType: pt,
        clubId,
        playerName: name,
        homeScore: homeTotal,
        awayScore: awayTotal,
        isStoppage: isStoppageType,
        stoppageType: isStoppageType ? 'ball-up' : undefined,
        commentary: pickCommentary(displayRng, pt, name, currentZone),
        chainId,
      })
    }
  }

  // Ensure final tick reflects exact quarter-end scores (safety net)
  if (ticks.length > 0) {
    const last = ticks[ticks.length - 1]
    const finalHomeTotal = homeScoreAtStart.total + quarterHomeScore.total
    const finalAwayTotal = awayScoreAtStart.total + quarterAwayScore.total
    last.homeScore = finalHomeTotal
    last.awayScore = finalAwayTotal
  }

  return ticks
}
