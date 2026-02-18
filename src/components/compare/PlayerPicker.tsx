import { useMemo, useState } from 'react'
import { Search, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { getOverallRating } from '@/engine/player/playerRating'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'

interface PlayerPickerProps {
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
  excludePlayerId: string | null
  players: Record<string, Player>
  clubs: Record<string, Club>
  label: string
}

export function PlayerPicker({ selectedPlayerId, onSelect, excludePlayerId, players, clubs, label }: PlayerPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [clubFilter, setClubFilter] = useState<string>('all')

  const selectedPlayer = selectedPlayerId ? players[selectedPlayerId] : null

  const sortedClubs = useMemo(
    () => Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  )

  const filteredPlayers = useMemo(() => {
    const query = search.toLowerCase().trim()
    return Object.values(players)
      .filter((p) => {
        if (p.id === excludePlayerId) return false
        if (clubFilter !== 'all' && p.clubId !== clubFilter) return false
        if (query) {
          const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
          return fullName.includes(query)
        }
        return true
      })
      .map((p) => ({ player: p, overall: getOverallRating(p) }))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 50)
  }, [players, search, clubFilter, excludePlayerId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2 h-auto py-2">
          {selectedPlayer ? (
            <>
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: clubs[selectedPlayer.clubId]?.colors.primary ?? '#666' }}
              >
                {selectedPlayer.jerseyNumber}
              </div>
              <div className="text-left min-w-0">
                <p className="font-medium truncate">{selectedPlayer.firstName} {selectedPlayer.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {clubs[selectedPlayer.clubId]?.abbreviation} &middot; {selectedPlayer.position.primary}
                </p>
              </div>
            </>
          ) : (
            <>
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{label}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 space-y-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <select
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
          >
            <option value="all">All Clubs</option>
            {sortedClubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <ScrollArea className="h-64">
          {filteredPlayers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No players found.</p>
          ) : (
            <div className="p-1">
              {filteredPlayers.map(({ player: p, overall }) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    onSelect(p.id)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: clubs[p.clubId]?.colors.primary ?? '#666' }}
                  >
                    {p.jerseyNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate text-xs">{p.firstName} {p.lastName}</p>
                    <p className="text-[10px] text-muted-foreground">{clubs[p.clubId]?.abbreviation}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${getPositionBadgeClass(p.position.primary)}`}>
                    {p.position.primary}
                  </Badge>
                  <span className="text-xs font-mono font-bold w-6 text-right shrink-0">{overall}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
