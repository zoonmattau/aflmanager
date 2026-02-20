/** Disposal Efficiency % = (disposals - clangers) / disposals * 100 */
export function calcDisposalEfficiency(disposals: number, clangers: number): number | null {
  if (disposals <= 0) return null
  return Math.max(0, ((disposals - clangers) / disposals) * 100)
}

/** Kicking Accuracy % = goals / (goals + behinds) * 100 */
export function calcKickingAccuracy(goals: number, behinds: number): number | null {
  const shots = goals + behinds
  if (shots <= 0) return null
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
