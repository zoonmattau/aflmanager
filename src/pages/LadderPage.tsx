import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function LadderPage() {
  const ladder = useGameStore((s) => s.ladder)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{currentYear} AFL Ladder</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Club</TableHead>
                <TableHead className="text-center">P</TableHead>
                <TableHead className="text-center">W</TableHead>
                <TableHead className="text-center">L</TableHead>
                <TableHead className="text-center">D</TableHead>
                <TableHead className="text-center">Pts</TableHead>
                <TableHead className="text-right">For</TableHead>
                <TableHead className="text-right">Agst</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ladder.map((entry, i) => {
                const club = clubs[entry.clubId]
                const isPlayer = entry.clubId === playerClubId
                return (
                  <TableRow
                    key={entry.clubId}
                    className={`${isPlayer ? 'bg-accent font-semibold' : ''} ${
                      i === 7 ? 'border-b-2 border-dashed border-muted-foreground/30' : ''
                    }`}
                  >
                    <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: club?.colors.primary }}
                        />
                        <span>{club?.name}</span>
                        {isPlayer && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{entry.played}</TableCell>
                    <TableCell className="text-center">{entry.wins}</TableCell>
                    <TableCell className="text-center">{entry.losses}</TableCell>
                    <TableCell className="text-center">{entry.draws}</TableCell>
                    <TableCell className="text-center font-bold">{entry.points}</TableCell>
                    <TableCell className="text-right">{entry.pointsFor}</TableCell>
                    <TableCell className="text-right">{entry.pointsAgainst}</TableCell>
                    <TableCell className="text-right">{entry.percentage.toFixed(1)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
