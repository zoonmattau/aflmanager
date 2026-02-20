import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart2 } from 'lucide-react'
import type { Player } from '@/types/player'

type StatCategory =
  | 'goals'
  | 'disposals'
  | 'marks'
  | 'tackles'
  | 'clearances'
  | 'hitouts'
  | 'contestedPossessions'

interface StatDef {
  key: StatCategory
  label: string
  unit?: string
}

const STAT_DEFS: StatDef[] = [
  { key: 'goals', label: 'Goals' },
  { key: 'disposals', label: 'Disposals' },
  { key: 'marks', label: 'Marks' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'hitouts', label: 'Hit-Outs' },
  { key: 'contestedPossessions', label: 'Contested Poss.' },
]

function getStatValue(player: Player, key: StatCategory): number {
  return player.seasonStats[key] ?? 0
}

function getAvg(player: Player, key: StatCategory): string {
  const gp = player.seasonStats.gamesPlayed
  if (gp === 0) return '—'
  return (getStatValue(player, key) / gp).toFixed(1)
}

export function WorldStatsPage() {
  const navigate = useNavigate()
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)

  const [activeTab, setActiveTab] = useState<StatCategory>('goals')
  const [filterClubId, setFilterClubId] = useState<string>('all')

  const sortedClubs = useMemo(
    () => Object.values(clubs).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [clubs],
  )

  const leaders = useMemo(() => {
    let list = Object.values(players).filter((p) => p.seasonStats.gamesPlayed > 0)
    if (filterClubId !== 'all') list = list.filter((p) => p.clubId === filterClubId)
    return list
      .sort((a, b) => getStatValue(b, activeTab) - getStatValue(a, activeTab))
      .slice(0, 20)
  }, [players, activeTab, filterClubId])

  const maxVal = leaders[0] ? getStatValue(leaders[0], activeTab) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6" />
            Stats Leaders
          </h1>
          <p className="text-sm text-muted-foreground">Season totals, top 20 per category</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/world')}>
          ← World Hub
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {STAT_DEFS.map((def) => (
          <Button
            key={def.key}
            variant={activeTab === def.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(def.key)}
          >
            {def.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Select value={filterClubId} onValueChange={setFilterClubId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by club" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clubs</SelectItem>
            {sortedClubs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterClubId !== 'all' && (
          <Button variant="ghost" size="sm" onClick={() => setFilterClubId('all')}>
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            {STAT_DEFS.find((d) => d.key === activeTab)?.label} Leaders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leaders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No stats available yet.
            </div>
          ) : (
            <div className="divide-y">
              {leaders.map((p, i) => {
                const club = clubs[p.clubId]
                const val = getStatValue(p, activeTab)
                const avg = getAvg(p, activeTab)
                const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
                const isUser = p.clubId === playerClubId

                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors ${isUser ? 'bg-primary/5' : ''}`}
                    onClick={() => navigate(`/player/${p.id}`)}
                  >
                    <span className="w-6 text-right text-xs text-muted-foreground tabular-nums shrink-0">
                      {i + 1}
                    </span>
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium truncate text-sm">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {club?.abbreviation}
                        </span>
                      </div>
                      {/* Bar */}
                      <div className="mt-0.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold tabular-nums text-sm">{val}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{avg}/g</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
