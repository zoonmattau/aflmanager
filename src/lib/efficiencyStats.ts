/** Disposal Efficiency % = (disposals - turnovers) / disposals * 100
 *  Uses turnovers (not clangers) as the inefficiency metric since clangers
 *  are a rare sub-event and produce too many false 100%s in single-game stats.
 *  Requires at least 5 disposals to avoid noise from very low touch counts. */
export function calcDisposalEfficiency(disposals: number, turnovers: number): number | null {
  if (disposals < 5) return null
  return Math.max(0, ((disposals - turnovers) / disposals) * 100)
}

/** Kicking Accuracy % = goals / (goals + behinds) * 100
 *  Requires at least 2 scoring shots to avoid false 100%s. */
export function calcKickingAccuracy(goals: number, behinds: number): number | null {
  const shots = goals + behinds
  if (shots < 2) return null
  return (goals / shots) * 100
}

/** Contested Possession % = contestedPossessions / (CP + UP) * 100 */
export function calcContestedPossessionPct(cp: number, up: number): number | null {
  const total = cp + up
  if (total <= 0) return null
  return (cp / total) * 100
}

/** Format a number as a percentage with 1dp, returns '-' if null */
export function fmtPct(val: number | null): string {
  if (val === null) return '-'
  return `${val.toFixed(1)}%`
}

/** K:H ratio = kicks / handballs */
export function calcKickToHandballRatio(kicks: number, handballs: number): number | null {
  if (handballs <= 0) return null
  return kicks / handballs
}

/** Format K:H ratio as "X.X:1", returns '-' if null */
export function fmtKHRatio(val: number | null): string {
  if (val === null) return '-'
  return `${val.toFixed(1)}:1`
}
