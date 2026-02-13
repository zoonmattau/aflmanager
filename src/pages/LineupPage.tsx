import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wand2, RotateCcw } from 'lucide-react'
import type { Player } from '@/types/player'

const POSITION_SLOTS = [
  { group: 'Back Line', positions: [
    { code: 'BPL', label: 'Back Pocket L' },
    { code: 'FB', label: 'Full Back' },
    { code: 'BPR', label: 'Back Pocket R' },
  ]},
  { group: 'Half-Back Line', positions: [
    { code: 'HBF', label: 'Half-Back L' },
    { code: 'CHB', label: 'Centre Half-Back' },
    { code: 'HBF2', label: 'Half-Back R' },
  ]},
  { group: 'Centre Line', positions: [
    { code: 'W', label: 'Wing L' },
    { code: 'C', label: 'Centre' },
    { code: 'W2', label: 'Wing R' },
  ]},
  { group: 'Half-Forward Line', positions: [
    { code: 'HFF', label: 'Half-Forward L' },
    { code: 'CHF', label: 'Centre Half-Forward' },
    { code: 'HFF2', label: 'Half-Forward R' },
  ]},
  { group: 'Forward Line', positions: [
    { code: 'FP', label: 'Forward Pocket L' },
    { code: 'FF', label: 'Full Forward' },
    { code: 'FP2', label: 'Forward Pocket R' },
  ]},
  { group: 'Followers', positions: [
    { code: 'RK', label: 'Ruck' },
    { code: 'RR', label: 'Ruck Rover' },
    { code: 'ROV', label: 'Rover' },
  ]},
  { group: 'Interchange', positions: [
    { code: 'I1', label: 'Interchange 1' },
    { code: 'I2', label: 'Interchange 2' },
    { code: 'I3', label: 'Interchange 3' },
    { code: 'I4', label: 'Interchange 4' },
  ]},
] as const

/** Maps position slot code to preferred player position groups */
const POSITION_PREFERENCE: Record<string, string[]> = {
  FB: ['FB'], BPL: ['FB', 'HB'], BPR: ['FB', 'HB'],
  HBF: ['HB'], CHB: ['HB', 'FB'], HBF2: ['HB'],
  W: ['WING', 'MID'], C: ['C', 'MID'], W2: ['WING', 'MID'],
  HFF: ['HF'], CHF: ['HF', 'FF'], HFF2: ['HF'],
  FP: ['FF', 'HF'], FF: ['FF'], FP2: ['FF', 'HF'],
  RK: ['FOLL'], RR: ['MID', 'C'], ROV: ['MID', 'C'],
  I1: ['MID', 'HB', 'HF'], I2: ['MID', 'HB', 'HF'],
  I3: ['MID', 'WING', 'HF'], I4: ['MID', 'HB', 'WING'],
}

function getPlayerOverall(p: Player): number {
  const a = p.attributes
  return Math.round(
    (a.kickingEfficiency + a.handballEfficiency + a.markingOverhead +
      a.speed + a.endurance + a.strength + a.tackling +
      a.disposalDecision + a.positioning + a.contested +
      a.workRate + a.pressure) / 12
  )
}

function getPositionFit(player: Player, slotCode: string): number {
  const prefs = POSITION_PREFERENCE[slotCode] ?? []
  const primary = player.position.primary
  const secondary = player.position.secondary

  if (prefs.includes(primary)) return 3
  if (secondary.some((s) => prefs.includes(s))) return 2
  return 1
}

export function LineupPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const setSelectedLineup = useGameStore((s) => s.setSelectedLineup)

  const club = clubs[playerClubId]

  const availablePlayers = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.clubId === playerClubId && !p.injury && p.fitness >= 50)
        .sort((a, b) => getPlayerOverall(b) - getPlayerOverall(a)),
    [players, playerClubId]
  )

  const [lineup, setLineup] = useState<Record<string, string>>(
    selectedLineup ?? {}
  )

  const assignedPlayerIds = new Set(Object.values(lineup))

  const handleAssign = (posCode: string, playerId: string) => {
    setLineup((prev) => {
      const next = { ...prev }
      // Remove player from any other position
      for (const [k, v] of Object.entries(next)) {
        if (v === playerId) delete next[k]
      }
      if (playerId === '__none__') {
        delete next[posCode]
      } else {
        next[posCode] = playerId
      }
      return next
    })
  }

  const handleAutoFill = () => {
    const newLineup: Record<string, string> = {}
    const used = new Set<string>()

    // For each position slot, pick the best fitting available player
    for (const group of POSITION_SLOTS) {
      for (const pos of group.positions) {
        const candidates = availablePlayers
          .filter((p) => !used.has(p.id))
          .sort((a, b) => {
            const fitDiff = getPositionFit(b, pos.code) - getPositionFit(a, pos.code)
            if (fitDiff !== 0) return fitDiff
            return getPlayerOverall(b) - getPlayerOverall(a)
          })

        if (candidates.length > 0) {
          newLineup[pos.code] = candidates[0].id
          used.add(candidates[0].id)
        }
      }
    }

    setLineup(newLineup)
  }

  const handleSave = () => {
    setSelectedLineup(lineup)
  }

  const handleClear = () => {
    setLineup({})
  }

  const filledCount = Object.keys(lineup).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{club?.name} - Lineup Selection</h1>
          <p className="text-sm text-muted-foreground">
            {filledCount}/22 positions filled
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleClear}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Clear
          </Button>
          <Button variant="secondary" size="sm" onClick={handleAutoFill}>
            <Wand2 className="mr-1 h-4 w-4" />
            Auto Fill
          </Button>
          <Button size="sm" onClick={handleSave} disabled={filledCount < 22}>
            Save Lineup
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Position groups */}
        <div className="space-y-4">
          {POSITION_SLOTS.map((group) => (
            <Card key={group.group}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{group.group}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.positions.map((pos) => {
                  const assignedId = lineup[pos.code]
                  const assignedPlayer = assignedId ? players[assignedId] : null

                  return (
                    <div
                      key={pos.code}
                      className="flex items-center gap-3"
                    >
                      <Badge
                        variant="outline"
                        className="w-10 justify-center text-xs"
                      >
                        {pos.code}
                      </Badge>
                      <Select
                        value={assignedId ?? '__none__'}
                        onValueChange={(v) => handleAssign(pos.code, v)}
                      >
                        <SelectTrigger className="flex-1 h-8 text-sm">
                          <SelectValue>
                            {assignedPlayer
                              ? `${assignedPlayer.firstName.charAt(0)}. ${assignedPlayer.lastName} (${assignedPlayer.position.primary}, ${getPlayerOverall(assignedPlayer)})`
                              : 'Select player...'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground">None</span>
                          </SelectItem>
                          {availablePlayers
                            .filter((p) => !assignedPlayerIds.has(p.id) || p.id === assignedId)
                            .sort((a, b) => getPositionFit(b, pos.code) - getPositionFit(a, pos.code) || getPlayerOverall(b) - getPlayerOverall(a))
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className={getPositionFit(p, pos.code) >= 3 ? 'text-green-500' : getPositionFit(p, pos.code) >= 2 ? 'text-yellow-500' : ''}>
                                  {p.firstName.charAt(0)}. {p.lastName}
                                </span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {p.position.primary} | OVR {getPlayerOverall(p)} | Fit {p.fitness}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Available players panel */}
        <div>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Available Players ({availablePlayers.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-200px)] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Player</th>
                      <th className="px-2 py-1.5 text-center font-medium">Pos</th>
                      <th className="px-2 py-1.5 text-center font-medium">OVR</th>
                      <th className="px-2 py-1.5 text-center font-medium">Fit</th>
                      <th className="px-2 py-1.5 text-center font-medium">Form</th>
                      <th className="px-2 py-1.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availablePlayers.map((p) => {
                      const isSelected = assignedPlayerIds.has(p.id)
                      return (
                        <tr
                          key={p.id}
                          className={`border-t ${isSelected ? 'bg-accent/50 text-muted-foreground' : ''}`}
                        >
                          <td className="px-3 py-1">
                            {p.firstName.charAt(0)}. {p.lastName}
                          </td>
                          <td className="px-2 py-1 text-center">
                            <Badge variant="outline" className="text-xs">{p.position.primary}</Badge>
                          </td>
                          <td className="px-2 py-1 text-center">{getPlayerOverall(p)}</td>
                          <td className="px-2 py-1 text-center">{p.fitness}</td>
                          <td className="px-2 py-1 text-center">{p.form}</td>
                          <td className="px-2 py-1 text-center">
                            {isSelected ? (
                              <Badge variant="secondary" className="text-xs">In</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Avail</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
