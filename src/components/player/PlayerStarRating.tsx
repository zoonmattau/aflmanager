import { Star, StarHalf } from 'lucide-react'

export function PlayerStarRating({ stars, className = '' }: { stars: number; className?: string }) {
  const fullStars = Math.floor(stars)
  const hasHalf = stars % 1 !== 0
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)

  return (
    <div className={`flex items-center gap-px ${className}`}>
      {Array.from({ length: fullStars }, (_, i) => (
        <Star key={`f${i}`} className="h-3.5 w-3.5 fill-current text-amber-400" />
      ))}
      {hasHalf && <StarHalf className="h-3.5 w-3.5 fill-current text-amber-400" />}
      {Array.from({ length: emptyStars }, (_, i) => (
        <Star key={`e${i}`} className="h-3.5 w-3.5 text-muted-foreground/30" />
      ))}
    </div>
  )
}
