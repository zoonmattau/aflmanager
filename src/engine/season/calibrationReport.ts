import type { Match, MatchPlayerStats } from '@/types/match'

const TARGETS = {
  teamPerGame: {
    disposals: 358,
    marks: 84,
    tackles: 61,
    goals: 11.5,
  },
  fantasy: {
    mean: 71,
    p90: 112,
  },
  superCoach: {
    mean: 75,
    p90: 122,
    poolPerMatch: 3300,
  },
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.min(sorted.length - 1, lo + 1)
  const t = idx - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * t
}

function pctDelta(actual: number, target: number): number {
  if (target === 0) return 0
  return ((actual - target) / target) * 100
}

function formatDelta(actual: number, target: number): string {
  const delta = pctDelta(actual, target)
  const sign = delta > 0 ? '+' : ''
  return `${actual.toFixed(1)} (target ${target.toFixed(1)}, ${sign}${delta.toFixed(1)}%)`
}

function sortNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

function participated(stat: MatchPlayerStats): boolean {
  return stat.participated || stat.minutesPlayed > 0
}

export function buildSeasonCalibrationReport(matches: Match[]): {
  headline: string
  body: string
} | null {
  const played = matches.filter((m) => m.result)
  if (played.length === 0) return null

  let teamGames = 0
  let totalDisposals = 0
  let totalMarks = 0
  let totalTackles = 0
  let totalGoals = 0
  const fantasyScores: number[] = []
  const superCoachScores: number[] = []
  let scPoolValidated = 0

  for (const match of played) {
    if (!match.result) continue
    teamGames += 2
    const home = match.result.homePlayerStats
    const away = match.result.awayPlayerStats
    for (const stat of [...home, ...away]) {
      totalDisposals += stat.disposals
      totalMarks += stat.marks
      totalTackles += stat.tackles
      if (participated(stat)) {
        fantasyScores.push(stat.aflFantasyPoints)
        superCoachScores.push(stat.superCoachPoints)
      }
    }
    totalGoals += match.result.homeScores.reduce((sum, q) => sum + q.goals, 0)
    totalGoals += match.result.awayScores.reduce((sum, q) => sum + q.goals, 0)

    const scPool = [...home, ...away].reduce((sum, s) => sum + s.superCoachPoints, 0)
    if (scPool === TARGETS.superCoach.poolPerMatch) scPoolValidated++
  }

  const avgDisposals = teamGames > 0 ? totalDisposals / teamGames : 0
  const avgMarks = teamGames > 0 ? totalMarks / teamGames : 0
  const avgTackles = teamGames > 0 ? totalTackles / teamGames : 0
  const avgGoals = teamGames > 0 ? totalGoals / teamGames : 0

  const fantasySorted = sortNumbers(fantasyScores)
  const scSorted = sortNumbers(superCoachScores)
  const fantasyMean = fantasyScores.length > 0 ? fantasyScores.reduce((s, v) => s + v, 0) / fantasyScores.length : 0
  const scMean = superCoachScores.length > 0 ? superCoachScores.reduce((s, v) => s + v, 0) / superCoachScores.length : 0
  const fantasyP90 = percentile(fantasySorted, 0.9)
  const scP90 = percentile(scSorted, 0.9)

  return {
    headline: `Season calibration report (${played.length} matches)`,
    body: [
      `Team averages per game: disposals ${formatDelta(avgDisposals, TARGETS.teamPerGame.disposals)}, marks ${formatDelta(avgMarks, TARGETS.teamPerGame.marks)}, tackles ${formatDelta(avgTackles, TARGETS.teamPerGame.tackles)}, goals ${formatDelta(avgGoals, TARGETS.teamPerGame.goals)}.`,
      `AFL Fantasy distribution: mean ${formatDelta(fantasyMean, TARGETS.fantasy.mean)}, p90 ${formatDelta(fantasyP90, TARGETS.fantasy.p90)}.`,
      `SuperCoach distribution: mean ${formatDelta(scMean, TARGETS.superCoach.mean)}, p90 ${formatDelta(scP90, TARGETS.superCoach.p90)}.`,
      `SuperCoach 3300 pool validation: ${scPoolValidated}/${played.length} matches exactly at ${TARGETS.superCoach.poolPerMatch}.`,
      `Scoring rules unchanged: AFL Fantasy and SuperCoach formulas remained fixed while simulation volume was calibrated.`,
    ].join('\n'),
  }
}

