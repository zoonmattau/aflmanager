import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Arc types
// ---------------------------------------------------------------------------

export type StoryArcType =
  | 'prospect'         // Young player, high pick, still developing
  | 'breakout'         // Sudden form spike over recent games
  | 'veteran-leader'   // 30+, leadership group, experience counts
  | 'injury-comeback'  // Recently returned from a serious injury
  | 'delisted-to-star' // Low/no pick, rookie-listed, but outperforming
  | 'iron-man'         // Relentlessly consistent, rarely misses games
  | 'slump'            // Significant form decline
  | 'contract-year'    // Final year of deal, playing for future
  | 'rising-star'      // Under 24, clear upward trajectory
  | 'redemption'       // Back on form after a rough stretch

export interface PlayerStoryArc {
  playerId: string
  playerName: string
  arc: StoryArcType
  blurb: string
  /** Higher = more newsworthy; used to rank storylines. */
  priority: number
}

export interface ArcContext {
  /** True if captain, vice-captain, or named in leadership group. */
  isLeader: boolean
  /** Current game date as ISO string (YYYY-MM-DD). */
  currentDate: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Deterministic template picker: same player always gets the same blurb. */
function pick(playerId: string, templates: string[]): string {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) & 0x7fffffff
  }
  return templates[hash % templates.length]
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.round(
    (new Date(isoB).getTime() - new Date(isoA).getTime()) / 86_400_000,
  )
}

function recentRatings(player: Player, n = 4): number[] {
  return (player.matchRatingHistory ?? []).slice(-n)
}

function avgOf(ratings: number[]): number {
  if (ratings.length === 0) return 6
  return ratings.reduce((s, r) => s + r, 0) / ratings.length
}

function careerAvg(player: Player): number {
  return avgOf(player.matchRatingHistory ?? [])
}

// ---------------------------------------------------------------------------
// Arc scorers — return 0 if arc doesn't apply, 1–100 if it does.
// ---------------------------------------------------------------------------

interface ArcCandidate {
  arc: StoryArcType
  score: number
  blurb: string
  priority: number
}

function scoreProspect(p: Player): ArcCandidate | null {
  const isYoung = p.age <= 22
  const isHighPick = typeof p.draftPick === 'number' && p.draftPick <= 12
  const fewGames = p.careerStats.gamesPlayed < 25
  if (!isYoung || !fewGames) return null

  const pickBonus = isHighPick ? 30 : 10
  const score = 40 + pickBonus + Math.max(0, 22 - p.age) * 3

  const pickDesc = typeof p.draftPick === 'number'
    ? `pick ${p.draftPick} billing`
    : 'raw upside'

  const blurb = pick(p.id, [
    `Still finding his footing at AFL level, ${p.firstName} carries the weight of ${pickDesc} on young shoulders.`,
    `Only ${p.careerStats.gamesPlayed} games in — ${p.firstName} ${p.lastName}'s ceiling has barely been explored.`,
    `At ${p.age}, ${p.lastName} represents the kind of long-term investment clubs covet. Patience will be rewarded.`,
    `The ${pickDesc} is yet to fully pay off, but glimpses from ${p.firstName} suggest something special is developing.`,
  ])

  return { arc: 'prospect', score, blurb, priority: 70 }
}

function scoreBreakout(p: Player): ArcCandidate | null {
  const history = p.matchRatingHistory ?? []
  if (history.length < 5) return null

  const recent = recentRatings(p, 3)
  const prior = history.slice(0, -3)
  const recentAvg = avgOf(recent)
  const priorAvg = avgOf(prior)
  const careerA = careerAvg(p)

  const spike = recentAvg - priorAvg
  const aboveCareer = recentAvg - careerA
  if (spike < 1.0 || recentAvg < 7.0 || aboveCareer < 0.8) return null

  const score = Math.min(100, 50 + spike * 15 + aboveCareer * 10)
  const avgStr = recentAvg.toFixed(1)

  const blurb = pick(p.id, [
    `${p.firstName} ${p.lastName} has erupted — averaging ${avgStr} across the last three games after a quiet patch.`,
    `Something has clicked for ${p.firstName}. A ${avgStr}-average burst over three outings has scouts talking.`,
    `${p.lastName} looks like a different player lately — ${avgStr} avg rating screams breakout, not blip.`,
    `The numbers back up the eye test: ${p.firstName} is on the kind of form run that changes a career.`,
  ])

  return { arc: 'breakout', score, blurb, priority: 85 }
}

function scoreVeteranLeader(p: Player, ctx: ArcContext): ArcCandidate | null {
  if (p.age < 30) return null

  const score = 40 + (p.age - 30) * 5 + (ctx.isLeader ? 25 : 0)
  const gamesStr = p.careerStats.gamesPlayed.toLocaleString()

  const blurb = pick(p.id, [
    `${p.careerStats.gamesPlayed} games. ${p.age} years young. ${p.firstName} ${p.lastName} is still the heartbeat of the side.`,
    `At ${p.age}, ${p.lastName}'s game IQ is at an all-time high — experience money can't buy for this team.`,
    `The dressing room listens when ${p.firstName} speaks. ${gamesStr} games has earned him that authority.`,
    `Not every veteran fades gracefully. ${p.lastName} is making the argument that age is just a number.`,
  ])

  return { arc: 'veteran-leader', score, blurb, priority: 60 }
}

function scoreInjuryComeback(p: Player, ctx: ArcContext): ArcCandidate | null {
  const history = p.injuryHistory ?? []
  const serious = history.filter(
    (h) => h.severity === 'major' || h.severity === 'severe',
  )
  if (serious.length === 0) return null

  const mostRecent = serious.reduce((a, b) =>
    (a.recoveredOn ?? '') > (b.recoveredOn ?? '') ? a : b,
  )
  if (!mostRecent.recoveredOn) return null

  const daysAgo = daysBetween(mostRecent.recoveredOn, ctx.currentDate)
  // Only relevant if returned within last 10 weeks
  if (daysAgo > 70 || daysAgo < 0) return null

  const score = Math.min(100, 70 + (70 - daysAgo) * 0.5)
  const weeksAgo = Math.round(daysAgo / 7)
  const injuryDesc = mostRecent.type.toLowerCase()

  const blurb = pick(p.id, [
    `Back from a ${injuryDesc} just ${weeksAgo} week${weeksAgo === 1 ? '' : 's'} ago — ${p.firstName} ${p.lastName} is hungry to make up for lost time.`,
    `${p.lastName}'s return from ${injuryDesc} is the feel-good story of the season. Months of rehabilitation condensed into determination.`,
    `After ${mostRecent.gamesMissed} games on the sideline with ${injuryDesc}, ${p.firstName} is proving his body — and desire — remain first-class.`,
    `The ${injuryDesc} threatened his season. ${p.firstName} ${p.lastName} had other ideas.`,
  ])

  return { arc: 'injury-comeback', score, blurb, priority: 90 }
}

function scoreDelistedToStar(p: Player): ArcCandidate | null {
  const isLowPick = p.draftPick === null || (typeof p.draftPick === 'number' && p.draftPick > 55)
  const isRookie = p.isRookie
  const overallRating = p.form // Using form as performance proxy (1-100)
  if (!isLowPick && !isRookie) return null
  if (overallRating < 65 || p.careerStats.gamesPlayed < 15) return null

  const score = 55 + Math.max(0, overallRating - 65) * 0.8 + (isRookie ? 15 : 0)

  const pickContext = p.draftPick === null
    ? 'undrafted'
    : isRookie
      ? 'rookie-listed'
      : `a pick ${p.draftPick} selection`

  const blurb = pick(p.id, [
    `Once ${pickContext}, ${p.firstName} ${p.lastName} is the archetypal proof that draft position means nothing after year one.`,
    `${p.lastName} used to be ${pickContext}. Now? One of the most important names on the team sheet.`,
    `Written off as ${pickContext}, ${p.firstName} has rewritten his own story — and it makes for compelling reading.`,
    `Clubs passed on ${p.firstName} in the draft. They're all paying for it now — ${p.lastName} is the real deal.`,
  ])

  return { arc: 'delisted-to-star', score, blurb, priority: 80 }
}

function scoreIronMan(p: Player): ArcCandidate | null {
  if (p.age < 26 || p.careerStats.gamesPlayed < 80) return null

  const seriousInjuries = (p.injuryHistory ?? []).filter(
    (h) => h.severity === 'major' || h.severity === 'severe',
  )
  if (seriousInjuries.length > 0) return null

  const score = 40 + Math.min(40, p.careerStats.gamesPlayed * 0.3)

  const blurb = pick(p.id, [
    `${p.careerStats.gamesPlayed} games and zero serious injuries. ${p.firstName} ${p.lastName} is a physical marvel.`,
    `Availability is an underrated skill. ${p.lastName} turns up every week, without fail — ${p.careerStats.gamesPlayed} times and counting.`,
    `${p.firstName} ${p.lastName} has built his career on the one thing you can't teach: durability.`,
    `Week in, week out. ${p.lastName} makes himself available when others can't. ${p.careerStats.gamesPlayed} games of evidence.`,
  ])

  return { arc: 'iron-man', score, blurb, priority: 45 }
}

function scoreSlump(p: Player): ArcCandidate | null {
  const history = p.matchRatingHistory ?? []
  if (history.length < 5) return null

  const recent = recentRatings(p, 4)
  const recentAvg = avgOf(recent)
  const careerA = careerAvg(p)

  if (recentAvg > 5.5 || careerA < 5.8) return null
  const drop = careerA - recentAvg
  if (drop < 0.8) return null

  const score = Math.min(100, 45 + drop * 20)

  const blurb = pick(p.id, [
    `${p.firstName} ${p.lastName} is searching for form — a ${recentAvg.toFixed(1)} avg over four games raises genuine questions.`,
    `The confidence isn't there for ${p.lastName} right now. Four below-par performances in a row demand answers.`,
    `Even the staunchest ${p.lastName} supporters would admit he hasn't hit his straps lately. The next fortnight is critical.`,
    `A slump is temporary. ${p.firstName} has the pedigree to snap out of it — but the clock is ticking.`,
  ])

  return { arc: 'slump', score, blurb, priority: 65 }
}

function scoreContractYear(p: Player): ArcCandidate | null {
  if (p.contract.yearsRemaining !== 1) return null
  if (p.seasonStats.gamesPlayed < 4) return null
  if (p.form < 55) return null

  const score = 55 + Math.min(30, p.form * 0.3) + (p.careerStats.gamesPlayed > 80 ? 10 : 0)

  const blurb = pick(p.id, [
    `Out of contract this off-season, ${p.firstName} ${p.lastName} is playing with an urgency that speaks louder than words.`,
    `${p.lastName} has one eye on his future. The contract-year intensity is real — and it's lifting his game.`,
    `Rival clubs are watching ${p.firstName}'s every move. Nothing focuses the mind like an expiring deal.`,
    `${p.firstName} ${p.lastName} knows this season is his audition. So far, the performance review is glowing.`,
  ])

  return { arc: 'contract-year', score, blurb, priority: 75 }
}

function scoreRisingStar(p: Player): ArcCandidate | null {
  if (p.age > 23 || p.careerStats.gamesPlayed < 10) return null

  const history = p.matchRatingHistory ?? []
  if (history.length < 8) return null

  const firstHalf = history.slice(0, Math.floor(history.length / 2))
  const secondHalf = history.slice(Math.floor(history.length / 2))
  const improvement = avgOf(secondHalf) - avgOf(firstHalf)

  if (improvement < 0.6) return null

  const score = 50 + improvement * 20 + Math.max(0, 23 - p.age) * 4

  const blurb = pick(p.id, [
    `${p.firstName} ${p.lastName} is on a trajectory that has talent scouts circling. The stats prove this is no fluke.`,
    `Week by week, ${p.firstName}'s impact grows. At ${p.age}, the ceiling remains deliciously undefined.`,
    `${p.lastName}'s development curve is steep and pointing upward. This is the kind of arc careers are built on.`,
    `Still just ${p.age} years old, ${p.firstName} ${p.lastName} is ahead of the development schedule coaches planned.`,
  ])

  return { arc: 'rising-star', score, blurb, priority: 72 }
}

function scoreRedemption(p: Player): ArcCandidate | null {
  const history = p.matchRatingHistory ?? []
  // Need enough history to compare a rough patch with a recent recovery
  if (history.length < 8) return null

  const roughPatch = history.slice(-7, -3)  // games 4-7 ago
  const recentForm = history.slice(-3)       // last 3 games

  const roughAvg = avgOf(roughPatch)
  const recentAvg = avgOf(recentForm)
  const recovery = recentAvg - roughAvg

  if (roughAvg > 5.8 || recentAvg < 6.4 || recovery < 1.0) return null

  const score = Math.min(100, 50 + recovery * 18)

  const blurb = pick(p.id, [
    `${p.firstName} ${p.lastName} hit rock bottom not long ago. Right now? He's the form player of the competition.`,
    `The critics were loud when ${p.lastName} struggled. They're quieter now — and ${p.firstName} is making them eat their words.`,
    `Three games of redemption. ${p.firstName} ${p.lastName} looks like the player everyone always believed he could be.`,
    `After a rough stretch that tested his resolve, ${p.lastName} is back doing what made him so valuable in the first place.`,
  ])

  return { arc: 'redemption', score, blurb, priority: 82 }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the strongest story arc for a single player.
 * Returns null if no arc applies (e.g. player has no match history or is injured).
 */
export function computePlayerArc(
  player: Player,
  ctx: ArcContext,
): PlayerStoryArc | null {
  // Don't assign arcs to currently injured players (except injury-comeback)
  const candidates: (ArcCandidate | null)[] = [
    scoreInjuryComeback(player, ctx),
    scoreBreakout(player),
    scoreRedemption(player),
    scoreContractYear(player),
    scoreRisingStar(player),
    scoreDelistedToStar(player),
    scoreProspect(player),
    scoreVeteranLeader(player, ctx),
    scoreSlump(player),
    scoreIronMan(player),
  ]

  const valid = candidates.filter((c): c is ArcCandidate => c !== null)
  if (valid.length === 0) return null

  // Pick the highest-scoring arc
  const winner = valid.reduce((best, c) =>
    c.score > best.score ? c : best,
  )

  return {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    arc: winner.arc,
    blurb: winner.blurb,
    priority: winner.priority,
  }
}

/**
 * Build story arcs for an entire squad, sorted by priority descending.
 * Only includes players with a meaningful arc (filters out nulls).
 */
export function buildSquadStorylines(
  players: Player[],
  leadershipIds: Set<string>,
  currentDate: string,
  limit = 10,
): PlayerStoryArc[] {
  return players
    .map((p) =>
      computePlayerArc(p, {
        isLeader: leadershipIds.has(p.id),
        currentDate,
      }),
    )
    .filter((arc): arc is PlayerStoryArc => arc !== null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Arc metadata (labels, colours)
// ---------------------------------------------------------------------------

export const ARC_META: Record<
  StoryArcType,
  { label: string; shortLabel: string; colour: string; icon: string }
> = {
  prospect:         { label: 'Hot Prospect',      shortLabel: 'Prospect',     colour: 'text-blue-500',    icon: '⭐' },
  breakout:         { label: 'Breakout Form',      shortLabel: 'Breakout',     colour: 'text-amber-400',   icon: '🔥' },
  'veteran-leader': { label: 'Veteran Leader',     shortLabel: 'Veteran',      colour: 'text-emerald-400', icon: '🦁' },
  'injury-comeback':{ label: 'Injury Comeback',    shortLabel: 'Comeback',     colour: 'text-rose-400',    icon: '💪' },
  'delisted-to-star':{ label: 'Delisted to Star',  shortLabel: 'Rags to Star', colour: 'text-violet-400',  icon: '🚀' },
  'iron-man':       { label: 'Iron Man',           shortLabel: 'Iron Man',     colour: 'text-cyan-400',    icon: '🛡️' },
  slump:            { label: 'Form Slump',         shortLabel: 'Slump',        colour: 'text-red-400',     icon: '📉' },
  'contract-year':  { label: 'Contract Year',      shortLabel: 'Contract Yr',  colour: 'text-orange-400',  icon: '📝' },
  'rising-star':    { label: 'Rising Star',        shortLabel: 'Rising',       colour: 'text-sky-400',     icon: '📈' },
  redemption:       { label: 'Redemption Arc',     shortLabel: 'Redemption',   colour: 'text-indigo-400',  icon: '♻️' },
}
