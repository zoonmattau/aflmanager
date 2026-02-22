import { useState } from 'react'
import type { Club } from '@/types/club'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateFictionalLeague } from '@/engine/league/leagueGenerator'
import { cn } from '@/lib/utils'
import { RotateCcw, Plus, Trash2, RefreshCw, LayoutList, Settings2 } from 'lucide-react'

interface FictionalLeagueEditorDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (clubs: Club[], teamCount: number) => void
  initialClubs: Club[]
  initialTeamCount: number
}

type Tab = 'teams' | 'structure'

function colorSwatch(club: Club) {
  return `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})`
}

export function FictionalLeagueEditorDialog({
  open,
  onClose,
  onConfirm,
  initialClubs,
  initialTeamCount,
}: FictionalLeagueEditorDialogProps) {
  const [clubs, setClubs] = useState<Club[]>(() =>
    initialClubs.length > 0 ? initialClubs : generateFictionalLeague(initialTeamCount, Date.now()),
  )
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialClubs[0]?.id ?? clubs[0]?.id ?? null,
  )
  const [tab, setTab] = useState<Tab>('teams')

  const selectedClub = clubs.find((c) => c.id === selectedId) ?? null

  // ── Helpers ──────────────────────────────────────────────────────────────

  function updateClub(id: string, patch: Partial<Club>) {
    setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function handleRegenerateAll() {
    const next = generateFictionalLeague(clubs.length, Date.now())
    setClubs(next)
    setSelectedId(next[0]?.id ?? null)
  }

  function handleRegenerateOne(id: string) {
    const idx = clubs.findIndex((c) => c.id === id)
    if (idx === -1) return
    const fresh = generateFictionalLeague(1, Date.now() + idx * 7919)[0]
    const patched: Club = { ...fresh, id }
    setClubs((prev) => prev.map((c) => (c.id === id ? patched : c)))
  }

  function handleAddTeam() {
    const fresh = generateFictionalLeague(1, Date.now() + clubs.length * 3571)[0]
    const id = `fictional-custom-${Date.now()}`
    const club: Club = { ...fresh, id }
    setClubs((prev) => [...prev, club])
    setSelectedId(id)
  }

  function handleDeleteTeam(id: string) {
    const next = clubs.filter((c) => c.id !== id)
    setClubs(next)
    if (selectedId === id) setSelectedId(next[0]?.id ?? null)
  }

  function handleResizeLeague(count: number) {
    if (count === clubs.length) return
    const next = generateFictionalLeague(count, Date.now())
    setClubs(next)
    setSelectedId(next[0]?.id ?? null)
  }

  function handleConfirm() {
    onConfirm(clubs, clubs.length)
  }

  // ── Tier distribution ─────────────────────────────────────────────────────

  const tierCounts = clubs.reduce(
    (acc, c) => { acc[c.tier ?? 'medium']++; return acc },
    { large: 0, medium: 0, small: 0 } as Record<string, number>,
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[88vh] max-w-4xl flex-col gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0">

        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-zinc-800 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base text-white">Fictional League Setup</DialogTitle>
              <p className="text-xs text-zinc-500">{clubs.length} team{clubs.length !== 1 ? 's' : ''} · edit names, colours and structure before starting</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={handleRegenerateAll}
            >
              <RotateCcw className="mr-1.5 h-3 w-3" />
              Regenerate All
            </Button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1">
            {([
              { id: 'teams' as Tab, label: 'Teams', icon: LayoutList },
              { id: 'structure' as Tab, label: 'League Structure', icon: Settings2 },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === id
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* ── TEAMS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'teams' && (
          <div className="flex min-h-0 flex-1 overflow-hidden">

            {/* Team list */}
            <div className="flex w-56 shrink-0 flex-col border-r border-zinc-800">
              <div className="flex-1 overflow-y-auto">
                {clubs.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => setSelectedId(club.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                      selectedId === club.id
                        ? 'bg-zinc-800'
                        : 'hover:bg-zinc-900',
                    )}
                  >
                    <div
                      className="h-5 w-5 shrink-0 rounded-full shadow-sm"
                      style={{ background: colorSwatch(club) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">{club.name}</p>
                      <p className="text-[10px] text-zinc-500">{club.abbreviation} · {club.homeGround.split(' ').slice(-1)[0]}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="shrink-0 border-t border-zinc-800 p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={handleAddTeam}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Team
                </Button>
              </div>
            </div>

            {/* Team editor */}
            {selectedClub ? (
              <div className="flex-1 overflow-y-auto p-5">
                {/* Editor header */}
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full shadow-md"
                      style={{ background: colorSwatch(selectedClub) }}
                    />
                    <div>
                      <p className="font-semibold text-white">{selectedClub.fullName}</p>
                      <p className="text-xs text-zinc-500">{selectedClub.homeGround}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-zinc-500 hover:text-zinc-300"
                      onClick={() => handleRegenerateOne(selectedClub.id)}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Randomise
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-500/70 hover:text-red-400"
                      onClick={() => handleDeleteTeam(selectedClub.id)}
                      disabled={clubs.length <= 2}
                    >
                      <Trash2 className="mr-1.5 h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                </div>

                {/* Identity */}
                <section className="mb-5 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Identity</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">City / Name</Label>
                      <Input
                        value={selectedClub.name}
                        onChange={(e) =>
                          updateClub(selectedClub.id, {
                            name: e.target.value,
                            fullName: `${e.target.value} ${selectedClub.mascot}`,
                          })
                        }
                        className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">Mascot</Label>
                      <Input
                        value={selectedClub.mascot}
                        onChange={(e) =>
                          updateClub(selectedClub.id, {
                            mascot: e.target.value,
                            fullName: `${selectedClub.name} ${e.target.value}`,
                          })
                        }
                        className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">Abbreviation</Label>
                      <Input
                        value={selectedClub.abbreviation}
                        maxLength={4}
                        onChange={(e) =>
                          updateClub(selectedClub.id, {
                            abbreviation: e.target.value.toUpperCase().slice(0, 4),
                          })
                        }
                        className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">Established</Label>
                      <Input
                        type="number"
                        value={selectedClub.established ?? 2000}
                        onChange={(e) =>
                          updateClub(selectedClub.id, {
                            established: parseInt(e.target.value, 10) || 2000,
                          })
                        }
                        className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">Home Ground</Label>
                    <Input
                      value={selectedClub.homeGround}
                      onChange={(e) => updateClub(selectedClub.id, { homeGround: e.target.value })}
                      className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"
                    />
                  </div>
                </section>

                {/* Colours */}
                <section className="mb-5 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Colours</p>
                  <div className="flex items-end gap-5">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">Primary</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedClub.colors.primary}
                          onChange={(e) =>
                            updateClub(selectedClub.id, {
                              colors: { ...selectedClub.colors, primary: e.target.value },
                            })
                          }
                          className="h-9 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0.5"
                        />
                        <span className="font-mono text-xs text-zinc-400">{selectedClub.colors.primary}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">Secondary</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedClub.colors.secondary}
                          onChange={(e) =>
                            updateClub(selectedClub.id, {
                              colors: { ...selectedClub.colors, secondary: e.target.value },
                            })
                          }
                          className="h-9 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0.5"
                        />
                        <span className="font-mono text-xs text-zinc-400">{selectedClub.colors.secondary}</span>
                      </div>
                    </div>
                    {/* Live colour preview */}
                    <div
                      className="ml-auto h-14 w-28 rounded-lg shadow-md"
                      style={{ background: colorSwatch(selectedClub) }}
                    />
                  </div>
                </section>

                {/* Club tier & prestige */}
                <section className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Club Profile</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">Market Tier</Label>
                      <Select
                        value={selectedClub.tier ?? 'medium'}
                        onValueChange={(v) =>
                          updateClub(selectedClub.id, { tier: v as 'large' | 'medium' | 'small' })
                        }
                      >
                        <SelectTrigger className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="large">Large market</SelectItem>
                          <SelectItem value="medium">Medium market</SelectItem>
                          <SelectItem value="small">Small market</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-zinc-400">Premierships</Label>
                        <span className="text-xs font-bold text-zinc-300">{selectedClub.premierships ?? 0}</span>
                      </div>
                      <Slider
                        value={[selectedClub.premierships ?? 0]}
                        min={0}
                        max={20}
                        step={1}
                        onValueChange={([v]) => updateClub(selectedClub.id, { premierships: v })}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
                Select a team to edit
              </div>
            )}
          </div>
        )}

        {/* ── STRUCTURE TAB ─────────────────────────────────────────────────── */}
        {tab === 'structure' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Team count */}
            <section className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Team Count</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-300">Number of Teams</p>
                  <span className="text-lg font-bold tabular-nums text-white">{clubs.length}</span>
                </div>
                <Slider
                  value={[clubs.length]}
                  onValueChange={([v]) => handleResizeLeague(v % 2 === 0 ? v : v - 1)}
                  min={4}
                  max={32}
                  step={2}
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>4</span><span>16 (standard)</span><span>32</span>
                </div>
                <p className="text-xs text-amber-400/80">
                  Changing the count will regenerate all clubs.
                </p>
              </div>
            </section>

            {/* Tier distribution */}
            <section className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Market Tier Distribution</p>
              <div className="grid grid-cols-3 gap-3">
                {(['large', 'medium', 'small'] as const).map((tier) => (
                  <div key={tier} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
                    <p className="text-2xl font-bold text-white">{tierCounts[tier]}</p>
                    <p className="mt-0.5 text-xs capitalize text-zinc-500">{tier} market</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500">Edit individual team tiers from the Teams tab.</p>
            </section>

            {/* All teams overview */}
            <section className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">All Clubs</p>
              <div className="grid grid-cols-2 gap-2">
                {clubs.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => { setTab('teams'); setSelectedId(club.id) }}
                    className="flex items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors"
                  >
                    <div
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ background: colorSwatch(club) }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-200">{club.fullName}</p>
                      <p className="text-[10px] text-zinc-500">{club.homeGround}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-5 py-3.5">
          <div className="flex w-full items-center justify-between">
            <p className="text-xs text-zinc-500">
              {clubs.length} team{clubs.length !== 1 ? 's' : ''} ·{' '}
              {tierCounts.large}L / {tierCounts.medium}M / {tierCounts.small}S
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-500"
                disabled={clubs.length === 0}
                onClick={handleConfirm}
              >
                Confirm {clubs.length} Teams
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
