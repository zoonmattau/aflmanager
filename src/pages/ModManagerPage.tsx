import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useGameStore } from '@/stores/gameStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Package,
  Upload,
  Download,
  Trash2,
  AlertCircle,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModPackage, StoredMod, ModType, ClubMod, RosterMod, DraftClassMod, SettingsMod } from '@/types/mod'
import { getAllMods, saveMod, deleteMod, setModActive } from '@/lib/modStorage'
import { GAME_VERSION } from '@/engine/core/gameVersion'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function makeMeta(name: string, modVersion = '1.0') {
  return {
    name,
    description: `Exported from AFL Manager ${GAME_VERSION}`,
    createdAt: new Date().toISOString(),
    modVersion,
    gameVersionTarget: GAME_VERSION,
  }
}

const MOD_TYPE_LABELS: Record<ModType, string> = {
  'club': 'Club',
  'roster': 'Roster',
  'draft-class': 'Draft Class',
  'settings': 'Settings',
}

const MOD_TYPE_COLORS: Record<ModType, string> = {
  'club': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'roster': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'draft-class': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'settings': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

function validateModJson(parsed: unknown): ModPackage | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  const { type, id, name, modVersion, createdAt } = obj
  if (typeof type !== 'string') return null
  if (typeof id !== 'string' || !id) return null
  if (typeof name !== 'string' || !name) return null
  if (typeof modVersion !== 'string' || !modVersion) return null
  if (typeof createdAt !== 'string' || !createdAt) return null

  if (type === 'club') {
    if (!Array.isArray(obj['clubs']) || obj['clubs'].length === 0) return null
  } else if (type === 'roster') {
    if (typeof obj['clubId'] !== 'string' || !obj['clubId']) return null
    if (!Array.isArray(obj['players'])) return null
  } else if (type === 'draft-class') {
    if (!Array.isArray(obj['prospects'])) return null
  } else if (type === 'settings') {
    if (!obj['settings'] || typeof obj['settings'] !== 'object') return null
  } else {
    return null
  }

  return parsed as ModPackage
}

// ---------------------------------------------------------------------------
// Installed Mods Tab
// ---------------------------------------------------------------------------

interface InstalledModsTabProps {
  mods: StoredMod[]
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}

function InstalledModsTab({ mods, onToggle, onDelete }: InstalledModsTabProps) {
  const activeCount = mods.filter((m) => m.active).length

  if (mods.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Package className="mb-3 h-12 w-12 opacity-30" />
        <p className="text-base font-medium">No mods installed</p>
        <p className="mt-1 text-sm">Use the Import tab to install mod files.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            {activeCount} mod{activeCount !== 1 ? 's' : ''} active — will apply on next new game
          </span>
        </div>
      )}

      <div className="space-y-3">
        {mods.map((stored) => {
          const mod = stored.data
          return (
            <Card key={mod.id} className={cn('transition-colors', stored.active && 'border-primary/40 bg-primary/5')}>
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold truncate">{mod.name}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-xs shrink-0', MOD_TYPE_COLORS[mod.type])}
                    >
                      {MOD_TYPE_LABELS[mod.type]}
                    </Badge>
                  </div>
                  {mod.description && (
                    <p className="text-sm text-muted-foreground truncate">{mod.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    {mod.author && <span>by {mod.author}</span>}
                    <span>v{mod.modVersion}</span>
                    {mod.gameVersionTarget && <span>target: {mod.gameVersionTarget}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={stored.active}
                    onCheckedChange={(checked) => onToggle(mod.id, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onDelete(mod.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import Tab
// ---------------------------------------------------------------------------

interface ImportTabProps {
  onInstall: (mod: ModPackage) => void
}

function ImportTab({ onInstall }: ImportTabProps) {
  const [preview, setPreview] = useState<ModPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setPreview(null)
    setSuccess(false)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        const validated = validateModJson(parsed)
        if (!validated) {
          setError('Invalid mod file. Missing required fields or unknown mod type.')
          return
        }
        setPreview(validated)
      } catch {
        setError('Could not parse JSON. Make sure the file is a valid mod file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleInstall = () => {
    if (!preview) return
    onInstall(preview)
    setPreview(null)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Mod File</CardTitle>
          <CardDescription>Select a .json mod file to install.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-10 cursor-pointer hover:border-muted-foreground/40 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Click to select a mod .json file</p>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              <Info className="h-4 w-4 shrink-0" />
              <span>Mod installed successfully!</span>
            </div>
          )}

          {preview && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{preview.name}</span>
                  <Badge variant="outline" className={cn('text-xs', MOD_TYPE_COLORS[preview.type])}>
                    {MOD_TYPE_LABELS[preview.type]}
                  </Badge>
                </div>
                {preview.description && (
                  <p className="text-sm text-muted-foreground">{preview.description}</p>
                )}
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {preview.author && <span>by {preview.author}</span>}
                  <span>mod v{preview.modVersion}</span>
                  {preview.gameVersionTarget && <span>for game {preview.gameVersionTarget}</span>}
                </div>
                <Button onClick={handleInstall} className="w-full mt-2">
                  Install Mod
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export Tab
// ---------------------------------------------------------------------------

function ExportTab() {
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const draft = useGameStore((s) => s.draft)
  const settings = useGameStore((s) => s.settings)
  const hasGame = Object.keys(clubs).length > 0

  const [selectedExportClubId, setSelectedExportClubId] = useState<string>('')
  const [selectedRosterClubId, setSelectedRosterClubId] = useState<string>('')

  const clubList = Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name))

  if (!hasGame) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Info className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-base font-medium">No game loaded</p>
        <p className="mt-1 text-sm">Load or resume a game first to export data as mods.</p>
      </div>
    )
  }

  const handleExportClub = () => {
    if (!selectedExportClubId) return
    const club = clubs[selectedExportClubId]
    if (!club) return
    const mod: ClubMod = {
      id: `club-${club.id}-${Date.now()}`,
      type: 'club',
      ...makeMeta(`${club.name} Club Mod`),
      clubs: [{
        id: club.id,
        name: club.name,
        fullName: club.fullName,
        abbreviation: club.abbreviation,
        mascot: club.mascot,
        homeGround: club.homeGround,
        colors: club.colors,
        logoUrl: club.logoUrl,
        guernseyStyle: club.guernseyStyle,
        facilities: club.facilities,
        aiPersonality: club.aiPersonality,
        gameplan: club.gameplan,
        tacticalIdentity: club.tacticalIdentity,
      }],
    }
    downloadJson(`club-${club.id}.mod.json`, mod)
  }

  const handleExportRoster = () => {
    if (!selectedRosterClubId) return
    const club = clubs[selectedRosterClubId]
    if (!club) return
    const clubPlayers = Object.values(players).filter((p) => p.clubId === selectedRosterClubId)
    const mod: RosterMod = {
      id: `roster-${selectedRosterClubId}-${Date.now()}`,
      type: 'roster',
      ...makeMeta(`${club.name} Roster Mod`),
      clubId: selectedRosterClubId,
      players: clubPlayers,
    }
    downloadJson(`roster-${selectedRosterClubId}.mod.json`, mod)
  }

  const handleExportDraftClass = () => {
    if (!draft) return
    const mod: DraftClassMod = {
      id: `draft-class-${draft.year}-${Date.now()}`,
      type: 'draft-class',
      ...makeMeta(`${draft.year} Draft Class Mod`),
      targetYear: draft.year,
      prospects: draft.prospects,
    }
    downloadJson(`draft-class-${draft.year}.mod.json`, mod)
  }

  const handleExportSettings = () => {
    const mod: SettingsMod = {
      id: `settings-${Date.now()}`,
      type: 'settings',
      ...makeMeta('Settings Mod'),
      settings,
    }
    downloadJson('settings.mod.json', mod)
  }

  return (
    <div className="space-y-4">
      {/* Export Club */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Club</CardTitle>
          <CardDescription>Export a club's identity, colors, facilities, and gameplan.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Select value={selectedExportClubId} onValueChange={setSelectedExportClubId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select club..." />
            </SelectTrigger>
            <SelectContent>
              {clubList.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportClub} disabled={!selectedExportClubId} variant="outline" className="gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </CardContent>
      </Card>

      {/* Export Roster */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Roster</CardTitle>
          <CardDescription>Export all players listed at a club.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Select value={selectedRosterClubId} onValueChange={setSelectedRosterClubId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select club..." />
            </SelectTrigger>
            <SelectContent>
              {clubList.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportRoster} disabled={!selectedRosterClubId} variant="outline" className="gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </CardContent>
      </Card>

      {/* Export Draft Class */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Draft Class</CardTitle>
          <CardDescription>Export the current season's draft prospect pool.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportDraftClass} disabled={!draft} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            {draft
              ? `Export ${draft.year} Draft Class (${draft.prospects.length} prospects)`
              : 'No draft data available'}
          </Button>
        </CardContent>
      </Card>

      {/* Export Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Settings</CardTitle>
          <CardDescription>Export the current game settings as a reusable preset.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportSettings} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ModManagerPage
// ---------------------------------------------------------------------------

export function ModManagerPage() {
  const setScreen = useAppStore((s) => s.setScreen)
  const currentScreen = useAppStore((s) => s.currentScreen)
  const [mods, setMods] = useState<StoredMod[]>([])

  const fromHomeScreen = currentScreen === 'mod-manager'

  const refreshMods = async () => {
    const loaded = await getAllMods()
    setMods(loaded)
  }

  useEffect(() => {
    void refreshMods()
  }, [])

  const handleToggle = async (id: string, active: boolean) => {
    await setModActive(id, active)
    await refreshMods()
  }

  const handleDelete = async (id: string) => {
    await deleteMod(id)
    await refreshMods()
  }

  const handleInstall = async (mod: ModPackage) => {
    await saveMod(mod)
    await refreshMods()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-4">
          {fromHomeScreen && (
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setScreen('home')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Mod Manager</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-auto hidden sm:block">
            Active mods apply when starting a new game
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Tabs defaultValue="installed">
          <TabsList className="mb-6 w-full">
            <TabsTrigger value="installed" className="flex-1">
              Installed
              {mods.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {mods.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">Import</TabsTrigger>
            <TabsTrigger value="export" className="flex-1">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="installed">
            <InstalledModsTab
              mods={mods}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          </TabsContent>

          <TabsContent value="import">
            <ImportTab onInstall={handleInstall} />
          </TabsContent>

          <TabsContent value="export">
            <ExportTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
