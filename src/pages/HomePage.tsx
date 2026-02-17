import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useGameStore } from '@/stores/gameStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadGameDialog } from '@/components/home/LoadGameDialog'
import { Play, Plus, FolderOpen, Settings, Trophy, Calendar } from 'lucide-react'

const PHASE_LABELS: Record<string, string> = {
  'setup': 'Setup',
  'preseason': 'Pre-Season',
  'regular-season': 'Season',
  'finals': 'Finals',
  'post-season': 'Post-Season',
  'offseason': 'Off-Season',
}

export function HomePage() {
  const saveIndex = useAppStore((s) => s.saveIndex)
  const setScreen = useAppStore((s) => s.setScreen)
  const loadGame = useAppStore((s) => s.loadGame)
  const loadState = useGameStore((s) => s.loadState)

  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [resuming, setResuming] = useState(false)

  const lastPlayedSave = saveIndex?.lastPlayedSaveId
    ? saveIndex.saves.find((s) => s.id === saveIndex.lastPlayedSaveId)
    : null

  const hasSaves = (saveIndex?.saves.length ?? 0) > 0

  const handleResume = async () => {
    if (!lastPlayedSave) return
    setResuming(true)
    const gameState = await loadGame(lastPlayedSave.id)
    if (gameState) {
      loadState(gameState)
      setScreen('game')
    }
    setResuming(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-md space-y-8 px-4">
        {/* Title */}
        <div className="space-y-2 text-center">
          <h1 className="text-5xl font-bold tracking-tight">AFL Manager</h1>
          <p className="text-muted-foreground">
            Build your dynasty. Shape the league.
          </p>
        </div>

        {/* Resume Game Card */}
        {lastPlayedSave && (
          <Card
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={handleResume}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Play className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Resume Game</span>
                  <Badge variant="outline" className="text-xs">
                    {PHASE_LABELS[lastPlayedSave.phase] ?? lastPlayedSave.phase}
                  </Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {lastPlayedSave.saveName} &mdash; {lastPlayedSave.clubName || 'Unemployed'}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Year {lastPlayedSave.currentYear}
                  </span>
                  {lastPlayedSave.phase === 'regular-season' && (
                    <span>Round {lastPlayedSave.currentRound + 1}</span>
                  )}
                </div>
              </div>
              {resuming && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </CardContent>
          </Card>
        )}

        {/* Menu Buttons */}
        <div className="space-y-3">
          <Button
            className="h-12 w-full justify-start gap-3 text-base"
            onClick={() => setScreen('new-game')}
          >
            <Plus className="h-5 w-5" />
            New Game
          </Button>

          <Button
            variant="secondary"
            className="h-12 w-full justify-start gap-3 text-base"
            disabled={!hasSaves}
            onClick={() => setLoadDialogOpen(true)}
          >
            <FolderOpen className="h-5 w-5" />
            Load Game
          </Button>

          <Button
            variant="secondary"
            className="h-12 w-full justify-start gap-3 text-base"
            onClick={() => setScreen('settings')}
          >
            <Settings className="h-5 w-5" />
            Settings
          </Button>

          <Button
            variant="secondary"
            className="h-12 w-full justify-start gap-3 text-base"
            onClick={() => setScreen('league-presets')}
          >
            <Trophy className="h-5 w-5" />
            League Setups
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          v0.1.0
        </p>
      </div>

      <LoadGameDialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen} />
    </div>
  )
}
