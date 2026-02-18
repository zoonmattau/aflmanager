import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import {
  MAX_JUMPER_NUMBER,
  MIN_JUMPER_NUMBER,
  isValidJumperNumber,
} from '@/engine/player/jumperNumbers'
import { getPlayerStarRating } from '@/engine/player/playerRating'
import type { Player } from '@/types/player'

type JumperMatrixState = Record<number, string | null>

function buildInitialMatrix(clubPlayers: Player[]): JumperMatrixState {
  const matrix: JumperMatrixState = {}
  for (let n = MIN_JUMPER_NUMBER; n <= MAX_JUMPER_NUMBER; n++) matrix[n] = null

  const used = new Set<number>()
  const pending: Player[] = []
  for (const player of clubPlayers) {
    const current = player.jerseyNumber
    if (isValidJumperNumber(current) && !used.has(current)) {
      matrix[current] = player.id
      used.add(current)
    } else {
      pending.push(player)
    }
  }

  let cursor = MIN_JUMPER_NUMBER
  for (const player of pending) {
    while (cursor <= MAX_JUMPER_NUMBER && matrix[cursor] !== null) cursor++
    if (cursor > MAX_JUMPER_NUMBER) break
    matrix[cursor] = player.id
  }

  return matrix
}

function invertMatrix(matrix: JumperMatrixState): Record<string, number> {
  const byPlayerId: Record<string, number> = {}
  for (const [rawNum, playerId] of Object.entries(matrix)) {
    if (!playerId) continue
    const number = Number(rawNum)
    byPlayerId[playerId] = number
  }
  return byPlayerId
}

export function JumperManagementPage() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const currentYear = useGameStore((s) => s.currentYear)
  const jumperManagement = useGameStore((s) => s.jumperManagement)
  const applyUserClubJumperNumbers = useGameStore((s) => s.applyUserClubJumperNumbers)
  const autoAssignUserClubJumperNumbers = useGameStore((s) => s.autoAssignUserClubJumperNumbers)
  const completeJumperManagement = useGameStore((s) => s.completeJumperManagement)

  const [matrixDraft, setMatrixDraft] = useState<JumperMatrixState>({})
  const [dragFromNumber, setDragFromNumber] = useState<number | null>(null)
  const [cellFilter, setCellFilter] = useState<'all' | 'occupied' | 'blank'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const club = clubs[playerClubId]
  const clubPlayers = useMemo(
    () =>
      Object.values(players)
        .filter((player) => player.clubId === playerClubId)
        .sort((a, b) => {
          if (a.jerseyNumber !== b.jerseyNumber) return a.jerseyNumber - b.jerseyNumber
          const surname = a.lastName.localeCompare(b.lastName)
          if (surname !== 0) return surname
          return a.firstName.localeCompare(b.firstName)
        }),
    [players, playerClubId],
  )

  const currentNumberById = useMemo(() => {
    const next: Record<string, number> = {}
    for (const player of clubPlayers) {
      next[player.id] = player.jerseyNumber
    }
    return next
  }, [clubPlayers])

  useEffect(() => {
    setMatrixDraft(buildInitialMatrix(clubPlayers))
  }, [clubPlayers])

  const changedUpdates = useMemo(() => {
    const draftById = invertMatrix(matrixDraft)
    const updates: Record<string, number> = {}
    for (const player of clubPlayers) {
      const draftNumber = draftById[player.id]
      if (typeof draftNumber === 'number' && draftNumber !== player.jerseyNumber) {
        updates[player.id] = draftNumber
      }
    }
    return updates
  }, [clubPlayers, matrixDraft])

  const pendingChangeCount = Object.keys(changedUpdates).length

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  function applyDraftChanges(): boolean {
    if (pendingChangeCount === 0) {
      setSuccess('No jumper changes to apply.')
      setError(null)
      return true
    }
    const result = applyUserClubJumperNumbers(changedUpdates)
    if (!result.success) {
      setSuccess(null)
      setError(result.error ?? 'Failed to apply jumper changes.')
      return false
    }
    setError(null)
    setSuccess(`Applied ${pendingChangeCount} jumper number change${pendingChangeCount === 1 ? '' : 's'}.`)
    return true
  }

  function handleAutoAssign() {
    clearMessages()
    const result = autoAssignUserClubJumperNumbers()
    if (!result.success) {
      setError(result.error ?? 'Failed to auto-assign jumper numbers.')
      return
    }
    setSuccess(
      result.assignedCount > 0
        ? `Auto-assigned ${result.assignedCount} player${result.assignedCount === 1 ? '' : 's'}.`
        : 'All jumper numbers were already valid and unique.',
    )
  }

  function handleComplete() {
    if (!applyDraftChanges()) return
    const result = completeJumperManagement()
    if (!result.success) {
      setSuccess(null)
      setError(result.error ?? 'Unable to complete jumper management.')
      return
    }
    setSuccess(null)
    setError(null)
    navigate('/')
  }

  const playersById = useMemo(() => {
    const next = new Map<string, Player>()
    for (const player of clubPlayers) next.set(player.id, player)
    return next
  }, [clubPlayers])

  const draftedNumberByPlayer = useMemo(() => invertMatrix(matrixDraft), [matrixDraft])
  const validationState = useMemo(() => {
    const invalidPlayers = clubPlayers.filter((player) => !isValidJumperNumber(player.jerseyNumber))
    const byNumber = new Map<number, Player[]>()
    for (const player of clubPlayers) {
      if (!isValidJumperNumber(player.jerseyNumber)) continue
      if (!byNumber.has(player.jerseyNumber)) byNumber.set(player.jerseyNumber, [])
      byNumber.get(player.jerseyNumber)!.push(player)
    }
    const duplicateGroups = Array.from(byNumber.entries())
      .filter(([, members]) => members.length > 1)
      .sort((a, b) => a[0] - b[0])

    const missingFromDraft = clubPlayers.filter((player) => draftedNumberByPlayer[player.id] === undefined)

    return {
      invalidPlayers,
      duplicateGroups,
      missingFromDraft,
    }
  }, [clubPlayers, draftedNumberByPlayer])
  const matrixNumbers = useMemo(
    () => Array.from({ length: MAX_JUMPER_NUMBER - MIN_JUMPER_NUMBER + 1 }, (_, i) => i + MIN_JUMPER_NUMBER),
    [],
  )
  const filteredMatrixNumbers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return matrixNumbers.filter((number) => {
      const playerId = matrixDraft[number] ?? null
      const occupied = !!playerId

      if (cellFilter === 'occupied' && !occupied) return false
      if (cellFilter === 'blank' && occupied) return false

      if (!query) return true
      if (!playerId) return false
      const player = playersById.get(playerId)
      if (!player) return false
      const fullName = `${player.firstName} ${player.lastName}`.toLowerCase()
      return fullName.includes(query) || player.lastName.toLowerCase().includes(query) || player.firstName.toLowerCase().includes(query)
    })
  }, [searchTerm, matrixNumbers, matrixDraft, cellFilter, playersById])
  const hasValidationErrors =
    validationState.invalidPlayers.length > 0 ||
    validationState.duplicateGroups.length > 0 ||
    validationState.missingFromDraft.length > 0

  if (!playerClubId || !club) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Jumper Number Management</h1>
        <p className="text-sm text-muted-foreground">No managed club found.</p>
      </div>
    )
  }

  function swapMatrixNumbers(fromNumber: number, toNumber: number) {
    if (fromNumber === toNumber) return
    setMatrixDraft((prev) => {
      const next = { ...prev }
      const fromPlayer = next[fromNumber] ?? null
      const toPlayer = next[toNumber] ?? null
      next[toNumber] = fromPlayer
      next[fromNumber] = toPlayer
      return next
    })
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Jumper Number Management</h1>
          <p className="text-sm text-muted-foreground">
            {club.name} preseason jumper review for {jumperManagement.seasonYear ?? currentYear}.
          </p>
        </div>
        <Badge variant={jumperManagement.pending ? 'secondary' : 'outline'}>
          {jumperManagement.pending ? 'Required' : 'Complete'}
        </Badge>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/10">
        <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-200">
          Every player at your club must have a unique number between {MIN_JUMPER_NUMBER} and {MAX_JUMPER_NUMBER}. Changes are recorded in player jumper history by season.
        </CardContent>
      </Card>

      {hasValidationErrors && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-red-700 dark:text-red-300">Cannot Continue Yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-red-700 dark:text-red-300">
            {validationState.invalidPlayers.length > 0 && (
              <div>
                <p className="font-semibold">Invalid jumper numbers:</p>
                {validationState.invalidPlayers.map((player) => (
                  <p key={`invalid-${player.id}`}>
                    {player.firstName} {player.lastName} (#{player.jerseyNumber})
                  </p>
                ))}
              </div>
            )}
            {validationState.duplicateGroups.length > 0 && (
              <div>
                <p className="font-semibold">Duplicate jumper numbers:</p>
                {validationState.duplicateGroups.map(([number, members]) => (
                  <p key={`dup-${number}`}>
                    #{number}: {members.map((player) => `${player.firstName} ${player.lastName}`).join(', ')}
                  </p>
                ))}
              </div>
            )}
            {validationState.missingFromDraft.length > 0 && (
              <div>
                <p className="font-semibold">Unassigned in jumper matrix:</p>
                {validationState.missingFromDraft.map((player) => (
                  <p key={`missing-${player.id}`}>
                    {player.firstName} {player.lastName}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Jumper Matrix ({clubPlayers.length} players)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Drag any player tile onto any jumper number cell to swap assignments. Empty cells are available numbers.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={cellFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setCellFilter('all')}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={cellFilter === 'occupied' ? 'default' : 'outline'}
              onClick={() => setCellFilter('occupied')}
            >
              Occupied
            </Button>
            <Button
              size="sm"
              variant={cellFilter === 'blank' ? 'default' : 'outline'}
              onClick={() => setCellFilter('blank')}
            >
              Blank
            </Button>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search player"
              className="h-8 w-[220px]"
            />
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-md border border-border/60 p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
              {filteredMatrixNumbers.map((number) => {
                const playerId = matrixDraft[number] ?? null
                const player = playerId ? playersById.get(playerId) ?? null : null
                const isChanged = player ? draftedNumberByPlayer[player.id] !== currentNumberById[player.id] : false

                return (
                  <div
                    key={number}
                    className={`rounded-md border p-2 transition-colors ${player ? 'bg-card' : 'bg-muted/20'} ${isChanged ? 'border-cyan-500/40' : 'border-border/60'}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={() => {
                      if (dragFromNumber === null) return
                      swapMatrixNumbers(dragFromNumber, number)
                      setDragFromNumber(null)
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">#{number}</span>
                      {isChanged && (
                        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-[10px] text-cyan-700">
                          Changed
                        </Badge>
                      )}
                    </div>

                    {player ? (
                      <div
                        draggable
                        onDragStart={() => setDragFromNumber(number)}
                        onDragEnd={() => setDragFromNumber(null)}
                        className="cursor-grab rounded border border-border/60 bg-muted/30 p-2 active:cursor-grabbing"
                        title={`${player.firstName} ${player.lastName}`}
                      >
                        <p className="truncate text-xs font-medium">
                          {player.firstName.charAt(0)}. {player.lastName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {player.careerStats.gamesPlayed}GP · {player.position.primary} · Age {player.age}
                        </p>
                        <PlayerStarRating
                          stars={getPlayerStarRating(player)}
                          player={player}
                          className="mt-1 scale-[0.75] origin-left"
                        />
                      </div>
                    ) : (
                      <div className="flex h-[54px] items-center justify-center rounded border border-dashed border-border/60 text-[10px] text-muted-foreground">
                        Blank
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {filteredMatrixNumbers.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No jumper slots match this filter.
              </p>
            )}
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleAutoAssign}>
              Auto-Assign Numbers
            </Button>
            <Button variant="secondary" onClick={applyDraftChanges} disabled={hasValidationErrors}>
              Apply Changes ({pendingChangeCount})
            </Button>
            <Button onClick={handleComplete} disabled={hasValidationErrors}>
              Complete and Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
