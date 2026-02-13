import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'

export function GameplanPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const updateGameplan = useGameStore((s) => s.updateGameplan)

  const club = clubs[playerClubId]
  const gameplan = club?.gameplan

  if (!gameplan) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Gameplan</h1>
          <p className="text-sm text-muted-foreground">
            Set your team's tactical approach
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offensive Style</CardTitle>
            <CardDescription>
              How your team approaches possession and scoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="offensive-style">Style</Label>
            <Select
              value={gameplan.offensiveStyle}
              onValueChange={(v) =>
                updateGameplan({ offensiveStyle: v as 'attacking' | 'balanced' | 'defensive' })
              }
            >
              <SelectTrigger id="offensive-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attacking">
                  Attacking - Push numbers forward, high risk/reward
                </SelectItem>
                <SelectItem value="balanced">
                  Balanced - Measured approach
                </SelectItem>
                <SelectItem value="defensive">
                  Defensive - Protect the backline, counter-attack
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tempo</CardTitle>
            <CardDescription>
              The pace your team moves the ball
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="tempo">Tempo</Label>
            <Select
              value={gameplan.tempo}
              onValueChange={(v) =>
                updateGameplan({ tempo: v as 'fast' | 'medium' | 'slow' })
              }
            >
              <SelectTrigger id="tempo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">
                  Fast - Quick ball movement, run and carry
                </SelectItem>
                <SelectItem value="medium">
                  Medium - Balanced tempo
                </SelectItem>
                <SelectItem value="slow">
                  Slow - Methodical, control possession
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aggression</CardTitle>
            <CardDescription>
              How physically your team contests the ball
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="aggression">Level</Label>
            <Select
              value={gameplan.aggression}
              onValueChange={(v) =>
                updateGameplan({ aggression: v as 'high' | 'medium' | 'low' })
              }
            >
              <SelectTrigger id="aggression">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">
                  High - Hard at the contest, more tackles & pressure
                </SelectItem>
                <SelectItem value="medium">
                  Medium - Standard pressure
                </SelectItem>
                <SelectItem value="low">
                  Low - Conserve energy, pick contests wisely
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tactical Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your {club?.name} will play a{' '}
            <span className="font-semibold text-foreground">
              {gameplan.offensiveStyle}
            </span>{' '}
            style at{' '}
            <span className="font-semibold text-foreground">{gameplan.tempo}</span>{' '}
            tempo with{' '}
            <span className="font-semibold text-foreground">{gameplan.aggression}</span>{' '}
            aggression.
          </p>
          {gameplan.offensiveStyle === 'attacking' && (
            <p className="text-xs text-muted-foreground mt-2">
              + Higher scoring chance, more inside 50s. - More vulnerable on counter-attack.
            </p>
          )}
          {gameplan.offensiveStyle === 'defensive' && (
            <p className="text-xs text-muted-foreground mt-2">
              + Stronger defensively, better rebound. - Lower scoring output.
            </p>
          )}
          {gameplan.tempo === 'fast' && (
            <p className="text-xs text-muted-foreground mt-1">
              + More possessions per quarter. - Higher fatigue accumulation.
            </p>
          )}
          {gameplan.aggression === 'high' && (
            <p className="text-xs text-muted-foreground mt-1">
              + More contested possessions and tackles. - Higher injury risk.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
