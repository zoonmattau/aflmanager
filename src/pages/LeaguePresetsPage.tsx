import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronLeft, Plus, Trash2, Lock, Settings } from 'lucide-react'
import type { LeaguePreset } from '@/types/leaguePreset'
import { createDefaultSettings } from '@/engine/core/defaultSettings'

const BUILT_IN_PRESETS: LeaguePreset[] = [
  {
    id: 'standard-afl',
    name: 'Standard AFL',
    description: 'Default AFL settings with 18 teams, 23 rounds, and top-8 finals.',
    createdAt: '',
    lastModified: '',
    settings: createDefaultSettings(),
    isBuiltIn: true,
  },
  {
    id: 'quick-play',
    name: 'Quick Play',
    description: 'Shortened season with 12 rounds for faster gameplay.',
    createdAt: '',
    lastModified: '',
    settings: {
      ...createDefaultSettings(),
      seasonStructure: {
        regularSeasonRounds: 12,
        byeRounds: false,
        byeRoundCount: 0,
      },
      simSpeed: 'instant',
    },
    isBuiltIn: true,
  },
]

export function LeaguePresetsPage() {
  const setScreen = useAppStore((s) => s.setScreen)
  const leaguePresets = useAppStore((s) => s.leaguePresets)
  const createLeaguePreset = useAppStore((s) => s.createLeaguePreset)
  const deleteLeaguePreset = useAppStore((s) => s.deleteLeaguePreset)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetDescription, setNewPresetDescription] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const allPresets = [...BUILT_IN_PRESETS, ...leaguePresets]

  const handleCreate = async () => {
    if (!newPresetName.trim()) return
    const now = new Date().toISOString()
    const preset: LeaguePreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      description: newPresetDescription.trim(),
      createdAt: now,
      lastModified: now,
      settings: createDefaultSettings(),
      isBuiltIn: false,
    }
    await createLeaguePreset(preset)
    setNewPresetName('')
    setNewPresetDescription('')
    setShowCreateDialog(false)
  }

  const handleDelete = async (presetId: string) => {
    await deleteLeaguePreset(presetId)
    setDeleteConfirmId(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScreen('home')}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">League Setups</h1>
          </div>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New Preset
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl p-4">
        <ScrollArea className="max-h-[calc(100vh-120px)]">
          <div className="space-y-3">
            {allPresets.map((preset) => (
              <Card key={preset.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{preset.name}</CardTitle>
                      {preset.isBuiltIn && (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="mr-1 h-3 w-3" />
                          Built-in
                        </Badge>
                      )}
                    </div>
                    {!preset.isBuiltIn && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setDeleteConfirmId(preset.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {preset.description && (
                    <CardDescription>{preset.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      <Settings className="mr-1 h-3 w-3" />
                      {preset.settings.teamCount} teams
                    </Badge>
                    <Badge variant="outline">
                      {preset.settings.seasonStructure.regularSeasonRounds} rounds
                    </Badge>
                    <Badge variant="outline">
                      {preset.settings.finals.finalsFormat.replace(/-/g, ' ')}
                    </Badge>
                    <Badge variant="outline">
                      {preset.settings.difficulty}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Create Preset Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create League Preset</DialogTitle>
            <DialogDescription>
              Save a reusable league configuration. It will start with default settings
              that you can customize when creating a new game.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Preset Name</Label>
              <Input
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="My Custom League"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                placeholder="Short description of this setup"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newPresetName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Preset?</DialogTitle>
            <DialogDescription>
              This preset will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
