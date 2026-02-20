import { formDotColorClass } from '@/lib/formGuide'

interface FormDotsProps {
  /** Match rating history, newest first. Up to 5 entries. */
  ratings?: number[]
  /** Number of slots to always show (default 5). */
  slots?: number
  size?: 'sm' | 'md'
}

/**
 * Renders 5 coloured dots representing recent match ratings.
 * Gold ≥ 8.0, Green 6.5–7.9, Grey 5.0–6.4, Red < 5.0, hollow = no game.
 * Displayed oldest → newest (left → right).
 */
export function FormDots({ ratings, slots = 5, size = 'sm' }: FormDotsProps) {
  const dotSize = size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'

  // ratings[0] = newest; we display oldest → newest so reverse
  const ordered = ratings ? [...ratings].reverse() : []
  const emptySlots = Math.max(0, slots - ordered.length)

  return (
    <div className="flex items-center gap-1">
      {/* Empty slots on the left (older games not recorded) */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className={`${dotSize} rounded-full border border-zinc-600 bg-transparent`}
          title="No data"
        />
      ))}
      {/* Played game dots */}
      {ordered.map((rating, i) => (
        <div
          key={`dot-${i}`}
          className={`${dotSize} rounded-full ${formDotColorClass(rating)}`}
          title={`${rating.toFixed(1)} rating`}
        />
      ))}
    </div>
  )
}
