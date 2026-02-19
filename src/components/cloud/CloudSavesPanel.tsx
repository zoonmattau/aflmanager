/**
 * CloudSavesPanel – lists all cloud saves for the signed-in user and lets them
 * download any save to the local device.
 *
 * Designed to be embedded inside the SaveSlotsPage.
 */

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { listCloudSaves, downloadSave, deleteCloudSave } from '@/lib/cloudSaveManager'
import { saveGameToSlot } from '@/lib/saveManager'
import type { CloudSaveMeta } from '@/types/cloud'
import type { GameState } from '@/types/game'
import type { GamePhase } from '@/types/game'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Cloud, CloudDownload, Loader2, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'

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
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// CloudSaveCard
// ---------------------------------------------------------------------------

interface CloudSaveCardProps {
  save: CloudSaveMeta
  currentLocalSaveId: string | null
  onDownload: (save: CloudSaveMeta) => void
  onDelete: (save: CloudSaveMeta) => void
}

function CloudSaveCard({
  save,
  currentLocalSaveId,
  onDownload,
  onDelete,
}: CloudSaveCardProps) {
  const isCurrentDevice = save.localSaveId === currentLocalSaveId

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Cloud className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary/70" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{save.saveName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
            {formatPhase(save.phase)}
          </Badge>
          {isCurrentDevice && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
              This device
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {save.clubName} · {save.managerName}
        </p>
        <p className="text-xs text-muted-foreground">
          {save.currentYear} · {formatRound(save.currentRound)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saved {timeAgo(save.lastSaved)} — {formatDate(save.lastSaved)}
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          Synced to cloud {timeAgo(save.syncedAt)}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => onDownload(save)}
          title={isCurrentDevice ? 'Restore latest cloud version to this device' : 'Download to this device'}
        >
          <CloudDownload className="h-3 w-3" />
          {isCurrentDevice ? 'Restore' : 'Download'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(save)}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface CloudSavesPanelProps {
  /** The save ID currently loaded on this device (to mark "This device"). */
  currentLocalSaveId: string | null
  /** Called when the user successfully downloads a save so the parent can refresh. */
  onDownloaded: () => void
}

export function CloudSavesPanel({
  currentLocalSaveId,
  onDownloaded,
}: CloudSavesPanelProps) {
  const user = useAuthStore((s) => s.user)
  const cloudSync = useAuthStore((s) => s.cloudSync)
  const refreshSaveIndex = useAppStore((s) => s.refreshSaveIndex)

  const [saves, setSaves] = useState<CloudSaveMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [downloadTarget, setDownloadTarget] = useState<CloudSaveMeta | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<CloudSaveMeta | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load cloud saves whenever the user changes or panel mounts
  const fetchSaves = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setFetchError(null)
    const { data, error } = await listCloudSaves()
    setLoading(false)
    if (error) {
      setFetchError(error)
    } else {
      setSaves(data)
    }
  }, [user])

  useEffect(() => {
    void fetchSaves()
  }, [fetchSaves])

  // Also re-fetch when a sync completes
  useEffect(() => {
    if (cloudSync.status === 'synced') {
      void fetchSaves()
    }
  }, [cloudSync.status, fetchSaves])

  if (!user) return null

  // ── Download ────────────────────────────────────────────────────────────

  async function handleConfirmDownload() {
    if (!downloadTarget) return
    setDownloading(true)
    setDownloadError(null)

    const { data, error } = await downloadSave(downloadTarget.localSaveId)
    if (error || !data) {
      setDownloadError(error ?? 'Download failed')
      setDownloading(false)
      return
    }

    // Write to local IndexedDB under its original ID
    const restored: GameState = {
      ...(data as GameState),
      meta: {
        ...(data as GameState).meta,
        lastSaved: new Date().toISOString(),
      },
    }
    await saveGameToSlot(restored)
    await refreshSaveIndex()

    setDownloading(false)
    setDownloadTarget(null)
    onDownloaded()
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await deleteCloudSave(deleteTarget.localSaveId)
    setDeleting(false)
    setDeleteTarget(null)
    setSaves((prev) => prev.filter((s) => s.localSaveId !== deleteTarget.localSaveId))
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cloudSync.status === 'syncing' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
          {cloudSync.status === 'synced' && (
            <Cloud className="h-3.5 w-3.5 text-emerald-500" />
          )}
          {cloudSync.status === 'error' && (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          )}
          {cloudSync.status === 'idle' && (
            <Cloud className="h-3.5 w-3.5 text-muted-foreground/60" />
          )}
          <span className="text-xs text-muted-foreground">
            {cloudSync.status === 'syncing' && 'Uploading…'}
            {cloudSync.status === 'synced' &&
              `Synced ${cloudSync.lastSyncedAt ? timeAgo(cloudSync.lastSyncedAt) : ''}`}
            {cloudSync.status === 'error' && `Sync failed: ${cloudSync.lastError}`}
            {cloudSync.status === 'idle' && 'Saves sync automatically when you save'}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => void fetchSaves()}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : fetchError ? (
        <p className="text-sm text-destructive py-4 text-center">{fetchError}</p>
      ) : saves.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No cloud saves yet — they appear here after your first save.
        </p>
      ) : (
        <div className="space-y-2">
          {saves.map((save) => (
            <CloudSaveCard
              key={save.cloudId}
              save={save}
              currentLocalSaveId={currentLocalSaveId}
              onDownload={setDownloadTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Download confirmation dialog */}
      <Dialog
        open={downloadTarget != null}
        onOpenChange={(open) => {
          if (!open) { setDownloadTarget(null); setDownloadError(null) }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Cloud Save?</DialogTitle>
            <DialogDescription>
              {downloadTarget && (
                <>
                  Download <strong>{downloadTarget.saveName}</strong> (
                  {downloadTarget.currentYear} ·{' '}
                  {formatRound(downloadTarget.currentRound)} ·{' '}
                  {formatPhase(downloadTarget.phase)}) to this device?
                  <br />
                  <br />
                  It will be added to your local saves list. Any existing local
                  version of this save will be overwritten.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {downloadError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {downloadError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDownloadTarget(null); setDownloadError(null) }}
              disabled={downloading}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleConfirmDownload()} disabled={downloading}>
              <CloudDownload className="mr-2 h-4 w-4" />
              {downloading ? 'Downloading…' : 'Download'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cloud Save?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  Permanently delete <strong>{deleteTarget.saveName}</strong> from
                  the cloud? Your local copy (if any) will not be affected.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? 'Deleting…' : 'Delete from Cloud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
