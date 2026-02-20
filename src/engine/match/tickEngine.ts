import type { MatchKeyEvent } from '@/types/match'
import type { FieldZone, PossessionType, MatchTick } from '@/types/matchTick'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Commentary templates
// ---------------------------------------------------------------------------

const COMMENTARY: Record<PossessionType, string[]> = {
  kick: [
    '{name} drives it forward by foot.',
    'Kick from {name} finds space in the midfield.',
    '{name} pumps it long into the forward line.',
    'Nice kick by {name} — switches the play.',
    '{name} delivers it on the boot.',
  ],
  handball: [
    '{name} threads a handball through traffic.',
    'Quick handball from {name} keeps the chain going.',
    '{name} finds a teammate with a deft handpass.',
    'Short pass from {name} — the ball moves quickly.',
  ],
  mark: [
    '{name} takes a strong overhead mark.',
    '{name} marks it cleanly under pressure.',
    'Strong hands from {name} — a fine mark.',
    '{name} takes the grab and plays on.',
  ],
  tackle: [
    'Tackle applied! {name} wins the free kick.',
    '{name} smothers the kick — great defensive work.',
    '{name} clamps on and forces the turnover.',
    'Solid tackle from {name}.',
  ],
  clearance: [
    '{name} wins the clearance from the stoppage.',
    'Ball breaks free — {name} gathers and fires it out.',
    '{name} crumbs it from the pack.',
    'Strong clearance by {name}.',
  ],
  contest: [
    'Contested ball — {name} comes up with it.',
    'Disputed possession — {name} holds on.',
    '{name} wins the hitout to advantage.',
    'Hard at the ball — {name} emerges.',
  ],
  'free-for': [
    'Free kick to {name} — high contact.',
    'Umpire rewards {name} with a free kick.',
    '{name} wins the free — holding the ball called.',
  ],
  goal: [
    'GOAL! {name} slots it through from {zone}!',
    "It's a major! {name} converts brilliantly!",
    'GOAL — {name} makes no mistake!',
    'SIX POINTS! {name} nails it from {zone}!',
  ],
  behind: [
    'Behind. {name} just missed to the right.',
    'Point — unlucky from {name}.',
    '{name} registers a behind — just wide.',
    'One point. {name} could not convert.',
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
}

function fillTemplate(template: string, name: string, zone: FieldZone): string {
  return template
    .replace('{name}', name)
    .replace('{zone}', zone.replace(/([A-Z])/g, ' $1').toLowerCase().trim())
}

function pickCommentary(rng: SeededRNG, type: PossessionType, name: string, zone: FieldZone): string {
  const templates = COMMENTARY[type]
  const template = templates[rng.nextInt(0, templates.length - 1)]
  return fillTemplate(template, name, zone)
}

// ---------------------------------------------------------------------------
// Zone helpers
// ---------------------------------------------------------------------------

const ZONES: FieldZone[] = ['back50', 'backHalf', 'midfield', 'forwardHalf', 'forward50']

function zoneFromMinute(rng: SeededRNG): FieldZone {
  // Weighted: midfield most common
  const w = [8, 18, 34, 20, 20]
  const total = w.reduce((a, b) => a + b, 0)
  let r = rng.nextInt(0, total - 1)
  for (let i = 0; i < ZONES.length; i++) {
    r -= w[i]
    if (r < 0) return ZONES[i]
  }
  return 'midfield'
}

function goalZone(rng: SeededRNG): FieldZone {
  return rng.chance(0.7) ? 'forward50' : 'forwardHalf'
}

// ---------------------------------------------------------------------------
// Possession type picker
// ---------------------------------------------------------------------------

const POSSESSION_WEIGHTS: Array<[PossessionType, number]> = [
  ['kick', 30],
  ['handball', 25],
  ['mark', 15],
  ['tackle', 12],
  ['clearance', 8],
  ['contest', 7],
  ['free-for', 3],
]
const POSSESSION_TOTAL = POSSESSION_WEIGHTS.reduce((a, [, w]) => a + w, 0)

function pickPossessionType(rng: SeededRNG): PossessionType {
  let r = rng.nextInt(0, POSSESSION_TOTAL - 1)
  for (const [type, w] of POSSESSION_WEIGHTS) {
    r -= w
    if (r < 0) return type
  }
  return 'kick'
}

// ---------------------------------------------------------------------------
// Player name helpers
// ---------------------------------------------------------------------------

function anonymousName(clubAbbr: string): string {
  return clubAbbr
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
  homeScoreAtStart: { goals: number; behinds: number; total: number }
  awayScoreAtStart: { goals: number; behinds: number; total: number }
  quarterHomeScore: { goals: number; behinds: number; total: number }
  quarterAwayScore: { goals: number; behinds: number; total: number }
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
    homeScoreAtStart,
    awayScoreAtStart,
    quarterHomeScore,
    quarterAwayScore,
  } = ctx

  const quarter = quarterIndex + 1

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

  // Slot extra scoring events
  const extraSlotMap = new Map<number, ExtraScore>()
  for (let i = 0; i < shuffledExtras.length && i < shuffledFreeSlots.length; i++) {
    extraSlotMap.set(shuffledFreeSlots[i], shuffledExtras[i])
  }

  // --- Build tick array ---
  const ticks: MatchTick[] = []

  for (let i = 0; i < TOTAL_POSSESSIONS; i++) {
    const minute = Math.round((i / (TOTAL_POSSESSIONS - 1)) * 30)

    const keyEvt = slotMap.get(i)
    const extraScore = extraSlotMap.get(i)

    if (keyEvt) {
      // --- Key event tick ---
      const name = keyEvt.playerId ? (playerNames[keyEvt.playerId] ?? anonymousName(keyEvt.clubId === homeClubId ? homeAbbr : awayAbbr)) : anonymousName(keyEvt.clubId === homeClubId ? homeAbbr : awayAbbr)

      if (keyEvt.type === 'goal') {
        homeGoals += keyEvt.clubId === homeClubId ? 1 : 0
        awayGoals += keyEvt.clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        const zone = goalZone(displayRng)
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
        })
      } else if (keyEvt.type === 'behind') {
        homeBehinds += keyEvt.clubId === homeClubId ? 1 : 0
        awayBehinds += keyEvt.clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        const zone = goalZone(displayRng)
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
        })
      } else if (keyEvt.type === 'injury') {
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
        })
      } else {
        // milestone, tactical-change etc — treat as normal possession tick
        const pt = pickPossessionType(displayRng)
        const zone = zoneFromMinute(displayRng)
        ticks.push({
          tickIndex: i,
          quarter,
          minute,
          zone,
          possessionType: pt,
          clubId: keyEvt.clubId,
          playerName: name,
          homeScore: homeTotal,
          awayScore: awayTotal,
          isStoppage: false,
          commentary: keyEvt.description || pickCommentary(displayRng, pt, name, zone),
        })
      }
    } else if (extraScore) {
      // --- Extra scoring tick (not in key events, synthetic) ---
      const clubId = extraScore.clubId
      const abbr = clubId === homeClubId ? homeAbbr : awayAbbr
      const name = anonymousName(abbr)

      if (extraScore.isGoal) {
        homeGoals += clubId === homeClubId ? 1 : 0
        awayGoals += clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        const zone = goalZone(displayRng)
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
        })
      } else {
        homeBehinds += clubId === homeClubId ? 1 : 0
        awayBehinds += clubId === awayClubId ? 1 : 0
        homeTotal = homeGoals * 6 + homeBehinds
        awayTotal = awayGoals * 6 + awayBehinds
        const zone = goalZone(displayRng)
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
        })
      }
    } else {
      // --- Synthetic possession tick ---
      // Loosely alternate home/away
      const clubId = displayRng.chance(0.5) ? homeClubId : awayClubId
      const abbr = clubId === homeClubId ? homeAbbr : awayAbbr
      const pt = pickPossessionType(displayRng)
      const zone = zoneFromMinute(displayRng)
      ticks.push({
        tickIndex: i,
        quarter,
        minute,
        zone,
        possessionType: pt,
        clubId,
        playerName: anonymousName(abbr),
        homeScore: homeTotal,
        awayScore: awayTotal,
        isStoppage: false,
        commentary: pickCommentary(displayRng, pt, anonymousName(abbr), zone),
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
