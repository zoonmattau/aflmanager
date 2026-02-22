import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, X } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { CHALLENGE_TEMPLATES } from '@/engine/legacy/legacyEngine'
import type { ChallengeId } from '@/types/legacy'

export function NewChallengeModal() {
  const pendingChallengePrompt = useGameStore((s) => s.legacyState.pendingChallengePrompt)
  const acceptChallenge = useGameStore((s) => s.acceptChallenge)
  const declineChallenge = useGameStore((s) => s.declineChallenge)

  if (!pendingChallengePrompt) return null

  const featuredChallenges = CHALLENGE_TEMPLATES.filter((c) =>
    ['back-to-back', 'three-peat', 'youth-only', 'rebuild'].includes(c.id)
  )

  return (
    <Dialog open={pendingChallengePrompt} onOpenChange={(open) => { if (!open) declineChallenge() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Premiership won! What's next?
          </DialogTitle>
          <DialogDescription>
            Congratulations on the flag. Fancy a new challenge to keep things interesting?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          {featuredChallenges.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border p-4 hover:border-primary/60 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-start justify-between">
                <span className="font-semibold text-sm">{c.title}</span>
                <Badge variant="secondary" className="text-xs shrink-0">+{c.legacyReward} pts</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{c.description}</p>
              <ul className="space-y-0.5">
                {c.rules.map((rule, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1">
                    <span className="text-primary mt-0.5">·</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <div className="text-xs text-muted-foreground">
                Duration: {c.targetSeasons === 1 ? '1 season' : `${c.targetSeasons} seasons`}
              </div>
              <Button
                size="sm"
                className="mt-auto"
                onClick={() => acceptChallenge(c.id as ChallengeId)}
              >
                Accept Challenge
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={declineChallenge} className="text-muted-foreground gap-1">
            <X className="h-3 w-3" />
            Just keep playing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
