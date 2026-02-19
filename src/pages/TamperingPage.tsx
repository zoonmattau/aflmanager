import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, EyeOff, MessageCircle, CheckCircle2, XCircle, Minus } from 'lucide-react'
import { getOverallRating } from '@/engine/player/playerRating'
import type {
  TamperingContact,
  PreFAExpression,
  TamperingContactResponse,
  PreFAExpressionResponse,
} from '@/types/contract'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtM(n: number) {
  return `$${(n / 1_000_000).toFixed(2)}M`
}

function responseColor(r: TamperingContactResponse | PreFAExpressionResponse) {
  if (r === 'interested') return 'text-emerald-400'
  if (r === 'lukewarm' || r === 'neutral') return 'text-amber-400'
  return 'text-red-400'
}

function responseLabel(r: TamperingContactResponse | PreFAExpressionResponse) {
  if (r === 'interested') return 'Interested'
  if (r === 'lukewarm') return 'Lukewarm'
  if (r === 'neutral') return 'Neutral'
  if (r === 'not-interested') return 'Not interested'
  return 'Pending'
}

function ResponseIcon({ r }: { r: TamperingContactResponse | PreFAExpressionResponse }) {
  if (r === 'interested') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (r === 'not-interested') return <XCircle className="h-3.5 w-3.5 text-red-400" />
  return <Minus className="h-3.5 w-3.5 text-amber-400" />
}

// ---------------------------------------------------------------------------
// Covert Contacts Tab
// ---------------------------------------------------------------------------

function CovertContactsTab() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const phase = useGameStore((s) => s.phase)
  const tamperingTracker = useGameStore((s) => s.tamperingTracker)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const makeCovertContact = useGameStore((s) => s.makeCovertContact)

  const [search, setSearch] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ detected: boolean; response?: TamperingContactResponse } | null>(null)

  const canContact = ['regular-season', 'finals', 'preseason'].includes(phase)

  const alreadyContacted = new Set(
    tamperingTracker?.contacts.map((c) => c.targetPlayerId) ?? [],
  )

  const eligible = useMemo(() => {
    const q = search.toLowerCase()
    return Object.values(players)
      .filter((p) => {
        if (p.clubId === playerClubId) return false
        if (p.contract.yearsRemaining > 1) return false
        if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 80)
  }, [players, playerClubId, search])

  const handleConfirm = () => {
    if (!confirmTarget) return
    const result = makeCovertContact(confirmTarget)
    setConfirmTarget(null)
    if (result.success) {
      setLastResult({ detected: result.detected, response: result.response })
    }
  }

  const contactHistory = tamperingTracker?.contacts ?? []

  return (
    <div className="space-y-4">
      {!canContact && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Covert contacts can only be made during the regular season, finals, or preseason — not during the post-season window.</span>
        </div>
      )}

      {lastResult && (
        <div className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${lastResult.detected ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'}`}>
          {lastResult.detected
            ? <><AlertTriangle className="h-4 w-4 shrink-0" /> Contact detected by the AFL. A penalty has been issued.</>
            : <><EyeOff className="h-4 w-4 shrink-0" /> Contact made covertly. Player response: <span className={`ml-1 font-medium ${responseColor(lastResult.response!)}`}>{responseLabel(lastResult.response!)}</span></>
          }
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLastResult(null)}>Dismiss</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Eligible targets */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Eligible Players</h3>
            <Badge variant="outline" className="text-xs">{eligible.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Players in their final contract year at other clubs. One contact per player per season.
          </p>
          <Input
            placeholder="Search player name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Pos</TableHead>
                    <TableHead className="text-center">OVR</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Yrs</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Age</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                        No eligible targets found.
                      </TableCell>
                    </TableRow>
                  ) : eligible.map((p) => {
                    const contacted = alreadyContacted.has(p.id)
                    return (
                      <TableRow key={p.id} className={contacted ? 'opacity-50' : ''}>
                        <TableCell className="text-sm font-medium">
                          {p.firstName} {p.lastName}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({clubs[p.clubId]?.abbreviation ?? p.clubId})
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs hidden sm:table-cell">{p.position.primary}</TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{getOverallRating(p)}</TableCell>
                        <TableCell className="text-center text-xs hidden md:table-cell">{p.contract.yearsRemaining}</TableCell>
                        <TableCell className="text-center text-xs hidden lg:table-cell">{p.age}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={contacted || !canContact}
                            onClick={() => setConfirmTarget(p.id)}
                            className="text-xs h-7"
                          >
                            {contacted ? 'Done' : 'Contact'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Contact history */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">This Season's Contacts</h3>
          {contactHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No contacts made yet.</p>
          ) : (
            <div className="space-y-2">
              {contactHistory.map((c: TamperingContact) => {
                const p = players[c.targetPlayerId]
                const club = clubs[c.targetClubId]
                return (
                  <Card key={c.id} className={c.detected ? 'border-destructive/30' : ''}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p ? `${p.firstName} ${p.lastName}` : c.targetPlayerId}
                          <span className="ml-1 text-xs text-muted-foreground">({club?.abbreviation ?? c.targetClubId})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">Round {c.madeAtRound}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ResponseIcon r={c.playerResponse} />
                        <span className={`text-xs ${responseColor(c.playerResponse)}`}>{responseLabel(c.playerResponse)}</span>
                        {c.detected && (
                          <Badge variant="destructive" className="text-[10px]">Detected</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Covert Contact?</DialogTitle>
            <DialogDescription>
              {confirmTarget && (() => {
                const p = players[confirmTarget]
                return p
                  ? `You are about to make an unauthorized approach to ${p.firstName} ${p.lastName} (${clubs[p.clubId]?.name}). If detected, the AFL will issue a draft pick penalty.`
                  : 'Proceeding with covert contact.'
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Detection risk varies by player profile. Mercenary agents and low-professionalism players are more likely to expose the contact.</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>Cancel</Button>
            <Button onClick={handleConfirm}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pre-FA Expressions Tab
// ---------------------------------------------------------------------------

function PreFAExpressionsTab() {
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const phase = useGameStore((s) => s.phase)
  const tamperingTracker = useGameStore((s) => s.tamperingTracker)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const makePreFAExpression = useGameStore((s) => s.makePreFAExpression)

  const [search, setSearch] = useState('')
  const [offerTarget, setOfferTarget] = useState<string | null>(null)
  const [offerYears, setOfferYears] = useState(3)
  const [offerAav, setOfferAav] = useState(500_000)
  const [lastResult, setLastResult] = useState<{ response: PreFAExpressionResponse } | null>(null)

  const canExpress = phase === 'post-season'

  const alreadyExpressed = new Set(
    tamperingTracker?.preFAExpressions.map((e) => e.targetPlayerId) ?? [],
  )

  const eligible = useMemo(() => {
    const q = search.toLowerCase()
    return Object.values(players)
      .filter((p) => {
        if (p.clubId === playerClubId) return false
        if (p.contract.yearsRemaining > 0) return false
        if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 80)
  }, [players, playerClubId, search])

  const handleSendOffer = () => {
    if (!offerTarget) return
    const result = makePreFAExpression(offerTarget, offerYears, offerAav)
    setOfferTarget(null)
    if (result.success && result.response) {
      setLastResult({ response: result.response })
    }
  }

  const expressions = tamperingTracker?.preFAExpressions ?? []

  return (
    <div className="space-y-4">
      {!canExpress && (
        <div className="flex items-start gap-3 rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-blue-400">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Pre-FA expressions of interest are only available during the post-season window, before the formal free agency market opens. Current phase: <strong>{phase}</strong>.</span>
        </div>
      )}

      {lastResult && (
        <div className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${lastResult.response === 'interested' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : lastResult.response === 'neutral' ? 'border-amber-500/30 bg-amber-500/5 text-amber-400' : 'border-muted/30 bg-muted/5 text-muted-foreground'}`}>
          <ResponseIcon r={lastResult.response} />
          <span>
            Player response: <strong className={responseColor(lastResult.response)}>{responseLabel(lastResult.response)}</strong>
            {lastResult.response === 'interested' && ' — they will enter formal negotiations in an eager mood.'}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLastResult(null)}>Dismiss</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Eligible OOC players */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Out-of-Contract Players</h3>
            <Badge variant="outline" className="text-xs">{eligible.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Send a non-binding verbal offer to gauge interest before the formal FA window. Players who respond positively start negotiations in an eager mood.
          </p>
          <Input
            placeholder="Search player name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Pos</TableHead>
                    <TableHead className="text-center">OVR</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Age</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                        No out-of-contract players found.
                      </TableCell>
                    </TableRow>
                  ) : eligible.map((p) => {
                    const expressed = alreadyExpressed.has(p.id)
                    return (
                      <TableRow key={p.id} className={expressed ? 'opacity-50' : ''}>
                        <TableCell className="text-sm font-medium">
                          {p.firstName} {p.lastName}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({clubs[p.clubId]?.abbreviation ?? p.clubId})
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs hidden sm:table-cell">{p.position.primary}</TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{getOverallRating(p)}</TableCell>
                        <TableCell className="text-center text-xs hidden md:table-cell">{p.age}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={expressed || !canExpress}
                            onClick={() => { setOfferTarget(p.id); setOfferYears(3); setOfferAav(500_000) }}
                            className="text-xs h-7"
                          >
                            {expressed ? 'Sent' : 'Express Interest'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Expression history */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Expressions Sent</h3>
          {expressions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No expressions sent yet.</p>
          ) : (
            <div className="space-y-2">
              {expressions.map((e: PreFAExpression) => {
                const p = players[e.targetPlayerId]
                const club = clubs[e.originalClubId]
                return (
                  <Card key={e.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {p ? `${p.firstName} ${p.lastName}` : e.targetPlayerId}
                            <span className="ml-1 text-xs text-muted-foreground">({club?.abbreviation ?? e.originalClubId})</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.years}yr @ {fmtM(e.aav)}/yr
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ResponseIcon r={e.playerResponse} />
                          <span className={`text-xs ${responseColor(e.playerResponse)}`}>{responseLabel(e.playerResponse)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Offer dialog */}
      {offerTarget && (() => {
        const p = players[offerTarget]
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setOfferTarget(null) }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Express Interest in {p ? `${p.firstName} ${p.lastName}` : offerTarget}
                </DialogTitle>
                <DialogDescription>
                  Send a non-binding verbal offer to gauge this player's interest before the formal free agency window. No penalty risk.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Indicative Years</Label>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={offerYears}
                    onChange={(e) => setOfferYears(Math.max(1, Math.min(8, Number(e.target.value))))}
                    className="w-32"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Indicative AAV ($/yr)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={100_000}
                      step={50_000}
                      value={offerAav}
                      onChange={(e) => setOfferAav(Number(e.target.value))}
                      className="w-40"
                    />
                    <span className="text-xs text-muted-foreground">= {fmtM(offerAav)}/yr</span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOfferTarget(null)}>Cancel</Button>
                <Button onClick={handleSendOffer}>Send Expression</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function TamperingPage() {
  const settings = useGameStore((s) => s.settings)

  if (!settings.realism.contractTampering) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <EyeOff className="h-16 w-16 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold mb-2">Contract Tampering</h1>
          <p className="text-muted-foreground max-w-md">
            This feature is disabled. Enable <strong>Contract Tampering</strong> in your realism settings to
            make covert contacts and pre-FA expressions of interest.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Game Settings → Realism → Trading & Contracts → Contract Tampering
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Contract Tampering</h1>
        <p className="text-sm text-muted-foreground">
          Covert contacts during the season · Pre-FA expressions of interest during post-season
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Covert contacts carry detection risk — if caught, a draft pick penalty is applied.
          Pre-FA expressions carry no penalty but are tactically important to lock in player interest.
        </span>
      </div>

      <Tabs defaultValue="covert">
        <TabsList>
          <TabsTrigger value="covert">
            <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            Covert Contacts
          </TabsTrigger>
          <TabsTrigger value="prefa">
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
            Pre-FA Expressions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="covert" className="mt-4">
          <CovertContactsTab />
        </TabsContent>

        <TabsContent value="prefa" className="mt-4">
          <PreFAExpressionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
