import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Calendar, Hash, Save, RotateCcw, Home, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/layout/ThemeProvider'
import { useGameStore } from '@/stores/gameStore'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function TopBar() {
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const currentYear = useGameStore((s) => s.currentYear)
  const currentRound = useGameStore((s) => s.currentRound)
  const currentDate = useGameStore((s) => s.currentDate)
  const phase = useGameStore((s) => s.phase)
  const saveGame = useGameStore((s) => s.saveGame)
  const resetGame = useGameStore((s) => s.resetGame)
  const meta = useGameStore((s) => s.meta)

  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false)
  const [showSavedBadge, setShowSavedBadge] = useState(false)

  const phaseLabel = {
    'setup': 'Setup',
    'preseason': 'Pre-Season',
    'regular-season': 'Season',
    'finals': 'Finals',
    'post-season': 'Post-Season',
    'offseason': 'Off-Season',
  }[phase]

  const handleSave = () => {
    saveGame()
    setShowSavedBadge(true)
    setTimeout(() => setShowSavedBadge(false), 2000)
  }

  const handleNewGame = () => {
    setShowNewGameConfirm(true)
  }

  const handleConfirmNewGame = () => {
    resetGame()
    setShowNewGameConfirm(false)
    navigate('/')
  }

  // Format date for display
  const displayDate = currentDate
    ? new Date(currentDate + 'T00:00:00').toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : ''

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">AFL Manager</h1>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {displayDate || currentYear}
          </Badge>
          {phase === 'regular-season' && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              Round {currentRound + 1}
            </Badge>
          )}
          <Badge variant="outline">{phaseLabel}</Badge>
          {showSavedBadge && (
            <Badge variant="secondary" className="text-green-500 animate-in fade-in">
              Saved
            </Badge>
          )}
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save Game
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleNewGame}>
                <RotateCcw className="mr-2 h-4 w-4" />
                New Game
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewGame}>
                <Home className="mr-2 h-4 w-4" />
                Main Menu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* New Game Confirmation Dialog */}
      <Dialog open={showNewGameConfirm} onOpenChange={setShowNewGameConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Game?</DialogTitle>
            <DialogDescription>
              This will reset all progress in your current save
              {meta.saveName ? ` "${meta.saveName}"` : ''}.
              Unsaved progress will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewGameConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmNewGame}>
              New Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
