/**
 * Leadership Change Engine
 *
 * Computes the full cascade of consequences when the user reassigns the
 * captaincy, vice-captaincy, or leadership group.
 *
 * - Immediate morale deltas for all affected players
 * - Disruption level (0-100) that drives the stability meter and sim penalty
 * - Culture stability hit
 * - Generated news items for the inbox
 * - Preview lines for the confirmation dialog
 */

import type { Player } from '@/types/player'
import type { Club, ClubLeadership } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type { NewsItem } from '@/types/game'
import { getLeadershipScore } from '@/engine/leadership/leadershipEngine'

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface LeadershipChangeContext {
  clubId: string
  previousLeadership: ClubLeadership
  newLeadership: ClubLeadership
  players: Record<string, Player>
  club: Club
  currentDate: string
  currentRound: number
  totalRounds: number
  isPreseason: boolean
  isFinals: boolean
  ladder: LadderEntry[]
}

export interface LeadershipChangeConsequences {
  /** Immediate morale delta per player ID */
  moraleDeltas: Record<string, number>
  /** How disruptive this change is (0-100) */
  disruptionLevel: number
  /** Estimated rounds until full recovery */
  roundsToRecover: number
  /** Which role(s) changed */
  changeType: 'captain' | 'vice-captain' | 'both' | 'group-only'
  /** Culture stability hit (negative integer) */
  cultureStabilityDelta: number
  /** Generated news items for the inbox */
  newsItems: NewsItem[]
  /** Human-readable lines for the confirmation dialog preview */
  previewLines: string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ChangeTiming = 'preseason' | 'early' | 'mid' | 'late' | 'finals'

function getChangeTiming(ctx: LeadershipChangeContext): ChangeTiming {
  if (ctx.isPreseason || ctx.currentRound === 0) return 'preseason'
  if (ctx.isFinals) return 'finals'
  const pct = ctx.currentRound / Math.max(1, ctx.totalRounds)
  if (pct < 0.25) return 'early'
  if (pct < 0.75) return 'mid'
  return 'late'
}

function sortedEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function detectChanges(prev: ClubLeadership, next: ClubLeadership) {
  return {
    captainChanged: prev.captainId !== next.captainId,
    vcChanged: prev.viceCaptainId !== next.viceCaptainId,
    groupChanged: !sortedEqual(prev.leadershipGroupIds, next.leadershipGroupIds),
  }
}

function getLadderPosition(ladder: LadderEntry[], clubId: string): number {
  const idx = ladder.findIndex((e) => e.clubId === clubId)
  return idx >= 0 ? idx + 1 : Math.ceil(ladder.length / 2) // default mid-table
}

// ---------------------------------------------------------------------------
// Disruption level (0-100)
// ---------------------------------------------------------------------------

function computeDisruptionLevel(
  ctx: LeadershipChangeContext,
  changes: ReturnType<typeof detectChanges>,
): number {
  let d = 15 // base

  if (changes.captainChanged) d += 30
  if (changes.vcChanged && !changes.captainChanged) d += 15
  if (changes.groupChanged && !changes.captainChanged && !changes.vcChanged) d += 8

  const timing = getChangeTiming(ctx)
  const timingBonus: Record<ChangeTiming, number> = {
    preseason: -15, early: 0, mid: 15, late: 22, finals: 32,
  }
  d += timingBonus[timing]

  // Ladder position context
  const pos = getLadderPosition(ctx.ladder, ctx.clubId)
  const n = ctx.ladder.length || 18
  if (pos <= Math.ceil(n / 4)) d += 8   // top quarter — shock removal
  if (pos >= Math.ceil(n * 3 / 4)) d -= 8 // bottom quarter — more justified

  // Outgoing captain's stature
  if (changes.captainChanged && ctx.previousLeadership.captainId) {
    const old = ctx.players[ctx.previousLeadership.captainId]
    if (old) {
      if (getLeadershipScore(old) >= 75) d += 10
      if (old.careerStats.gamesPlayed >= 150) d += 8
      if (old.personality.professionalism >= 70) d -= 4 // handles it better publicly
    }
  }

  return Math.max(5, Math.min(100, d))
}

// ---------------------------------------------------------------------------
// Individual morale deltas
// ---------------------------------------------------------------------------

function outgoingCaptainDelta(
  player: Player,
  ctx: LeadershipChangeContext,
  timing: ChangeTiming,
  scale = 1.0,
): number {
  let delta = -8 // base hurt

  if (player.personality.professionalism >= 70) delta += 3   // accepts it better
  if (player.personality.professionalism < 40) delta -= 2    // bitter
  if (player.personality.ambition >= 70) delta -= 3          // ambitious = furious
  if (player.personality.loyalty >= 70) delta -= 2           // loyal = feels betrayed

  const timingMod: Record<ChangeTiming, number> = {
    preseason: 3, early: 1, mid: 0, late: -2, finals: -4,
  }
  delta += timingMod[timing]

  const pos = getLadderPosition(ctx.ladder, ctx.clubId)
  const n = ctx.ladder.length || 18
  if (pos >= Math.ceil(n * 3 / 4)) delta += 3  // bottom — change feels justified
  if (pos <= Math.ceil(n / 4)) delta -= 2       // top — feels unjust

  if (player.careerStats.gamesPlayed >= 150) delta -= 2 // long-serving = more hurt

  return Math.max(-18, Math.min(-2, Math.round(delta * scale)))
}

function incomingCaptainDelta(
  player: Player,
  timing: ChangeTiming,
  scale = 1.0,
): number {
  let delta = 8 // base boost

  if (player.personality.ambition >= 70) delta += 3
  if (player.personality.professionalism >= 70) delta += 2
  if (player.careerStats.gamesPlayed < 50) delta -= 2 // inexperienced = pressure

  if (timing === 'finals') delta += 2 // proud moment

  return Math.max(3, Math.min(15, Math.round(delta * scale)))
}

function computeSquadRipple(
  ctx: LeadershipChangeContext,
  _prev: ClubLeadership,
  _next: ClubLeadership,
  exclude: Set<string>,
): Record<string, number> {
  const deltas: Record<string, number> = {}

  const clubPlayers = Object.values(ctx.players).filter(
    (p) => p.clubId === ctx.clubId && !exclude.has(p.id),
  )

  for (const p of clubPlayers) {
    let delta = 0

    // Loyal players upset when established captain is removed
    if (p.personality.loyalty >= 70) delta -= 2
    else if (p.personality.loyalty >= 50) delta -= 1

    // Ambitious players sense opportunity with new leadership
    if (p.personality.ambition >= 70) delta += 1

    // Reactive temperament = more unsettled
    if (p.personality.temperament < 35) delta -= 1

    // Professional players accept change quietly
    if (p.personality.professionalism >= 75) delta += 1

    if (delta !== 0) deltas[p.id] = Math.max(-4, Math.min(2, delta))
  }

  return deltas
}

// ---------------------------------------------------------------------------
// News generation
// ---------------------------------------------------------------------------

function generateNewsItems(
  ctx: LeadershipChangeContext,
  prev: ClubLeadership,
  next: ClubLeadership,
  disruption: number,
  changes: ReturnType<typeof detectChanges>,
  timing: ChangeTiming,
): NewsItem[] {
  const items: NewsItem[] = []
  const { club, currentDate, clubId } = ctx

  const outCap = prev.captainId ? ctx.players[prev.captainId] : null
  const inCap  = next.captainId ? ctx.players[next.captainId] : null
  const outVC  = prev.viceCaptainId ? ctx.players[prev.viceCaptainId] : null
  const inVC   = next.viceCaptainId ? ctx.players[next.viceCaptainId] : null

  const pname = (p: Player) => `${p.firstName} ${p.lastName}`

  // ── Captain change announcement ─────────────────────────────────────────
  if (changes.captainChanged) {
    const playerIds = [outCap?.id, inCap?.id].filter(Boolean) as string[]

    const timingPhrase: Record<ChangeTiming, string> = {
      preseason: 'as part of their pre-season leadership restructure',
      early:     'in a surprise early-season announcement',
      mid:       'in a mid-season reshuffle',
      late:      'as the season enters its final stages',
      finals:    'ahead of their finals campaign',
    }

    const headline = inCap
      ? `${club.name} name ${pname(inCap)} as new captain`
      : `${club.name} strip ${outCap ? pname(outCap) : 'player'} of captaincy`

    const bodyParts = [
      `${club.name} have announced a leadership change ${timingPhrase[timing]}.`,
      inCap
        ? `${pname(inCap)} (${inCap.position.primary}, age ${inCap.age}) takes the armband with ${inCap.careerStats.gamesPlayed} games of experience.`
        : '',
      outCap
        ? `${pname(outCap)} steps aside after ${outCap.careerStats.gamesPlayed} career games.`
        : '',
      disruption >= 65
        ? 'The change has sent shockwaves through the playing group and is expected to take several rounds to settle.'
        : disruption >= 35
          ? 'Some short-term adjustment is expected as the group finds its new footing.'
          : 'Sources within the club expect a smooth transition.',
    ].filter(Boolean)

    items.push({
      id: crypto.randomUUID(),
      date: currentDate,
      headline,
      body: bodyParts.join(' '),
      category: 'general',
      clubIds: [clubId],
      playerIds,
    })
  }

  // ── Vice-captaincy change (solo) ─────────────────────────────────────────
  if (changes.vcChanged && !changes.captainChanged) {
    const playerIds = [outVC?.id, inVC?.id].filter(Boolean) as string[]
    items.push({
      id: crypto.randomUUID(),
      date: currentDate,
      headline: inVC
        ? `${club.name} appoint ${pname(inVC)} as vice-captain`
        : `${club.name} make vice-captaincy changes`,
      body: [
        inVC ? `${pname(inVC)} has been named vice-captain of ${club.name}.` : '',
        outVC ? `${pname(outVC)} steps down from the role.` : '',
      ].filter(Boolean).join(' '),
      category: 'general',
      clubIds: [clubId],
      playerIds,
    })
  }

  // ── Reaction piece for highly disruptive changes ─────────────────────────
  if (disruption >= 55 && changes.captainChanged && outCap) {
    const reaction = outCap.personality.professionalism >= 65
      ? `${pname(outCap)} accepted the decision professionally, saying the club's interests come first.`
      : `${pname(outCap)} is understood to be deeply disappointed and is reassessing his future at the club.`

    items.push({
      id: crypto.randomUUID(),
      date: currentDate,
      headline: `Inside ${club.name}: the fallout from the captaincy shake-up`,
      body: `${reaction} The new leadership group faces an early cohesion test. On-field composure in pressure moments may take time to re-establish, with the adjustment period expected to last several rounds.`,
      category: 'general',
      clubIds: [clubId],
      playerIds: [outCap.id, ...(inCap ? [inCap.id] : [])],
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeLeadershipChangeConsequences(
  ctx: LeadershipChangeContext,
): LeadershipChangeConsequences {
  const { previousLeadership: prev, newLeadership: next, players } = ctx
  const timing = getChangeTiming(ctx)
  const changes = detectChanges(prev, next)

  const disruptionLevel = computeDisruptionLevel(ctx, changes)
  const roundsToRecover = ctx.isPreseason
    ? 0 // no match-day disruption during preseason
    : Math.max(2, Math.min(10, Math.round(4 + disruptionLevel / 20)))

  const moraleDeltas: Record<string, number> = {}
  const processed = new Set<string>()

  // Outgoing captain
  if (changes.captainChanged && prev.captainId) {
    const p = players[prev.captainId]
    if (p?.clubId === ctx.clubId) {
      moraleDeltas[p.id] = outgoingCaptainDelta(p, ctx, timing)
      processed.add(p.id)
    }
  }

  // Incoming captain (not previously captain)
  if (changes.captainChanged && next.captainId && next.captainId !== prev.captainId) {
    const p = players[next.captainId]
    if (p?.clubId === ctx.clubId) {
      moraleDeltas[p.id] = incomingCaptainDelta(p, timing)
      processed.add(p.id)
    }
  }

  // Outgoing VC (scale 0.6 of captain deltas)
  if (changes.vcChanged && prev.viceCaptainId && !processed.has(prev.viceCaptainId)) {
    const p = players[prev.viceCaptainId]
    if (p?.clubId === ctx.clubId) {
      moraleDeltas[p.id] = outgoingCaptainDelta(p, ctx, timing, 0.6)
      processed.add(p.id)
    }
  }

  // Incoming VC (scale 0.6)
  if (changes.vcChanged && next.viceCaptainId && !processed.has(next.viceCaptainId) && next.viceCaptainId !== prev.viceCaptainId) {
    const p = players[next.viceCaptainId]
    if (p?.clubId === ctx.clubId) {
      moraleDeltas[p.id] = incomingCaptainDelta(p, timing, 0.6)
      processed.add(p.id)
    }
  }

  // Squad-wide ripple from captain change
  if (changes.captainChanged) {
    const ripple = computeSquadRipple(ctx, prev, next, processed)
    for (const [id, delta] of Object.entries(ripple)) {
      moraleDeltas[id] = delta
    }
  }

  // Culture stability hit
  const cultureStabilityDelta = ctx.isPreseason
    ? Math.round(-disruptionLevel * 0.12)
    : Math.round(-disruptionLevel * 0.28)

  // Change type label
  let changeType: LeadershipChangeConsequences['changeType']
  if (changes.captainChanged && changes.vcChanged) changeType = 'both'
  else if (changes.captainChanged) changeType = 'captain'
  else if (changes.vcChanged) changeType = 'vice-captain'
  else changeType = 'group-only'

  // Preview lines for the confirmation dialog
  const previewLines: string[] = []

  const outCap = prev.captainId ? players[prev.captainId] : null
  const inCap  = next.captainId ? players[next.captainId] : null

  if (outCap && moraleDeltas[outCap.id] !== undefined) {
    previewLines.push(`${outCap.firstName} ${outCap.lastName}: ${moraleDeltas[outCap.id]} morale`)
  }
  if (inCap && moraleDeltas[inCap.id] !== undefined) {
    previewLines.push(`${inCap.firstName} ${inCap.lastName}: +${moraleDeltas[inCap.id]} morale`)
  }

  const rippleCount = Object.keys(moraleDeltas).length - processed.size
  if (rippleCount > 0) {
    previewLines.push(`${rippleCount} squad member${rippleCount !== 1 ? 's' : ''} affected by ripple effects`)
  }

  if (roundsToRecover > 0) {
    previewLines.push(`${roundsToRecover}-round adjustment period — on-field cohesion penalty applies`)
  }
  if (cultureStabilityDelta < -5) {
    previewLines.push(`Club stability: ${cultureStabilityDelta} points`)
  }

  const newsItems = generateNewsItems(ctx, prev, next, disruptionLevel, changes, timing)

  return {
    moraleDeltas,
    disruptionLevel,
    roundsToRecover,
    changeType,
    cultureStabilityDelta,
    newsItems,
    previewLines,
  }
}

// ---------------------------------------------------------------------------
// Stability derived values (used by dashboard widget and match sim)
// ---------------------------------------------------------------------------

/** Returns 0–100 where 100 = fully stable, 0 = maximum disruption. */
export function computeLeadershipStabilityPct(
  disruptionLevel: number,
  roundsRemaining: number,
  roundsToRecover: number,
): number {
  if (roundsToRecover === 0 || roundsRemaining <= 0) return 100
  const disruptionFraction = (disruptionLevel / 100) * (roundsRemaining / roundsToRecover)
  return Math.round(Math.max(0, Math.min(100, 100 - disruptionFraction * 100)))
}

/**
 * Match simulation multiplier for a club's effective team rating during a
 * disruption period.  Returns 0.95–1.00 (max 5% rating reduction).
 */
export function getLeadershipDisruptionMult(
  disruptionLevel: number,
  roundsRemaining: number,
  roundsToRecover: number,
): number {
  if (roundsToRecover === 0 || roundsRemaining <= 0) return 1.0
  const fraction = (disruptionLevel / 100) * (roundsRemaining / roundsToRecover)
  return Math.max(0.95, 1 - fraction * 0.05)
}
