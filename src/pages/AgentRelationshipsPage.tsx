import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Handshake, TrendingUp, TrendingDown, Minus, Info, Users } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { getAllAgents } from '@/engine/contracts/agentRegistry'
import { computeRelationshipTier } from '@/engine/contracts/agentRelationships'
import type { RelationshipTier } from '@/types/agent'

const EMPTY_AGENT_RELS: Record<string, import('@/types/agent').AgentRelationship> = {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierColor(tier: RelationshipTier): string {
  switch (tier) {
    case 'trusted':  return 'text-emerald-400'
    case 'friendly': return 'text-blue-400'
    case 'neutral':  return 'text-muted-foreground'
    case 'strained': return 'text-amber-400'
    case 'hostile':  return 'text-red-400'
  }
}

function tierBadge(tier: RelationshipTier) {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1)
  switch (tier) {
    case 'trusted':  return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{label}</Badge>
    case 'friendly': return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">{label}</Badge>
    case 'neutral':  return <Badge variant="outline">{label}</Badge>
    case 'strained': return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">{label}</Badge>
    case 'hostile':  return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">{label}</Badge>
  }
}

function ScoreBar({ score }: { score: number }) {
  const tier = computeRelationshipTier(score)
  const pct = score
  let barColor = 'bg-muted-foreground/40'
  if (tier === 'trusted')  barColor = 'bg-emerald-500'
  if (tier === 'friendly') barColor = 'bg-blue-500'
  if (tier === 'strained') barColor = 'bg-amber-500'
  if (tier === 'hostile')  barColor = 'bg-red-500'

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border/60">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  'signed-accepted':     'Player signed',
  'quick-signing':       'Quick signing',
  'all-demands-met':     'All demands met',
  'fair-rejection':      'Fair offer rejected',
  'low-ball-rejection':  'Low-ball rejection',
  'club-withdrew':       'Club withdrew',
  'negotiation-expired': 'Talks expired',
  'counter-accepted':    'Counter-offer accepted',
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-400">
      <TrendingUp className="h-3 w-3" />+{delta}
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-red-400">
      <TrendingDown className="h-3 w-3" />{delta}
    </span>
  )
}

const ARCHETYPE_LABELS: Record<string, string> = {
  'loyal':               'Loyal',
  'greedy':              'Demanding',
  'premiership-chaser':  'Contender-focused',
  'homebody':            'Home-state focused',
  'mercenary':           'Mercenary',
  'risk-averse':         'Risk-averse',
}

// ---------------------------------------------------------------------------
// Modifiers tooltip text
// ---------------------------------------------------------------------------

function modifierText(tier: RelationshipTier): string {
  switch (tier) {
    case 'trusted':
      return 'Agents trust you. Expect lower salary demands (−7%), better mood at the table, faster negotiations (−1 tick), and +8% acceptance rate.'
    case 'friendly':
      return 'Good working relationship. Agents give slight discounts (−3%), more willing to accept (+4%), and better mood at start.'
    case 'neutral':
      return 'No history. Standard demands and negotiation behaviour.'
    case 'strained':
      return 'Agent is wary. Expect inflated demands (+6%), lower acceptance chance (−5%), slower negotiations (+1 tick), and reluctant mood.'
    case 'hostile':
      return 'Agent actively works against your club. Demands inflated 12%, acceptance rate down 10%, mood starts hostile, cooldowns extended.'
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AgentRelationshipsPage() {
  const agentRelationships = useGameStore(s => s.agentRelationships) ?? EMPTY_AGENT_RELS
  const players = useGameStore(s => s.players)
  const playerClubId = useGameStore(s => s.playerClubId)

  const allAgents = useMemo(() => getAllAgents(), [])

  // Build player lookup by agentId
  const playersByAgent = useMemo(() => {
    const map: Record<string, { firstName: string; lastName: string; clubId: string }[]> = {}
    for (const p of Object.values(players)) {
      if (p.agentId) {
        if (!map[p.agentId]) map[p.agentId] = []
        map[p.agentId].push({ firstName: p.firstName, lastName: p.lastName, clubId: p.clubId })
      }
    }
    return map
  }, [players])

  // Only show agents we've interacted with, or who represent our players
  const relevantAgentIds = useMemo(() => {
    const ids = new Set<string>()
    // Agents with relationship history
    for (const id of Object.keys(agentRelationships)) ids.add(id)
    // Agents representing our players
    for (const p of Object.values(players)) {
      if (p.agentId && p.clubId === playerClubId) ids.add(p.agentId)
    }
    return ids
  }, [agentRelationships, players, playerClubId])

  const agentsToShow = useMemo(() =>
    allAgents
      .filter(a => relevantAgentIds.has(a.id))
      .map(a => {
        const rel = agentRelationships[a.id]
        const score = rel?.score ?? 50
        const tier = computeRelationshipTier(score)
        return { agent: a, rel, score, tier }
      })
      .sort((a, b) => {
        // Sort: our players' agents first, then by score desc
        const aOurs = (playersByAgent[a.agent.id] ?? []).some(p => p.clubId === playerClubId)
        const bOurs = (playersByAgent[b.agent.id] ?? []).some(p => p.clubId === playerClubId)
        if (aOurs !== bOurs) return aOurs ? -1 : 1
        return b.score - a.score
      }),
    [allAgents, relevantAgentIds, agentRelationships, playersByAgent, playerClubId],
  )

  const noRelHistory = agentsToShow.every(a => !a.rel)

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Handshake className="mt-0.5 h-6 w-6 text-blue-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold">Agent Relationships</h1>
          <p className="text-sm text-muted-foreground">
            Your club's standing with player agents influences future contract negotiations — demands,
            acceptance probability, mood, and response time.
          </p>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            How Relationships Work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(['trusted', 'friendly', 'neutral', 'strained', 'hostile'] as RelationshipTier[]).map(tier => (
              <div key={tier} className="rounded-md border border-border/50 p-2 text-xs">
                <div className="mb-1">{tierBadge(tier)}</div>
                <p className="text-muted-foreground">{modifierText(tier)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent list */}
      {agentsToShow.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-3 h-8 w-8 opacity-30" />
            No agents on record yet. Relationships build through contract negotiations.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agentsToShow.map(({ agent, rel, score, tier }) => {
            const clients = playersByAgent[agent.id] ?? []
            const ourClients = clients.filter(c => c.clubId === playerClubId)
            const hasHistory = !!rel && rel.events.length > 0
            const recentEvents = rel?.events.slice(-5).reverse() ?? []

            return (
              <Card key={agent.id}>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ARCHETYPE_LABELS[agent.archetype] ?? agent.archetype}
                      </div>
                    </div>
                    {tierBadge(tier)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Score bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Relationship score</span>
                      <span className={`font-semibold tabular-nums ${tierColor(tier)}`}>
                        {score}/100
                      </span>
                    </div>
                    <ScoreBar score={score} />
                  </div>

                  {/* Modifier summary */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="cursor-default text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
                          {tier === 'neutral' ? 'No active modifiers' : 'Negotiation modifiers active'}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-64 text-xs">
                        {modifierText(tier)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Our clients */}
                  {ourClients.length > 0 && (
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Your players represented
                      </p>
                      {ourClients.map(c => (
                        <p key={c.firstName + c.lastName} className="text-xs font-medium">
                          {c.firstName} {c.lastName}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Recent events */}
                  {hasHistory ? (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Recent history
                      </p>
                      {recentEvents.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">{EVENT_TYPE_LABELS[e.type] ?? e.type}</span>
                          <DeltaBadge delta={e.scoreDelta} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <Minus className="mr-1 inline h-3 w-3" />
                      No negotiation history yet
                    </p>
                  )}

                  {rel?.lastInteractionDate && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Last interaction: {rel.lastInteractionDate}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!noRelHistory && agentsToShow.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {agentsToShow.length} agent{agentsToShow.length !== 1 ? 's' : ''} tracked.
          Relationships start neutral (50) and shift based on negotiation outcomes.
        </p>
      )}
    </div>
  )
}
