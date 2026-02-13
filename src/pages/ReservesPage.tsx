import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUp, ArrowDown } from 'lucide-react'

export function ReservesPage() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const sendToReserves = useGameStore((s) => s.sendToReserves)
  const recallFromReserves = useGameStore((s) => s.recallFromReserves)
  const navigate = useNavigate()

  const club = clubs[playerClubId]

  const { seniorPlayers, reservePlayers } = useMemo(() => {
    const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
    return {
      seniorPlayers: clubPlayers.filter((p) => p.listStatus !== 'reserves'),
      reservePlayers: clubPlayers.filter((p) => p.listStatus === 'reserves'),
    }
  }, [players, playerClubId])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{club?.fullName} - Reserves</h1>
        <p className="text-sm text-muted-foreground">
          Manage your reserves list. Send players down or recall them to the senior squad.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Senior List</p>
            <p className="text-2xl font-bold tabular-nums">{seniorPlayers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">Reserves List</p>
            <p className="text-2xl font-bold tabular-nums">{reservePlayers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reserves List */}
      <Card>
        <CardHeader>
          <CardTitle>Reserves Squad</CardTitle>
          <CardDescription>
            Players currently in the reserves. Recall them when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Pos</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead className="text-center">Fit</TableHead>
                <TableHead className="text-center">Form</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservePlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No players in reserves. Send players down from the Senior List below.
                  </TableCell>
                </TableRow>
              ) : (
                reservePlayers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{p.jerseyNumber}</TableCell>
                    <TableCell>
                      <button
                        className="font-medium hover:underline hover:text-primary cursor-pointer text-left"
                        onClick={() => navigate(`/player/${p.id}`)}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.position.primary}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{p.age}</TableCell>
                    <TableCell className="text-center">{p.fitness}</TableCell>
                    <TableCell className="text-center">{p.form}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => recallFromReserves(p.id)}
                      >
                        <ArrowUp className="h-3 w-3 mr-1" />
                        Recall
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Senior List */}
      <Card>
        <CardHeader>
          <CardTitle>Senior Squad</CardTitle>
          <CardDescription>
            Send players to reserves for development or rotation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Pos</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead className="text-center">Fit</TableHead>
                <TableHead className="text-center">Form</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seniorPlayers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.jerseyNumber}</TableCell>
                  <TableCell>
                    <button
                      className="font-medium hover:underline hover:text-primary cursor-pointer text-left"
                      onClick={() => navigate(`/player/${p.id}`)}
                    >
                      {p.firstName} {p.lastName}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.position.primary}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{p.age}</TableCell>
                  <TableCell className="text-center">{p.fitness}</TableCell>
                  <TableCell className="text-center">{p.form}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => sendToReserves(p.id)}
                    >
                      <ArrowDown className="h-3 w-3 mr-1" />
                      Send Down
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
