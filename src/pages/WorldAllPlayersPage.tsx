import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import type { Shortlist } from '@/types/game'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bookmark,
  BookmarkCheck,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react'
import { getOverallRating, getPlayerTier } from '@/engine/player/playerRating'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { cn } from '@/lib/utils'
import type { PlayerPreferredRole } from '@/types/player'

const PAGE_SIZE = 50

type SortKey = 'name' | 'club' | 'age' | 'pos' | 'role' | 'overall' | 'potential' | 'contract' | 'salary'
type SortDir = 'asc' | 'desc'
type AgeFilter = 'all' | 'u21' | 'u23' | 'u25' | '26-30' | '30plus'
type TierFilter = 'all' | 'elite' | 'good' | 'average' | 'developing' | 'poor'
type ContractFilter = 'all' | 'expiring' | 'free-agent'
type ListFilter = 'all' | 'senior' | 'reserves'

const ROLE_LABELS: Record<PlayerPreferredRole, string> = {
  'inside-mid': 'Inside Mid',
  'outside-mid': 'Outside Mid',
  'wing-runner': 'Wing Runner',
  'lockdown-defender': 'Lockdown Def',
  'intercept-defender': 'Intercept Def',
  'rebound-defender': 'Rebound Def',
  'pressure-forward': 'Pressure Fwd',
  'key-forward': 'Key Forward',
  'small-forward': 'Small Fwd',
  'ruck': 'Ruck',
  'utility': 'Utility',
}

const AGE_LABEL: Record<AgeFilter, string> = {
  all: 'All ages',
  u21: 'Under 21',
  u23: 'Under 23',
  u25: 'Under 25',
  '26-30': '26–30',
  '30plus': '30+',
}

const POSITIONS = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF'] as const

function formatSalary(aav: number): string {
  if (aav >= 1_000_000) return `$${(aav / 1_000_000).toFixed(1)}M`
  if (aav >= 1_000) return `$${Math.round(aav / 1_000)}K`
  return `$${aav}`
}

// ── Shortlist popover ─────────────────────────────────────────────────────────

interface ShortlistPopoverProps {
  playerId: string
  shortlists: Shortlist[]
  onAdd: (shortlistId: string, playerId: string) => void
  onCreateAndAdd: (name: string, playerId: string) => void
}

function ShortlistPopover({ playerId, shortlists, onAdd, onCreateAndAdd }: ShortlistPopoverProps) {
  const [newName, setNewName] = useState('')

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    onCreateAndAdd(name, playerId)
    setNewName('')
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Add to shortlist">
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="end">
        <p className="text-[11px] font-medium text-muted-foreground mb-1.5 px-1">Add to shortlist</p>
        {shortlists.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-1 mb-2">No shortlists yet — create one below.</p>
        )}
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {shortlists.map((list) => {
            const inList = list.entries.some((e: { targetType: string; targetId: string }) => e.targetType === 'player' && e.targetId === playerId)
            return (
              <button
                key={list.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors',
                  inList ? 'text-primary cursor-default' : 'text-foreground',
                )}
                onClick={() => !inList && onAdd(list.id, playerId)}
                disabled={inList}
              >
                {inList
                  ? <Check className="h-3 w-3 shrink-0" />
                  : <div className="h-3 w-3 shrink-0" />
                }
                <span className="truncate">{list.name}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-2 border-t pt-2 flex gap-1">
          <Input
            placeholder="New list name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button
            size="sm"
            className="h-7 text-xs px-2 shrink-0"
            onClick={handleCreate}
            disabled={!newName.trim()}
          >
            Create
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WorldAllPlayersPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const shortlists = useGameStore((s) => s.shortlists)
  const signingWatchlistPlayerIds = useGameStore((s) => s.signingWatchlistPlayerIds)
  const addSigningWatchlistPlayer = useGameStore((s) => s.addSigningWatchlistPlayer)
  const removeSigningWatchlistPlayer = useGameStore((s) => s.removeSigningWatchlistPlayer)
  const addShortlistEntry = useGameStore((s) => s.addShortlistEntry)
  const createShortlist = useGameStore((s) => s.createShortlist)

  // ── Filters ─────────────────────────────────────
  const [search, setSearch] = useState('')
  const [clubFilter, setClubFilter] = useState('all')
  const [posFilter, setPosFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [contractFilter, setContractFilter] = useState<ContractFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')

  // ── Sort ────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // ── Pagination ──────────────────────────────────
  const [page, setPage] = useState(1)

  // ── Derived data ────────────────────────────────
  const sortedClubs = useMemo(
    () => Object.values(clubs).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [clubs],
  )

  const rows = useMemo(() => {
    return Object.values(players).map((player) => {
      const overall = getOverallRating(player)
      const tier = getPlayerTier(overall)
      const club = clubs[player.clubId]
      const isOnWatchlist = signingWatchlistPlayerIds.includes(player.id)
      const potential = Math.round(player.hiddenAttributes.potentialCeiling)
      return { player, overall, tier, club, isOnWatchlist, potential }
    })
  }, [players, clubs, signingWatchlistPlayerIds])

  // ── Filter ──────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(({ player, tier }) => {
      if (q) {
        const fullName = `${player.firstName} ${player.lastName}`.toLowerCase()
        if (!fullName.includes(q)) return false
      }
      if (clubFilter !== 'all' && player.clubId !== clubFilter) return false
      if (posFilter !== 'all' && player.position.primary !== posFilter) return false
      if (roleFilter !== 'all' && player.preferredRole !== roleFilter) return false
      if (ageFilter !== 'all') {
        const age = player.age
        if (ageFilter === 'u21' && age >= 21) return false
        if (ageFilter === 'u23' && age >= 23) return false
        if (ageFilter === 'u25' && age >= 25) return false
        if (ageFilter === '26-30' && (age < 26 || age > 30)) return false
        if (ageFilter === '30plus' && age <= 30) return false
      }
      if (tierFilter !== 'all' && tier !== tierFilter) return false
      if (contractFilter === 'expiring' && player.contract.yearsRemaining > 1) return false
      if (contractFilter === 'free-agent' && player.contract.yearsRemaining > 0) return false
      if (listFilter !== 'all' && player.listStatus !== listFilter) return false
      return true
    })
  }, [rows, search, clubFilter, posFilter, roleFilter, ageFilter, tierFilter, contractFilter, listFilter])

  // ── Sort ────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number
      let vb: string | number
      switch (sortKey) {
        case 'name':     va = `${a.player.lastName}${a.player.firstName}`; vb = `${b.player.lastName}${b.player.firstName}`; break
        case 'club':     va = a.club?.abbreviation ?? ''; vb = b.club?.abbreviation ?? ''; break
        case 'age':      va = a.player.age; vb = b.player.age; break
        case 'pos':      va = a.player.position.primary; vb = b.player.position.primary; break
        case 'role':     va = a.player.preferredRole; vb = b.player.preferredRole; break
        case 'overall':  va = a.overall; vb = b.overall; break
        case 'potential':va = a.potential; vb = b.potential; break
        case 'contract': va = a.player.contract.yearsRemaining; vb = b.player.contract.yearsRemaining; break
        case 'salary':   va = a.player.contract.aav; vb = b.player.contract.aav; break
        default:         va = 0; vb = 0
      }
      if (va === vb) return 0
      const cmp = va > vb ? 1 : -1
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [filtered, sortKey, sortDir])

  // ── Pagination ──────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Handlers ────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }

  function resetFilters() {
    setSearch('')
    setClubFilter('all')
    setPosFilter('all')
    setRoleFilter('all')
    setAgeFilter('all')
    setTierFilter('all')
    setContractFilter('all')
    setListFilter('all')
    setPage(1)
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />
    return sortDir === 'desc'
      ? <ArrowDown className="inline h-3 w-3 ml-1" />
      : <ArrowUp className="inline h-3 w-3 ml-1" />
  }

  function handleAddToShortlist(shortlistId: string, playerId: string) {
    addShortlistEntry({ shortlistId, targetType: 'player', targetId: playerId })
  }

  function handleCreateAndAdd(name: string, playerId: string) {
    const result = createShortlist(name)
    if (result.success && result.shortlistId) {
      addShortlistEntry({ shortlistId: result.shortlistId, targetType: 'player', targetId: playerId })
    }
  }

  const isFiltered =
    search !== '' ||
    clubFilter !== 'all' ||
    posFilter !== 'all' ||
    roleFilter !== 'all' ||
    ageFilter !== 'all' ||
    tierFilter !== 'all' ||
    contractFilter !== 'all' ||
    listFilter !== 'all'

  const headers: { key: SortKey; label: string; title?: string }[] = [
    { key: 'name',      label: 'Player' },
    { key: 'club',      label: 'Club' },
    { key: 'age',       label: 'Age' },
    { key: 'pos',       label: 'Pos' },
    { key: 'role',      label: 'Role' },
    { key: 'overall',   label: 'OVR',  title: 'Overall rating' },
    { key: 'potential', label: 'Pot',  title: 'Potential ceiling' },
    { key: 'contract',  label: 'Yrs',  title: 'Contract years remaining' },
    { key: 'salary',    label: 'AAV',  title: 'Average annual value' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">All Players</h1>
        <p className="text-sm text-muted-foreground">
          Every player in the league. Filter, sort, and add to your watchlist or shortlists.
        </p>
      </div>

      {/* ── Filters ───────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 space-y-2.5">
          {/* Row 1: search + club + position + role */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Select value={clubFilter} onValueChange={(v) => { setClubFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[170px] text-sm">
                <SelectValue placeholder="All clubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clubs</SelectItem>
                {sortedClubs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={posFilter} onValueChange={(v) => { setPosFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue placeholder="All positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All positions</SelectItem>
                {POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[155px] text-sm">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {(Object.entries(ROLE_LABELS) as [PlayerPreferredRole, string][]).map(([r, label]) => (
                  <SelectItem key={r} value={r}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: age + tier + contract + list + count + clear */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={ageFilter} onValueChange={(v) => { setAgeFilter(v as AgeFilter); setPage(1) }}>
              <SelectTrigger className="h-8 w-[115px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(AGE_LABEL) as [AgeFilter, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v as TierFilter); setPage(1) }}>
              <SelectTrigger className="h-8 w-[125px] text-sm">
                <SelectValue placeholder="All tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="elite">Elite</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="average">Average</SelectItem>
                <SelectItem value="developing">Developing</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contractFilter} onValueChange={(v) => { setContractFilter(v as ContractFilter); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] text-sm">
                <SelectValue placeholder="All contracts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contracts</SelectItem>
                <SelectItem value="expiring">Expiring (≤1 yr)</SelectItem>
                <SelectItem value="free-agent">Free agents</SelectItem>
              </SelectContent>
            </Select>
            <Select value={listFilter} onValueChange={(v) => { setListFilter(v as ListFilter); setPage(1) }}>
              <SelectTrigger className="h-8 w-[115px] text-sm">
                <SelectValue placeholder="All lists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lists</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="reserves">Reserves</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {sorted.length.toLocaleString()} player{sorted.length !== 1 ? 's' : ''}
            </span>
            {isFiltered && (
              <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ─────────────────────────────────── */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {pageRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No players match the current filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead
                      key={h.key}
                      title={h.title}
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort(h.key)}
                    >
                      {h.label}
                      <SortIcon col={h.key} />
                    </TableHead>
                  ))}
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map(({ player, overall, potential, club, isOnWatchlist }) => {
                  const isMyClub = player.clubId === playerClubId
                  const contractYrs = player.contract.yearsRemaining
                  return (
                    <TableRow key={player.id} className={cn(isMyClub && 'bg-primary/5')}>
                      {/* Name */}
                      <TableCell>
                        <button
                          className="font-medium text-left hover:underline hover:text-primary leading-tight"
                          onClick={() => navigate(`/player/${player.id}`)}
                        >
                          {player.firstName} {player.lastName}
                        </button>
                      </TableCell>
                      {/* Club */}
                      <TableCell className="whitespace-nowrap">
                        <span className={cn('text-xs', isMyClub && 'font-semibold')}>
                          {club?.abbreviation ?? '—'}
                        </span>
                        {isMyClub && (
                          <Badge className="ml-1.5 h-4 text-[10px] px-1 py-0">You</Badge>
                        )}
                      </TableCell>
                      {/* Age */}
                      <TableCell className="tabular-nums">{player.age}</TableCell>
                      {/* Position */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getPositionBadgeClass(player.position.primary)}
                        >
                          {player.position.primary}
                        </Badge>
                      </TableCell>
                      {/* Role */}
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {ROLE_LABELS[player.preferredRole] ?? player.preferredRole}
                      </TableCell>
                      {/* Overall */}
                      <TableCell>
                        <Badge
                          variant={overall >= 85 ? 'default' : overall >= 70 ? 'secondary' : 'outline'}
                          className={cn(
                            'tabular-nums font-bold',
                            overall >= 85 && 'bg-amber-500 hover:bg-amber-500 text-white border-0',
                          )}
                        >
                          {overall}
                        </Badge>
                      </TableCell>
                      {/* Potential */}
                      <TableCell>
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            potential >= 85
                              ? 'text-green-600 font-semibold'
                              : potential >= 70
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {potential}
                        </span>
                      </TableCell>
                      {/* Contract years */}
                      <TableCell className="tabular-nums text-xs">
                        {contractYrs === 0 ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">FA</Badge>
                        ) : contractYrs === 1 ? (
                          <span className="text-amber-600 font-medium">1y ⚠</span>
                        ) : (
                          <span>{contractYrs}y</span>
                        )}
                      </TableCell>
                      {/* Salary */}
                      <TableCell className="tabular-nums text-xs text-muted-foreground">
                        {formatSalary(player.contract.aav)}
                      </TableCell>
                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                            onClick={() =>
                              isOnWatchlist
                                ? removeSigningWatchlistPlayer(player.id)
                                : addSigningWatchlistPlayer(player.id)
                            }
                          >
                            {isOnWatchlist ? (
                              <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                          <ShortlistPopover
                            playerId={player.id}
                            shortlists={shortlists}
                            onAdd={handleAddToShortlist}
                            onCreateAndAdd={handleCreateAndAdd}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Pagination ────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {currentPage} of {totalPages} · showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* Page number buttons — show up to 5 around current */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | '…')[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === currentPage ? 'default' : 'outline'}
                    size="icon"
                    className="h-7 w-7 text-xs"
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </Button>
                ),
              )}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
