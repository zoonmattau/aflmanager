import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Scale, ArrowLeft, Gavel, Shield, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'
import type {
  TribunalPlea,
  TribunalLegalRep,
  TribunalImpact,
  TribunalIntent,
} from '@/types/discipline'
import {
  LEGAL_REP_OPTIONS,
  getLegalRepByTier,
  computeGrading,
  applyPleaDiscount,
  pointsToWeeks,
  computeProbabilities,
  computeExpectedRange,
  generateArguments,
} from '@/engine/players/tribunal'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  medium: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  high: 'bg-red-500/15 text-red-400 border-red-500/30',
  severe: 'bg-red-700/15 text-red-300 border-red-700/30',
}

const STATUS_COLORS: Record<string, string> = {
  'pending-user': 'bg-amber-500/15 text-amber-400',
  'pending-ai': 'bg-blue-500/15 text-blue-400',
  resolved: 'bg-green-500/15 text-green-400',
  expired: 'bg-zinc-500/15 text-zinc-400',
}

const INTENT_LABELS: Record<TribunalIntent, string> = {
  careless: 'Careless',
  reckless: 'Reckless',
  intentional: 'Intentional',
}

const IMPACT_LABELS: Record<TribunalImpact, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  severe: 'Severe',
}

const CONTACT_LABELS: Record<string, string> = {
  body: 'Body',
  high: 'High',
  groin: 'Groin',
  head: 'Head',
}

const INCIDENT_LABELS: Record<string, string> = {
  'high-contact': 'High Contact',
  'rough-conduct': 'Rough Conduct',
  'dangerous-tackle': 'Dangerous Tackle',
  'striking': 'Striking',
  'tripping': 'Tripping',
  'verbal-abuse': 'Verbal Abuse',
}

function formatWeeks(w: number): string {
  if (w === 0) return 'Reprimand'
  return `${w} week${w === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------------------
// Grading Matrix visualisation
// ---------------------------------------------------------------------------

const IMPACTS: TribunalImpact[] = ['low', 'medium', 'high', 'severe']
const INTENTS: TribunalIntent[] = ['careless', 'reckless', 'intentional']

const GRADING_MATRIX: Record<TribunalImpact, Record<TribunalIntent, number>> = {
  low:    { careless: 75,  reckless: 150, intentional: 200 },
  medium: { careless: 150, reckless: 200, intentional: 300 },
  high:   { careless: 200, reckless: 300, intentional: 450 },
  severe: { careless: 300, reckless: 450, intentional: 600 },
}

function GradingMatrixTable({ activeImpact, activeIntent }: { activeImpact?: TribunalImpact; activeIntent?: TribunalIntent }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-1.5 text-left text-muted-foreground">Impact / Intent</th>
            {INTENTS.map((i) => (
              <th key={i} className="p-1.5 text-center text-muted-foreground">{INTENT_LABELS[i]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {IMPACTS.map((impact) => (
            <tr key={impact}>
              <td className="p-1.5 font-medium capitalize">{impact}</td>
              {INTENTS.map((intent) => {
                const isActive = impact === activeImpact && intent === activeIntent
                return (
                  <td
                    key={intent}
                    className={cn(
                      'p-1.5 text-center rounded',
                      isActive
                        ? 'bg-primary/20 text-primary font-bold ring-1 ring-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    {GRADING_MATRIX[impact][intent]}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Probability bars
// ---------------------------------------------------------------------------

function ProbabilityBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview mode
// ---------------------------------------------------------------------------

function TribunalOverview() {
  const navigate = useNavigate()
  const tribunalInbox = useGameStore((s) => s.tribunalInbox)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all')

  const userCases = useMemo(
    () => tribunalInbox.filter((c) => c.clubId === playerClubId),
    [tribunalInbox, playerClubId],
  )

  const filtered = useMemo(() => {
    if (filter === 'pending') return userCases.filter((c) => c.status === 'pending-user')
    if (filter === 'resolved') return userCases.filter((c) => c.status === 'resolved' || c.status === 'expired')
    return userCases
  }, [userCases, filter])

  const sorted = useMemo(() => [...filtered].reverse(), [filtered])

  const pendingCount = userCases.filter((c) => c.status === 'pending-user').length

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => navigate('/')}>
          Dashboard
        </Button>
        <Button size="sm" className="h-8 gap-1.5 px-3">
          <Scale className="h-3.5 w-3.5" />
          Tribunal
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">AFL Tribunal</h1>
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0 ? `${pendingCount} pending hearing${pendingCount > 1 ? 's' : ''}` : 'No pending hearings'}
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All ({userCases.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Scale className="mb-3 h-10 w-10" />
            <p className="text-sm font-medium">
              {filter === 'all' ? 'No tribunal cases this season' : `No ${filter} cases`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const player = players[c.playerId]
            const name = player ? `${player.firstName} ${player.lastName}` : c.playerId
            return (
              <Card
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-muted/30"
                onClick={() => navigate(`/tribunal/${c.id}`)}
              >
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-400">
                    <Scale className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.incidentSummary}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={cn('text-[10px]', SEVERITY_COLORS[c.severity])}>
                      {c.severity}
                    </Badge>
                    {c.status === 'pending-user' ? (
                      <Badge className="bg-amber-500/15 text-amber-400 text-[10px]">
                        {formatWeeks(c.recommendedWeeks)} rec.
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[c.status])}>
                        {c.finalWeeks != null ? formatWeeks(c.finalWeeks) : c.status}
                      </Badge>
                    )}
                    {c.hearingDate && c.status === 'pending-user' && (
                      <span className="text-[10px] text-muted-foreground">{c.hearingDate}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hearing mode
// ---------------------------------------------------------------------------

function TribunalHearing({ caseId }: { caseId: string }) {
  const navigate = useNavigate()
  const tribunalInbox = useGameStore((s) => s.tribunalInbox)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const settings = useGameStore((s) => s.settings)
  const submitTribunalPlea = useGameStore((s) => s.submitTribunalPlea)
  const skipTribunal = useGameStore((s) => s.skipTribunal)
  const rngSeed = useGameStore((s) => s.rngSeed)

  const caseItem = tribunalInbox.find((c) => c.id === caseId)
  const [selectedPlea, setSelectedPlea] = useState<TribunalPlea>('guilty-early')
  const [selectedLegalTier, setSelectedLegalTier] = useState<TribunalLegalRep['tier']>('none')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!caseItem) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="outline" size="sm" onClick={() => navigate('/tribunal')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tribunal
        </Button>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Case not found
          </CardContent>
        </Card>
      </div>
    )
  }

  const player = players[caseItem.playerId]
  const club = clubs[caseItem.clubId]
  const playerName = player ? `${player.firstName} ${player.lastName}` : caseItem.playerId
  const isPending = caseItem.status === 'pending-user'
  const isResolved = caseItem.status === 'resolved' || caseItem.status === 'expired'

  // Build or use existing grading
  const grading = caseItem.grading ?? computeGrading({
    incidentType: caseItem.incidentType,
    impact: (caseItem.impact ?? caseItem.severity) as TribunalImpact,
    intent: caseItem.intent ?? 'careless',
    contactLevel: caseItem.contactLevel ?? 'body',
    priorRecord: caseItem.priorRecord ?? 0,
    enablePriorRecord: settings.realism.tribunalPriorRecord,
  })

  // Compute dynamic probabilities based on current plea/legal selection
  const legalRep = getLegalRepByTier(selectedLegalTier)
  const probabilities = isPending
    ? computeProbabilities({
        grading,
        evidenceScore: caseItem.evidenceScore,
        legalRepModifier: legalRep.successModifier,
        plea: selectedPlea,
      })
    : caseItem.hearingResult?.probabilities ?? { dismissed: 0, reduced: 0, upheld: 1, increased: 0 }

  const expectedRange = isPending
    ? computeExpectedRange({ grading, plea: selectedPlea, probabilities })
    : caseItem.hearingResult?.expectedRange ?? { min: 0, max: 0 }

  // Dynamic expected outcome for current plea selection
  const effectivePoints = applyPleaDiscount(grading.totalPoints, selectedPlea)
  const expectedWeeks = pointsToWeeks(effectivePoints)

  // Arguments: generate for display (or use stored result)
  const argumentsRng = new SeededRNG(rngSeed + caseId.charCodeAt(0) * 31)
  const arguments_ = caseItem.hearingResult?.arguments ?? generateArguments(caseItem.incidentType, argumentsRng)

  // Available legal reps based on settings
  const availableLegalReps = settings.realism.tribunalLegalRepresentation
    ? LEGAL_REP_OPTIONS
    : LEGAL_REP_OPTIONS.filter((r) => r.tier === 'none' || r.tier === 'club-appointed')

  const handleSubmit = () => {
    const result = submitTribunalPlea(caseId, {
      plea: selectedPlea,
      legalRepTier: selectedLegalTier,
      attended: true,
    })
    if (result.success) {
      setSubmitted(true)
      setError(null)
    } else {
      setError(result.error ?? 'Failed to submit plea')
    }
  }

  const handleSkip = () => {
    const result = skipTribunal(caseId)
    if (result.success) {
      setSubmitted(true)
      setError(null)
    } else {
      setError(result.error ?? 'Failed to skip tribunal')
    }
  }

  // Re-read case after submission for verdict display
  const resolvedCase = submitted ? tribunalInbox.find((c) => c.id === caseId) : caseItem
  const showVerdict = isResolved || submitted

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => navigate('/tribunal')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button size="sm" className="h-8 gap-1.5 px-3" disabled>
          <Gavel className="h-3.5 w-3.5" />
          Hearing
        </Button>
      </div>

      {/* Section 1: Incident Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Incident Summary</CardTitle>
            <Badge variant="outline" className={cn(STATUS_COLORS[resolvedCase?.status ?? caseItem.status])}>
              {resolvedCase?.status ?? caseItem.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold">
              {player?.jerseyNumber ?? '?'}
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold">{playerName}</p>
              <p className="text-sm text-muted-foreground">{club?.name ?? caseItem.clubId}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{INCIDENT_LABELS[caseItem.incidentType] ?? caseItem.incidentType}</Badge>
            <Badge variant="outline" className={SEVERITY_COLORS[caseItem.severity]}>{caseItem.severity} severity</Badge>
            <Badge variant="outline">Round {caseItem.roundMarker + 1}</Badge>
            {caseItem.hearingDate && <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />{caseItem.hearingDate}</Badge>}
          </div>
          <p className="text-sm">{caseItem.incidentSummary}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Evidence Score:</span>{' '}
              <span className="font-medium">{caseItem.evidenceScore}/100</span>
            </div>
            <div>
              <span className="text-muted-foreground">Recommended:</span>{' '}
              <span className="font-medium">{formatWeeks(caseItem.recommendedWeeks)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: AFL Grading */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">AFL Grading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <GradingMatrixTable activeImpact={grading.impact} activeIntent={grading.intent} />
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Contact: {CONTACT_LABELS[grading.contactLevel] ?? grading.contactLevel}</Badge>
            <Badge variant="outline">Intent: {INTENT_LABELS[grading.intent]}</Badge>
            <Badge variant="outline">Impact: {IMPACT_LABELS[grading.impact]}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-3 text-center">
              <p className="text-xs text-muted-foreground">Base Points</p>
              <p className="text-lg font-bold">{grading.basePoints}</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="text-xs text-muted-foreground">Prior Record</p>
              <p className="text-lg font-bold">{grading.carryoverPoints > 0 ? `+${grading.carryoverPoints}` : '0'}</p>
              {settings.realism.tribunalPriorRecord && (caseItem.priorRecord ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground">{caseItem.priorRecord} prior offence{caseItem.priorRecord === 1 ? '' : 's'}</p>
              )}
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Points</p>
              <p className="text-lg font-bold">{grading.totalPoints}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Plea & Legal (only for pending) */}
      {isPending && !submitted && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Plea & Legal Representation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Plea selection */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Select Plea</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlea('guilty-early')}
                  disabled={!settings.realism.tribunalEarlyPleaDiscount}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    selectedPlea === 'guilty-early'
                      ? 'border-primary bg-primary/10'
                      : 'hover:bg-muted/50',
                    !settings.realism.tribunalEarlyPleaDiscount && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <p className="text-sm font-medium">Guilty (Early Plea)</p>
                  <p className="text-xs text-muted-foreground">25% discount, fast resolution</p>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlea('guilty')}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    selectedPlea === 'guilty'
                      ? 'border-primary bg-primary/10'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <p className="text-sm font-medium">Guilty</p>
                  <p className="text-xs text-muted-foreground">10% discount, some mitigation</p>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlea('not-guilty')}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    selectedPlea === 'not-guilty'
                      ? 'border-primary bg-primary/10'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <p className="text-sm font-medium">Not Guilty</p>
                  <p className="text-xs text-muted-foreground">Full hearing, risk of increase</p>
                </button>
              </div>
            </div>

            {/* Legal representation */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Legal Representation</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {availableLegalReps.map((rep) => (
                  <button
                    key={rep.tier}
                    type="button"
                    onClick={() => setSelectedLegalTier(rep.tier)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      selectedLegalTier === rep.tier
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <p className="text-sm font-medium">{rep.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rep.cost > 0 ? `$${(rep.cost / 1000).toFixed(0)}k` : 'Free'}
                    </p>
                    {rep.successModifier > 0 && (
                      <p className="text-xs text-green-400">+{Math.round(rep.successModifier * 100)}% defence</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Expected outcome */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Expected Outcome</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Effective Points</p>
                  <p className="text-lg font-bold">{effectivePoints}</p>
                  {selectedPlea !== 'not-guilty' && (
                    <p className="text-[10px] text-green-400">
                      {selectedPlea === 'guilty-early' ? '25% discount' : '10% discount'}
                    </p>
                  )}
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Expected Suspension</p>
                  <p className="text-lg font-bold">{formatWeeks(expectedWeeks)}</p>
                  {selectedPlea === 'not-guilty' && (
                    <p className="text-[10px] text-muted-foreground">
                      Range: {formatWeeks(expectedRange.min)} – {formatWeeks(expectedRange.max)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Probability bars (only for not-guilty) */}
            {selectedPlea === 'not-guilty' && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Challenge Probabilities</p>
                <div className="space-y-2">
                  <ProbabilityBar label="Dismissed" value={probabilities.dismissed} color="bg-green-500" />
                  <ProbabilityBar label="Reduced" value={probabilities.reduced} color="bg-blue-500" />
                  <ProbabilityBar label="Upheld" value={probabilities.upheld} color="bg-orange-500" />
                  <ProbabilityBar label="Increased" value={probabilities.increased} color="bg-red-500" />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {/* Action buttons */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={handleSkip}>
                Quick Accept (Skip Hearing)
              </Button>
              <Button size="sm" onClick={handleSubmit}>
                <Gavel className="mr-2 h-4 w-4" />
                Submit Plea
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 4: Arguments */}
      {(showVerdict || selectedPlea === 'not-guilty') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Hearing Arguments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <p className="text-sm font-medium text-red-400">Prosecution</p>
              </div>
              <ul className="space-y-2 pl-6">
                {arguments_.filter((a) => a.side === 'prosecution').map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground list-disc">{a.text}</li>
                ))}
              </ul>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-400" />
                <p className="text-sm font-medium text-blue-400">Defence</p>
              </div>
              <ul className="space-y-2 pl-6">
                {arguments_.filter((a) => a.side === 'defence').map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground list-disc">{a.text}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 5: Verdict */}
      {showVerdict && resolvedCase && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Verdict</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-4 py-4">
              {resolvedCase.finalWeeks != null && resolvedCase.finalWeeks > 0 ? (
                <div className="text-center">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-red-500/15 px-6 py-3 text-red-400">
                    <XCircle className="h-6 w-6" />
                    <span className="text-xl font-bold">GUILTY - {formatWeeks(resolvedCase.finalWeeks).toUpperCase()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{resolvedCase.outcomeSummary}</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-green-500/15 px-6 py-3 text-green-400">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="text-xl font-bold">CLEARED</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{resolvedCase.outcomeSummary}</p>
                </div>
              )}
            </div>

            {resolvedCase.finalWeeks != null && resolvedCase.finalWeeks > 0 && (
              <div className="rounded-md border p-3 text-center text-sm">
                <p className="text-muted-foreground">
                  {playerName} is unavailable until after serving {resolvedCase.finalWeeks} match{resolvedCase.finalWeeks === 1 ? '' : 'es'}.
                </p>
              </div>
            )}

            {resolvedCase.hearingResult && (
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>Plea: <span className="font-medium text-foreground">{resolvedCase.hearingResult.plea}</span></div>
                <div>Legal Rep: <span className="font-medium text-foreground">{resolvedCase.hearingResult.legalRep?.name ?? 'None'}</span></div>
                <div>Attended: <span className="font-medium text-foreground">{resolvedCase.hearingResult.attended ? 'Yes' : 'No'}</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Router entry
// ---------------------------------------------------------------------------

export function TribunalPage() {
  const { caseId } = useParams<{ caseId?: string }>()

  if (caseId) {
    return <TribunalHearing caseId={caseId} />
  }

  return <TribunalOverview />
}
