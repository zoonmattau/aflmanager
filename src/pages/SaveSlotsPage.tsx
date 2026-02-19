import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import { uploadSave } from '@/lib/cloudSaveManager'
import { getCheckpointsForGame, loadCheckpoint, saveGameToSlot } from '@/lib/saveManager'
import type { CheckpointMeta } from '@/types/save'
import type { GamePhase } from '@/types/game'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Save, RotateCcw, Trash2, Clock, CheckCircle2, RefreshCw, Cloud, CloudUpload, Loader2, AlertTriangle } from 'lucide-react'
import { CloudSavesPanel } from '@/components/cloud/CloudSavesPanel'
import { AuthModal } from '@/components/auth/AuthModal'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPhase(phase: GamePhase): string {
  return phase
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatRound(round: number): string {
  if (round < 0) return 'Off-season'
  if (round === 0) return 'Pre-season'
  return `Round ${round}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Checkpoint card
// ---------------------------------------------------------------------------

interface CheckpointCardProps {
  cp: CheckpointMeta
  onRestore: (cp: CheckpointMeta) => void
  onDelete: (cp: CheckpointMeta) => void
}

function CheckpointCard({ cp, onRestore, onDelete }: CheckpointCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
        {cp.type === 'autosave' ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{cp.label}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
            {formatPhase(cp.phase)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {cp.currentYear} · {formatRound(cp.currentRound)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span title={formatDate(cp.savedAt)}>{timeAgo(cp.savedAt)} — {formatDate(cp.savedAt)}</span>
        </p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onRestore(cp)}>
          <RotateCcw className="h-3 w-3" />
          Restore
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(cp)}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SaveSlotsPage() {
  const navigate = useNavigate()
  const loadState = useGameStore((s) => s.loadState)
  const meta = useGameStore((s) => s.meta)
  const phase = useGameStore((s) => s.phase)
  const currentYear = useGameStore((s) => s.currentYear)
  const currentRound = useGameStore((s) => s.currentRound)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const createManualSave = useAppStore((s) => s.createManualSave)
  const deleteCheckpointAction = useAppStore((s) => s.deleteCheckpoint)
  const saveCurrentGame = useAppStore((s) => s.saveCurrentGame)

  const user = useAuthStore((s) => s.user)
  const cloudSync = useAuthStore((s) => s.cloudSync)
  const setCloudSync = useAuthStore((s) => s.setCloudSync)

  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([])
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<CheckpointMeta | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CheckpointMeta | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [manualSyncing, setManualSyncing] = useState(false)

  const reloadCheckpoints = useCallback(async () => {
    if (!meta.id) return
    const cps = await getCheckpointsForGame(meta.id)
    setCheckpoints(cps)
  }, [meta.id])

  useEffect(() => {
    void reloadCheckpoints()
  }, [reloadCheckpoints])

  // ── Manual Save ──────────────────────────────────────────────────────────

  const handleCreateSave = async () => {
    const label = saveName.trim()
    if (!label) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      const fullState = useGameStore.getState()
      await createManualSave(fullState, label)
      setSaveName('')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
      await reloadCheckpoints()
    } finally {
      setSaving(false)
    }
  }

  // ── Quick-save current state ──────────────────────────────────────────────

  const handleQuickSave = async () => {
    setSaving(true)
    try {
      const fullState = useGameStore.getState()
      const updatedState = {
        ...fullState,
        meta: { ...fullState.meta, lastSaved: new Date().toISOString() },
      }
      await saveCurrentGame(updatedState)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  // ── Restore (rollback) ───────────────────────────────────────────────────

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const restored = await loadCheckpoint(restoreTarget.id)
      if (restored) {
        const restoredWithTimestamp = {
          ...restored,
          meta: { ...restored.meta, lastSaved: new Date().toISOString() },
        }
        loadState(restoredWithTimestamp)
        await saveGameToSlot(restoredWithTimestamp)
        navigate('/')
      }
    } finally {
      setRestoring(false)
      setRestoreTarget(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteCheckpointAction(deleteTarget.gameId, deleteTarget.id)
    setDeleteTarget(null)
    await reloadCheckpoints()
  }

  // ── Manual cloud sync ─────────────────────────────────────────────────────

  const handleManualCloudSync = async () => {
    if (!user) { setShowAuthModal(true); return }
    setManualSyncing(true)
    setCloudSync({ status: 'syncing', lastError: null })
    const fullState = useGameStore.getState()
    const { error } = await uploadSave(fullState)
    setManualSyncing(false)
    if (error) {
      setCloudSync({ status: 'error', lastError: error })
    } else {
      setCloudSync({ status: 'synced', lastSyncedAt: new Date().toISOString() })
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const manualSaves = checkpoints.filter((c) => c.type === 'manual')
  const autosaves = checkpoints.filter((c) => c.type === 'autosave')
  const clubName = playerClubId ? (clubs[playerClubId]?.name ?? playerClubId) : 'Unemployed'

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Save Game</h1>
        <p className="text-sm text-muted-foreground">
          {clubName} · {currentYear} · {formatRound(currentRound)} · {formatPhase(phase)}
        </p>
      </div>

      {/* Quick Save */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Save</CardTitle>
          <CardDescription>
            Overwrite the main save file with the current game state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleQuickSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save Now'}
          </Button>
          {meta.lastSaved && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last saved: {formatDate(meta.lastSaved)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Create Manual Save Point */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Create Save Point</CardTitle>
          <CardDescription>
            Snapshot the current state under a name. Saved points persist until you delete them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateSave() }}
              placeholder={`e.g. "Before trade deadline"`}
              maxLength={60}
              className="flex-1"
            />
            <Button
              onClick={handleCreateSave}
              disabled={saving || !saveName.trim()}
              className="gap-2 flex-shrink-0"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {saveSuccess && (
            <p className="text-xs text-emerald-500">Save point created!</p>
          )}
        </CardContent>
      </Card>

      {/* Manual Save Points */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Manual Save Points
            <Badge variant="secondary" className="text-xs">
              {manualSaves.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Named snapshots you created. These are never auto-deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {manualSaves.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No manual saves yet — create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {manualSaves.map((cp) => (
                <CheckpointCard
                  key={cp.id}
                  cp={cp}
                  onRestore={setRestoreTarget}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Autosave Checkpoints */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Autosave Checkpoints
            <Badge variant="secondary" className="text-xs">
              {autosaves.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Snapshots created automatically at each autosave interval. Oldest are pruned once
            the limit is reached (configurable in Settings).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {autosaves.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No autosave checkpoints yet. Enable autosave in Settings to generate them.
            </p>
          ) : (
            <div className="space-y-2">
              {autosaves.map((cp) => (
                <CheckpointCard
                  key={cp.id}
                  cp={cp}
                  onRestore={setRestoreTarget}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cloud Saves */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Cloud className="h-4 w-4 text-primary/70" />
                Cloud Saves
              </CardTitle>
              <CardDescription className="mt-1">
                {user
                  ? `Signed in as ${user.email}. Saves sync automatically after each save.`
                  : 'Sign in to back up and restore saves across devices.'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sync status badge */}
              {user && (
                <>
                  {cloudSync.status === 'syncing' && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Syncing…
                    </Badge>
                  )}
                  {cloudSync.status === 'synced' && (
                    <Badge variant="outline" className="gap-1 text-xs text-emerald-500 border-emerald-500/30">
                      <Cloud className="h-3 w-3" />
                      Synced
                    </Badge>
                  )}
                  {cloudSync.status === 'error' && (
                    <Badge variant="outline" className="gap-1 text-xs text-destructive border-destructive/30">
                      <AlertTriangle className="h-3 w-3" />
                      Sync failed
                    </Badge>
                  )}
                </>
              )}
              {/* Actions */}
              {user ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => void handleManualCloudSync()}
                  disabled={manualSyncing || cloudSync.status === 'syncing'}
                >
                  <CloudUpload className="h-3 w-3" />
                  {manualSyncing ? 'Uploading…' : 'Upload Now'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowAuthModal(true)}
                >
                  <Cloud className="h-3 w-3" />
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {user && (
          <CardContent>
            <CloudSavesPanel
              currentLocalSaveId={meta.id || null}
              onDownloaded={() => void reloadCheckpoints()}
            />
          </CardContent>
        )}
      </Card>

      {/* Auth modal */}
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreTarget != null} onOpenChange={(open) => { if (!open) setRestoreTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Save Point?</DialogTitle>
            <DialogDescription>
              {restoreTarget && (
                <>
                  Restore to <strong>{restoreTarget.label}</strong> (
                  {restoreTarget.currentYear} · {formatRound(restoreTarget.currentRound)} ·{' '}
                  {formatPhase(restoreTarget.phase)})?
                  <br />
                  <span className="text-destructive font-medium">
                    Any unsaved progress since then will be permanently lost.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRestore} disabled={restoring}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {restoring ? 'Restoring…' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget != null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Save Point?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  Delete <strong>{deleteTarget.label}</strong>? This snapshot will be permanently
                  removed and cannot be recovered.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
