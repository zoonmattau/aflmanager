import { User, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AICoachProfile, CoachKnowledgeEntry } from '@/types/coach'
import { FamiliarityBar, TierBadge } from './FamiliarityBar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const PHILOSOPHY_LABELS: Record<string, string> = {
  'possession-first': 'Possession First',
  'direct-attack': 'Direct Attack',
  'grind-it-out': 'Grind It Out',
  'defensive-structure': 'Defensive Structure',
  'hybrid-adaptive': 'Hybrid / Adaptive',
}

interface CoachCardProps {
  coach: AICoachProfile
  knowledge: CoachKnowledgeEntry
  /** If true, show full reveal (own club coach) */
  fullyRevealed?: boolean
}

export function CoachCard({ coach, knowledge, fullyRevealed = false }: CoachCardProps) {
  const { tier, familiarity } = knowledge
  const isUnknown = tier === 'unknown' && !fullyRevealed
  const showPhilosophy = fullyRevealed || tier !== 'unknown'

  const displayName = isUnknown ? 'Unknown Coach' : `${coach.firstName} ${coach.lastName}`

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{displayName}</span>
              {(fullyRevealed || tier !== 'unknown') && (
                <TierBadge tier={tier} />
              )}
            </div>

            {showPhilosophy && coach.tacticalPhilosophy && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {PHILOSOPHY_LABELS[coach.tacticalPhilosophy] ?? coach.tacticalPhilosophy}
              </p>
            )}

            <div className="mt-2">
              <FamiliarityBar
                familiarity={familiarity}
                tier={tier}
                showLabel={false}
              />
            </div>
          </div>

          {/* Link */}
          <Button variant="ghost" size="sm" asChild className="shrink-0 -mr-1">
            <Link to={`/coaches/${coach.id}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
