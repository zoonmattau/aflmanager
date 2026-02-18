export type CompareWinner = 'a' | 'b' | 'tie'

/** Compare two numeric values. When `inverted`, lower is better (e.g. turnovers). */
export function compareValues(a: number, b: number, inverted = false): CompareWinner {
  if (a === b) return 'tie'
  const aWins = inverted ? a < b : a > b
  return aWins ? 'a' : 'b'
}

/** Return Tailwind classes for a comparison cell. */
export function comparisonClass(winner: CompareWinner, side: 'a' | 'b'): string {
  if (winner === 'tie') return ''
  if (winner === side) return 'text-green-500 font-semibold'
  return 'text-muted-foreground'
}
