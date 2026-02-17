import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useGameStore } from '@/stores/gameStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Play, Calendar, User } from 'lucide-react'

interface LoadGameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PHASE_LABELS: Record<string, string> = {
  'setup': 'Setup',
  'preseason': 'Pre-Season',
  'regular-season': 'Season',
  'finals': 'Finals',
  'post-season': 'Post-Season',
  'offseason': 'Off-Season',
}

export function LoadGameDialog({ open, onOpenChange }: LoadGameDialogProps) {
  const saveIndex = useAppStore((s) => s.saveIndex)
  const loadGame = useAppStore((s) => s.loadGame)
  const deleteSave = useAppStore((s) => s.deleteSave)
  const setScreen = useAppStore((s) => s.setScreen)
  const loadState = useGameStore((s) => s.loadState)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const saves = [...(saveIndex?.saves ?? [])].sort(
    (a, b) => b.lastSaved.localeCompare(a.lastSaved),
  )

  const handleLoad = async (saveId: string) => {
    setLoading(true)
    const gameState = await loadGame(saveId)
    if (gameState) {
      loadState(gameState)
      onOpenChange(false)
      setScreen('game')
    }
    setLoading(false)
  }

  const handleDelete = async (saveId: string) => {
    await deleteSave(saveId)
    setDeleteConfirmId(null)
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Load Game</DialogTitle>
          <DialogDescription>
            Select a save to continue your career.
          </DialogDescription>
        </DialogHeader>

        {saves.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No saved games found. Start a new game to begin.
          </p>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-3">
              {saves.map((save) => (
                <div
                  key={save.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{save.saveName}</span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {PHASE_LABELS[save.phase] ?? save.phase}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {save.managerName}
                      </span>
                      <span>{save.clubName || 'Unemployed'}</span>
                      <span>Year {save.currentYear}</span>
                      {save.phase === 'regular-season' && (
                        <span>Rd {save.currentRound + 1}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(save.lastSaved)}
                    </div>
                  </div>

                  <div className="ml-3 flex items-center gap-1">
                    {deleteConfirmId === save.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(save.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setDeleteConfirmId(save.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <Button
                          size="sm"
                          disabled={loading}
                          onClick={() => handleLoad(save.id)}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Load
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
