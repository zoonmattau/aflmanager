import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { del } from 'idb-keyval'

export function GlobalSettingsPage() {
  const setScreen = useAppStore((s) => s.setScreen)
  const globalSettings = useAppStore((s) => s.globalSettings)
  const updateGlobalSettings = useAppStore((s) => s.updateGlobalSettings)
  const refreshSaveIndex = useAppStore((s) => s.refreshSaveIndex)

  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const handleClearAllSaves = async () => {
    // Clear save index and all save slots
    const { getSaveIndex } = await import('@/lib/saveManager')
    const index = await getSaveIndex()
    for (const save of index.saves) {
      await del(`afl-save:${save.id}`)
    }
    await del('afl-save-index')
    await refreshSaveIndex()
    setShowClearConfirm(false)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScreen('home')}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
        {/* Display */}
        <Card>
          <CardHeader>
            <CardTitle>Display</CardTitle>
            <CardDescription>Appearance preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Theme</Label>
              <Select
                value={globalSettings.theme}
                onValueChange={(v) =>
                  updateGlobalSettings({ theme: v as 'dark' | 'light' | 'system' })
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Auto-Save */}
        <Card>
          <CardHeader>
            <CardTitle>Auto-Save</CardTitle>
            <CardDescription>Automatically save your game at regular intervals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enable Auto-Save</Label>
              <Switch
                checked={globalSettings.autoSaveEnabled}
                onCheckedChange={(checked) =>
                  updateGlobalSettings({ autoSaveEnabled: checked })
                }
              />
            </div>
            {globalSettings.autoSaveEnabled && (
              <div className="flex items-center justify-between">
                <Label>Save Interval</Label>
                <Select
                  value={String(globalSettings.autoSaveIntervalMinutes)}
                  onValueChange={(v) =>
                    updateGlobalSettings({ autoSaveIntervalMinutes: Number(v) })
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 minute</SelectItem>
                    <SelectItem value="3">3 minutes</SelectItem>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gameplay Defaults */}
        <Card>
          <CardHeader>
            <CardTitle>Gameplay Defaults</CardTitle>
            <CardDescription>Default settings for new games</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Default Sim Speed</Label>
              <Select
                value={globalSettings.defaultSimSpeed}
                onValueChange={(v) =>
                  updateGlobalSettings({ defaultSimSpeed: v as 'instant' | 'fast' | 'normal' })
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">Instant</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>Manage saved game data</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All Saves
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Clear Confirmation Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Saves?</DialogTitle>
            <DialogDescription>
              This will permanently delete all saved games. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearAllSaves}>
              Delete All Saves
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
