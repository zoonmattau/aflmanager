/**
 * Training Impact Engine
 *
 * Analyses which training focuses the user ran in the week before a match,
 * checks whether the corresponding on-field metrics came in above benchmark,
 * and returns a summary of findings.  Also generates sparse play-by-play
 * callout events to inject into the commentary feed.
 */

import type { MatchPlayerStats, PlayByPlayEvent, TrainingImpactFinding, TrainingImpactSummary } from '@/types/match'
import type { TrainingFocus } from '@/engine/training/trainingEngine'
import type { QuarterScore } from '@/types/match'

// ── Benchmarks (per-team totals, 22-player lineup) ────────────────────────────
const BENCH: Record<string, number> = {
  clearances: 38,
  contestedPossessions: 115,
  intercepts: 15,
  hitouts: 35,
  insideFifties: 40,
  turnovers: 58,
  clangers: 48,
  contestedMarks: 7,
  rebound50s: 14,
}

function sum(stats: MatchPlayerStats[], key: keyof MatchPlayerStats): number {
  return stats.reduce((acc, s) => acc + (Number(s[key]) || 0), 0)
}

function fmtNum(n: number): string {
  return n.toFixed(0)
}

function pct(a: number, b: number): string {
  if (b === 0) return '0%'
  return `${Math.round((a / b) * 100)}%`
}

/**
 * Derive the set of unique training focuses from a week plan's slot entries.
 * Exported so callers (gameStore) can extract focuses without importing the full plan.
 */
export function extractFocusesFromSlots(
  slots: Record<string, { morning: { groups: Array<{ focus: TrainingFocus }> }; afternoon: { groups: Array<{ focus: TrainingFocus }> } }>,
): TrainingFocus[] {
  const set = new Set<TrainingFocus>()
  for (const slot of Object.values(slots)) {
    for (const g of slot.morning.groups) if (g.focus !== 'rest') set.add(g.focus)
    for (const g of slot.afternoon.groups) if (g.focus !== 'rest') set.add(g.focus)
  }
  return [...set]
}

// ── Per-focus analysis handlers ───────────────────────────────────────────────

function analyzeContested(
  stats: MatchPlayerStats[],
): TrainingImpactFinding | null {
  const clearances = sum(stats, 'clearances')
  const contested = sum(stats, 'contestedPossessions')
  const delta = clearances - BENCH.clearances
  if (delta < 3) return null
  return {
    focus: 'contested',
    metric: 'Clearances',
    value: clearances,
    benchmark: BENCH.clearances,
    delta,
    description: `Contested training paid off — ${fmtNum(clearances)} clearances (${fmtNum(delta)} above average) and ${fmtNum(contested)} contested possessions.`,
    callout: `Contested work translated — ${fmtNum(clearances)} clearances.`,
  }
}

function analyzePhysical(
  _stats: MatchPlayerStats[],
  userScores: QuarterScore[],
): TrainingImpactFinding | null {
  if (userScores.length < 4) return null
  const q1 = userScores[0].total
  const q4 = userScores[3].total
  const avgEarly = (userScores[0].total + userScores[1].total) / 2
  // Good endurance = Q4 within 80% of early-game average and total >= 50
  if (q4 < avgEarly * 0.72 || q1 + q4 < 50) return null
  const delta = q4 - q1
  return {
    focus: 'physical',
    metric: 'Q4 Output',
    value: q4,
    benchmark: Math.round(avgEarly * 0.8),
    delta,
    description: `Physical training held up — ${fmtNum(q4)} pts in Q4 vs ${fmtNum(avgEarly)} average Q1-Q2, sustaining pressure to the final siren.`,
    callout: `Fitness training showing — strong Q4 from the squad.`,
  }
}

function analyzeMatchFitness(
  stats: MatchPlayerStats[],
  userScores: QuarterScore[],
): TrainingImpactFinding | null {
  // Similar to physical but specifically for match-fitness focus
  return analyzePhysical(stats, userScores)
}

function analyzeKicking(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const kicks = sum(stats, 'kicks')
  const disposals = sum(stats, 'disposals')
  if (disposals < 100) return null
  const kickRate = kicks / disposals
  if (kickRate < 0.60) return null
  const delta = Math.round((kickRate - 0.55) * disposals)
  return {
    focus: 'kicking',
    metric: 'Kick Rate',
    value: Math.round(kickRate * 100),
    benchmark: 55,
    delta,
    description: `Kicking focus paid off — ${fmtNum(kicks)} kicks (${pct(kicks, disposals)} of disposals), favouring controlled foot use.`,
    callout: `Kicking drills translating — ${pct(kicks, disposals)} of disposals by foot.`,
  }
}

function analyzeDefensive(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const intercepts = sum(stats, 'intercepts')
  const rebound50s = sum(stats, 'rebound50s')
  const delta = intercepts - BENCH.intercepts
  if (delta < 3) return null
  return {
    focus: 'defensive',
    metric: 'Intercepts',
    value: intercepts,
    benchmark: BENCH.intercepts,
    delta,
    description: `Defensive training delivered — ${fmtNum(intercepts)} intercepts and ${fmtNum(rebound50s)} rebound-50s, stifling opposition entries.`,
    callout: `Defensive drills showing — ${fmtNum(intercepts)} intercepts.`,
  }
}

function analyzeRuck(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const hitouts = sum(stats, 'hitouts')
  const delta = hitouts - BENCH.hitouts
  if (delta < 5) return null
  return {
    focus: 'ruck',
    metric: 'Hitouts',
    value: hitouts,
    benchmark: BENCH.hitouts,
    delta,
    description: `Ruck training delivered — ${fmtNum(hitouts)} hitouts (${fmtNum(delta)} above benchmark), creating first-use dominance.`,
    callout: `Ruck work paying dividends — ${fmtNum(hitouts)} hitouts.`,
  }
}

function analyzeOffensive(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const inside50s = sum(stats, 'insideFifties')
  const goals = sum(stats, 'goals')
  const delta = inside50s - BENCH.insideFifties
  if (delta < 4 && goals < 13) return null
  return {
    focus: 'offensive',
    metric: 'Inside 50s',
    value: inside50s,
    benchmark: BENCH.insideFifties,
    delta,
    description: `Offensive training paying off — ${fmtNum(inside50s)} inside 50s and ${fmtNum(goals)} goals, generating sustained forward pressure.`,
    callout: `Forward patterns working — ${fmtNum(inside50s)} inside 50s.`,
  }
}

function analyzeGameSense(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const turnovers = sum(stats, 'turnovers')
  const clangers = sum(stats, 'clangers')
  const delta = BENCH.turnovers - turnovers  // positive = fewer turnovers (better)
  if (delta < 5) return null
  return {
    focus: 'game-sense',
    metric: 'Turnovers',
    value: turnovers,
    benchmark: BENCH.turnovers,
    delta,
    description: `Game-sense work showing — only ${fmtNum(turnovers)} turnovers (${fmtNum(delta)} below average), with ${fmtNum(clangers)} clangers.`,
    callout: `Decision-making sharp — only ${fmtNum(turnovers)} turnovers.`,
  }
}

function analyzeVideoReview(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  // Video review emphasises fewer errors — same signal as game-sense
  const finding = analyzeGameSense(stats)
  if (!finding) return null
  return {
    ...finding,
    focus: 'video-review',
    description: finding.description.replace('Game-sense work', 'Video-review sessions'),
    callout: finding.callout.replace('Decision-making sharp', 'Film study translating'),
  }
}

function analyzeSetPieces(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const inside50s = sum(stats, 'insideFifties')
  const goals = sum(stats, 'goals')
  if (inside50s < 5) return null
  const conversionRate = goals / inside50s
  const benchmarkRate = 0.24
  if (conversionRate < benchmarkRate + 0.04) return null
  const delta = Math.round((conversionRate - benchmarkRate) * inside50s)
  return {
    focus: 'set-pieces',
    metric: 'Set-Piece Conv.',
    value: Math.round(conversionRate * 100),
    benchmark: Math.round(benchmarkRate * 100),
    delta,
    description: `Set-piece training translated — ${pct(goals, inside50s)} conversion from ${fmtNum(inside50s)} inside 50s, executing on structured entries.`,
    callout: `Set-piece precision — ${pct(goals, inside50s)} conversion inside 50.`,
  }
}

function analyzeMental(
  stats: MatchPlayerStats[],
  userScores: QuarterScore[],
  opponentScores: QuarterScore[],
): TrainingImpactFinding | null {
  if (userScores.length < 4 || opponentScores.length < 4) return null
  const userTotal = userScores.reduce((s, q) => s + q.total, 0)
  const oppTotal = opponentScores.reduce((s, q) => s + q.total, 0)
  const margin = userTotal - oppTotal
  // Find composure if it was a close game (within 18 pts) that the user's club won
  if (margin <= 0 || margin > 18) return null
  const q4Margin = userScores[3].total - opponentScores[3].total
  if (q4Margin <= 0) return null
  const disposals = sum(stats, 'disposals')
  return {
    focus: 'mental',
    metric: 'Composure',
    value: margin,
    benchmark: 0,
    delta: q4Margin,
    description: `Mental training paid off — outscored opposition in Q4 by ${fmtNum(q4Margin)} pts to hold on in a ${fmtNum(margin)}-pt win, with ${fmtNum(disposals)} disciplined disposals.`,
    callout: `Mental training showing — composed under Q4 pressure.`,
  }
}

function analyzeMarking(stats: MatchPlayerStats[]): TrainingImpactFinding | null {
  const cMarks = sum(stats, 'contestedMarks')
  const delta = cMarks - BENCH.contestedMarks
  if (delta < 2) return null
  return {
    focus: 'marking',
    metric: 'Contested Marks',
    value: cMarks,
    benchmark: BENCH.contestedMarks,
    delta,
    description: `Marking drills showed — ${fmtNum(cMarks)} contested marks (${fmtNum(delta)} above average), winning aerial contests.`,
    callout: `Marking drills showing — ${fmtNum(cMarks)} contested marks.`,
  }
}

// ── Main analysis function ────────────────────────────────────────────────────

export function analyzeTrainingImpact(
  focuses: TrainingFocus[],
  userPlayerStats: MatchPlayerStats[],
  userScores: QuarterScore[],
  opponentScores: QuarterScore[],
): TrainingImpactSummary | null {
  if (focuses.length === 0 || userPlayerStats.length === 0) return null

  const findings: TrainingImpactFinding[] = []

  for (const focus of focuses) {
    let finding: TrainingImpactFinding | null = null
    switch (focus) {
      case 'contested':
        finding = analyzeContested(userPlayerStats)
        break
      case 'physical':
        finding = analyzePhysical(userPlayerStats, userScores)
        break
      case 'match-fitness':
        finding = analyzeMatchFitness(userPlayerStats, userScores)
        break
      case 'kicking':
        finding = analyzeKicking(userPlayerStats)
        break
      case 'handball':
        // handball: look for low kick rate as a sign of handpass-dominant play
        {
          const kicks = sum(userPlayerStats, 'kicks')
          const disposals = sum(userPlayerStats, 'disposals')
          const hb = sum(userPlayerStats, 'handballs')
          if (disposals > 100 && kicks / disposals < 0.50 && hb > 130) {
            finding = {
              focus: 'handball',
              metric: 'Handball Rate',
              value: hb,
              benchmark: 130,
              delta: hb - 130,
              description: `Handball training executing — ${fmtNum(hb)} handballs (${pct(hb, disposals)} of disposals), building chain possession through the corridor.`,
              callout: `Handball training translating — rapid chain possession.`,
            }
          }
        }
        break
      case 'marking':
        finding = analyzeMarking(userPlayerStats)
        break
      case 'defensive':
        finding = analyzeDefensive(userPlayerStats)
        break
      case 'ruck':
        finding = analyzeRuck(userPlayerStats)
        break
      case 'offensive':
        finding = analyzeOffensive(userPlayerStats)
        break
      case 'game-sense':
        finding = analyzeGameSense(userPlayerStats)
        break
      case 'video-review':
        finding = analyzeVideoReview(userPlayerStats)
        break
      case 'set-pieces':
        finding = analyzeSetPieces(userPlayerStats)
        break
      case 'mental':
        finding = analyzeMental(userPlayerStats, userScores, opponentScores)
        break
      default:
        break
    }
    if (finding) findings.push(finding)
  }

  if (findings.length === 0) return null

  // Sort by delta descending, cap at 4
  findings.sort((a, b) => b.delta - a.delta)
  const top = findings.slice(0, 4)

  const headline = top[0].description

  return {
    focuses: focuses as string[],
    findings: top,
    headlineInsight: headline,
  }
}

// ── Commentary callout injection ──────────────────────────────────────────────

/**
 * Inject sparse training-callout events into the play-by-play array.
 * Callouts are placed at quarter-break boundaries (Q2, Q3, Q4) so they
 * read as half-time or three-quarter-time analyst notes.
 *
 * Returns the augmented play-by-play array (does NOT mutate the input).
 */
export function injectTrainingCallouts(
  playByPlay: PlayByPlayEvent[],
  summary: TrainingImpactSummary,
  userClubId: string,
): PlayByPlayEvent[] {
  if (summary.findings.length === 0) return playByPlay

  // Quarter breaks we're allowed to inject into (Q2, Q3, Q4 openings)
  const targetQuarters = [2, 3, 4]
  const callouts = summary.findings
    .slice(0, 3) // at most 3 callouts
    .map((f) => f.callout)

  const result = [...playByPlay]
  let calloutIdx = 0

  // Walk from end to start so splice offsets don't shift remaining targets
  for (let i = result.length - 1; i >= 0 && calloutIdx < callouts.length; i--) {
    const ev = result[i]
    if (ev.type !== 'quarter-break') continue
    if (!targetQuarters.includes(ev.quarter)) continue

    // Insert callout AFTER the quarter-break divider
    const callout: PlayByPlayEvent = {
      id: `training-callout-q${ev.quarter}-${calloutIdx}`,
      quarter: ev.quarter,
      minute: 0,
      type: 'training-callout',
      clubId: userClubId,
      commentary: callouts[calloutIdx],
      isHighlight: false,
    }
    result.splice(i + 1, 0, callout)
    calloutIdx++
  }

  return result
}
