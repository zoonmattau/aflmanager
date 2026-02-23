import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Calendar, Save, Home, Menu, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/layout/ThemeProvider'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { useMatchReadyStore } from '@/stores/matchReadyStore'
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
  const currentDate = useGameStore((s) => s.currentDate)
  const phase = useGameStore((s) => s.phase)
  const saveGame = useGameStore((s) => s.saveGame)
  const meta = useGameStore((s) => s.meta)
  const calendar = useGameStore((s) => s.calendar)
  const simulation = useGameStore((s) => s.simulation)
  const setScreen = useAppStore((s) => s.setScreen)
  const { setDismissed } = useMatchReadyStore()

  const [showMainMenuConfirm, setShowMainMenuConfirm] = useState(false)
  const [showSavedBadge, setShowSavedBadge] = useState(false)

  // True when there is a pending match event for today or earlier (and no simulation running)
  const isMatchDay = useMemo(
    () =>
      (phase === 'regular-season' || phase === 'finals') &&
      !simulation.active &&
      calendar.events.some((e) => !e.resolved && e.type === 'match' && e.date <= (currentDate ?? '')),
    [phase, simulation.active, calendar.events, currentDate],
  )

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

  const handleMainMenu = () => {
    setShowMainMenuConfirm(true)
  }

  const handleConfirmMainMenu = () => {
    // Save before leaving
    saveGame()
    setShowMainMenuConfirm(false)
    setScreen('home')
  }

  // Format date for display
  const displayDate = currentDate
    ? new Date(currentDate + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
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
          <Badge variant="outline">{phaseLabel}</Badge>
          {isMatchDay && (
            <button
              type="button"
              onClick={() => setDismissed(false)}
              className="inline-flex animate-pulse cursor-pointer items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/25"
              title="Match Day — click to open match options"
            >
              Match Day
            </button>
          )}
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

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/game-settings')}
            aria-label="Game settings"
          >
            <Settings className="h-4 w-4" />
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
              <DropdownMenuItem onClick={handleMainMenu}>
                <Home className="mr-2 h-4 w-4" />
                Main Menu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Menu Confirmation Dialog */}
      <Dialog open={showMainMenuConfirm} onOpenChange={setShowMainMenuConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Main Menu?</DialogTitle>
            <DialogDescription>
              Your game{meta.saveName ? ` "${meta.saveName}"` : ''} will be saved
              automatically before returning to the main menu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMainMenuConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmMainMenu}>
              Save &amp; Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
