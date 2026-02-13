import { Sun, Moon, Calendar, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/layout/ThemeProvider'
import { useGameStore } from '@/stores/gameStore'
import { Badge } from '@/components/ui/badge'

export function TopBar() {
  const { resolvedTheme, setTheme } = useTheme()
  const currentYear = useGameStore((s) => s.currentYear)
  const currentRound = useGameStore((s) => s.currentRound)
  const phase = useGameStore((s) => s.phase)

  const phaseLabel = {
    'setup': 'Setup',
    'preseason': 'Pre-Season',
    'regular-season': 'Season',
    'finals': 'Finals',
    'post-season': 'Post-Season',
    'offseason': 'Off-Season',
  }[phase]

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">AFL Manager</h1>
        <Badge variant="secondary" className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {currentYear}
        </Badge>
        {phase === 'regular-season' && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Round {currentRound + 1}
          </Badge>
        )}
        <Badge variant="outline">{phaseLabel}</Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  )
}
