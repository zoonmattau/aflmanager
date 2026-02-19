import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { PlayerEditorSheet } from '@/components/editor/PlayerEditorSheet'
import { getOverallRating } from '@/engine/player/playerRating'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Lock, Wand2, PlusCircle, Pencil } from 'lucide-react'
import clubsJson from '@/data/clubs.json'
import type { Player } from '@/types/player'

const ALL_CLUBS_ID = '__all__'

interface ClubEntry {
  id: string
  fullName: string
  abbreviation: string
}

const clubs: ClubEntry[] = clubsJson as ClubEntry[]

export function PlayerEditorPage() {
  const phase = useGameStore((s) => s.phase)
  const players = useGameStore((s) => s.players)
  const globalSettings = useAppStore((s) => s.globalSettings)

  const [selectedClubId, setSelectedClubId] = useState<string>(ALL_CLUBS_ID)
  const [searchQuery, setSearchQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Player | null>(null)

  const hasAccess = phase === 'setup' || (globalSettings.commissionerMode ?? false)

  const filteredPlayers = useMemo(() => {
    const allPlayers = Object.values(players)
    const byClub = selectedClubId === ALL_CLUBS_ID
      ? allPlayers
      : allPlayers.filter((p) => p.clubId === selectedClubId)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return byClub
    return byClub.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q),
    )
  }, [players, selectedClubId, searchQuery])

  const openCreate = () => {
    setEditTarget(null)
    setEditorOpen(true)
  }

  const openEdit = (player: Player) => {
    setEditTarget(player)
    setEditorOpen(true)
  }

  const defaultClubId = selectedClubId === ALL_CLUBS_ID
    ? (clubs[0]?.id ?? 'adelaide')
    : selectedClubId

  if (!hasAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Commissioner Mode Required</CardTitle>
            <CardDescription>
              The Player Editor is only available during game setup or when Commissioner Mode is
              enabled in Global Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              To unlock: open the main menu → Settings → enable Commissioner Mode.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Player Editor</h1>
        {phase === 'setup' && (
          <Badge variant="secondary" className="ml-2">Setup Mode</Badge>
        )}
        {(globalSettings.commissionerMode ?? false) && phase !== 'setup' && (
          <Badge variant="outline" className="ml-2 border-amber-500 text-amber-500">Commissioner</Badge>
        )}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedClubId} onValueChange={setSelectedClubId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All Clubs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLUBS_ID}>All Clubs</SelectItem>
            {clubs.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-56"
        />

        <Button onClick={openCreate} className="ml-auto">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Player
        </Button>
      </div>

      {/* Player list */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Club</th>
              <th className="text-center px-3 py-2">Pos</th>
              <th className="text-center px-3 py-2">Age</th>
              <th className="text-center px-3 py-2">OVR</th>
              <th className="text-right px-3 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  No players found.
                </td>
              </tr>
            ) : (
              filteredPlayers.slice(0, 200).map((player) => {
                const club = clubs.find((c) => c.id === player.clubId)
                const ovr = getOverallRating(player)
                return (
                  <tr
                    key={player.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => openEdit(player)}
                  >
                    <td className="px-3 py-2 font-medium">
                      {player.firstName} {player.lastName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {club?.abbreviation ?? player.clubId}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className="text-xs">{player.position.primary}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{player.age}</td>
                    <td className="px-3 py-2 text-center font-semibold">
                      <span className={ovr >= 80 ? 'text-green-500' : ovr >= 65 ? 'text-emerald-400' : ovr >= 50 ? 'text-yellow-500' : 'text-muted-foreground'}>
                        {ovr}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openEdit(player) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        {filteredPlayers.length > 200 && (
          <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
            Showing first 200 of {filteredPlayers.length} players. Refine your search to see more.
          </div>
        )}
      </div>

      <PlayerEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editPlayer={editTarget}
        defaultClubId={defaultClubId}
      />
    </div>
  )
}
