import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { ShortlistPriority, ShortlistTargetType } from '@/types/game'
import type { Player } from '@/types/player'
import type { DraftProspect } from '@/types/draft'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ListPlus, Star, Trash2 } from 'lucide-react'

const PRIORITY_ORDER: Record<ShortlistPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function formatEntryName(
  targetType: ShortlistTargetType,
  targetId: string,
  players: Record<string, Player>,
  prospects: DraftProspect[],
): string {
  if (targetType === 'player') {
    const p = players[targetId]
    return p ? `${p.firstName} ${p.lastName}` : targetId
  }
  const prospect = prospects.find((p) => p.id === targetId)
  return prospect ? `${prospect.firstName} ${prospect.lastName}` : targetId
}

export function ShortlistAssignMenu({
  targetType,
  targetId,
  buttonLabel = 'Shortlist',
  buttonVariant = 'outline',
  buttonSize = 'sm',
}: {
  targetType: ShortlistTargetType
  targetId: string
  buttonLabel?: string
  buttonVariant?: 'outline' | 'ghost' | 'secondary' | 'default'
  buttonSize?: 'sm' | 'default' | 'icon'
}) {
  const shortlists = useGameStore((s) => s.shortlists)
  const createShortlist = useGameStore((s) => s.createShortlist)
  const addShortlistEntry = useGameStore((s) => s.addShortlistEntry)
  const removeShortlistEntry = useGameStore((s) => s.removeShortlistEntry)
  const memberships = useMemo(
    () =>
      new Set(
        shortlists
          .filter((list) => list.entries.some((entry) => entry.targetType === targetType && entry.targetId === targetId))
          .map((list) => list.id),
      ),
    [shortlists, targetId, targetType],
  )

  const toggleMembership = (shortlistId: string, checked: boolean) => {
    if (checked) {
      addShortlistEntry({
        shortlistId,
        targetType,
        targetId,
      })
      return
    }
    removeShortlistEntry({
      shortlistId,
      targetType,
      targetId,
    })
  }

  const handleCreate = () => {
    const name = window.prompt('Name this shortlist:')
    if (!name) return
    const created = createShortlist(name)
    if (!created.success || !created.shortlistId) return
    addShortlistEntry({
      shortlistId: created.shortlistId,
      targetType,
      targetId,
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={buttonSize} variant={buttonVariant} className="gap-1.5">
          <ListPlus className="h-3.5 w-3.5" />
          {buttonLabel}
          {memberships.size > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {memberships.size}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Assign to shortlists</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {shortlists.length === 0 ? (
          <DropdownMenuItem onSelect={handleCreate}>Create shortlist</DropdownMenuItem>
        ) : (
          shortlists
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((list) => (
              <DropdownMenuCheckboxItem
                key={list.id}
                checked={memberships.has(list.id)}
                onCheckedChange={(checked) => toggleMembership(list.id, Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
              >
                {list.name}
              </DropdownMenuCheckboxItem>
            ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCreate}>New shortlist...</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ShortlistManager({
  targetTypeFilter = 'all',
  title = 'Shortlists',
}: {
  targetTypeFilter?: 'all' | ShortlistTargetType
  title?: string
}) {
  const shortlists = useGameStore((s) => s.shortlists)
  const players = useGameStore((s) => s.players)
  const draft = useGameStore((s) => s.draft)
  const createShortlist = useGameStore((s) => s.createShortlist)
  const renameShortlist = useGameStore((s) => s.renameShortlist)
  const deleteShortlist = useGameStore((s) => s.deleteShortlist)
  const removeShortlistEntry = useGameStore((s) => s.removeShortlistEntry)
  const updateShortlistEntry = useGameStore((s) => s.updateShortlistEntry)

  const [activeShortlistId, setActiveShortlistId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | ShortlistPriority>('all')
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'newest'>('priority')

  useEffect(() => {
    if (!shortlists.length) {
      setActiveShortlistId('')
      return
    }
    if (!activeShortlistId || !shortlists.some((list) => list.id === activeShortlistId)) {
      setActiveShortlistId(shortlists[0].id)
    }
  }, [activeShortlistId, shortlists])

  const active = shortlists.find((list) => list.id === activeShortlistId) ?? null
  const prospects = draft?.prospects ?? []

  const rows = useMemo(() => {
    if (!active) return []
    return active.entries
      .filter((entry) => targetTypeFilter === 'all' || entry.targetType === targetTypeFilter)
      .filter((entry) => priorityFilter === 'all' || entry.priority === priorityFilter)
      .map((entry) => {
        const label = formatEntryName(entry.targetType, entry.targetId, players, prospects)
        return { entry, label }
      })
      .filter((row) => {
        if (!query.trim()) return true
        const needle = query.toLowerCase()
        return row.label.toLowerCase().includes(needle) || row.entry.note.toLowerCase().includes(needle)
      })
      .sort((a, b) => {
        if (sortBy === 'priority') return PRIORITY_ORDER[a.entry.priority] - PRIORITY_ORDER[b.entry.priority]
        if (sortBy === 'newest') return b.entry.updatedAt.localeCompare(a.entry.updatedAt)
        return a.label.localeCompare(b.label)
      })
  }, [active, targetTypeFilter, priorityFilter, players, prospects, query, sortBy])

  const handleCreate = () => {
    const name = window.prompt('New shortlist name:')
    if (!name) return
    const created = createShortlist(name)
    if (created.success && created.shortlistId) {
      setActiveShortlistId(created.shortlistId)
    }
  }

  const handleRename = () => {
    if (!active) return
    const name = window.prompt('Rename shortlist:', active.name)
    if (!name) return
    renameShortlist(active.id, name)
  }

  const handleDelete = () => {
    if (!active) return
    const shouldDelete = window.confirm(`Delete shortlist "${active.name}"?`)
    if (!shouldDelete) return
    deleteShortlist(active.id)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCreate}>New</Button>
            <Button size="sm" variant="outline" onClick={handleRename} disabled={!active}>Rename</Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={!active}>Delete</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={activeShortlistId} onValueChange={setActiveShortlistId}>
            <SelectTrigger>
              <SelectValue placeholder="Select shortlist" />
            </SelectTrigger>
            <SelectContent>
              {shortlists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name} ({list.entries.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter entries..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as 'all' | ShortlistPriority)}>
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'priority' | 'name' | 'newest')}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Sort: Priority</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="newest">Sort: Recently Updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!active ? (
          <p className="text-sm text-muted-foreground">No shortlist selected. Create one to get started.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries match the current filters.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(({ entry, label }) => (
              <div key={`${entry.targetType}-${entry.targetId}`} className="rounded border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{entry.targetType === 'player' ? 'Player' : 'Prospect'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.priority === 'critical' ? 'destructive' : entry.priority === 'high' ? 'default' : 'secondary'}>
                      <Star className="mr-1 h-3 w-3" />
                      {entry.priority}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        removeShortlistEntry({
                          shortlistId: active.id,
                          targetType: entry.targetType,
                          targetId: entry.targetId,
                        })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr,180px]">
                  <Input
                    value={entry.note}
                    placeholder="Note..."
                    onChange={(event) => {
                      updateShortlistEntry({
                        shortlistId: active.id,
                        targetType: entry.targetType,
                        targetId: entry.targetId,
                        note: event.target.value,
                      })
                    }}
                  />
                  <Select
                    value={entry.priority}
                    onValueChange={(value) => {
                      updateShortlistEntry({
                        shortlistId: active.id,
                        targetType: entry.targetType,
                        targetId: entry.targetId,
                        priority: value as ShortlistPriority,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
