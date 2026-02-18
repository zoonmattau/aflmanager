import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/game'
import {
  Swords,
  ArrowLeftRight,
  AlertTriangle,
  GraduationCap,
  FileText,
  Newspaper,
  MailOpen,
  CheckCheck,
  Handshake,
  Sparkles,
  Scale,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Category display config
// ---------------------------------------------------------------------------

type NewsCategory = NewsItem['category']

const CATEGORY_CONFIG: Record<NewsCategory, { icon: React.ElementType; color: string; label: string }> = {
  match:    { icon: Swords,          color: 'bg-blue-500/15 text-blue-400',   label: 'Match' },
  trade:    { icon: ArrowLeftRight,  color: 'bg-purple-500/15 text-purple-400', label: 'Trade' },
  injury:   { icon: AlertTriangle,   color: 'bg-red-500/15 text-red-400',    label: 'Injury' },
  discipline:{ icon: Scale,          color: 'bg-orange-500/15 text-orange-400', label: 'Tribunal' },
  draft:    { icon: GraduationCap,   color: 'bg-green-500/15 text-green-400', label: 'Draft' },
  contract: { icon: FileText,        color: 'bg-amber-500/15 text-amber-400', label: 'Contract' },
  milestone:{ icon: Sparkles,        color: 'bg-cyan-500/15 text-cyan-400',  label: 'Milestone' },
  general:  { icon: Newspaper,       color: 'bg-zinc-500/15 text-zinc-400',  label: 'General' },
}

const ALL_CATEGORIES: NewsCategory[] = ['match', 'trade', 'injury', 'discipline', 'draft', 'contract', 'milestone', 'general']

function formatByline(item: NewsItem): string | null {
  if (!item.media?.reporterName || !item.media?.outletName) return null
  return `Reported by ${item.media.reporterName} (${item.media.outletName})`
}

// ---------------------------------------------------------------------------
// News row
// ---------------------------------------------------------------------------

function NewsRow({
  item,
  expanded,
  onToggle,
  onRead,
}: {
  item: NewsItem
  expanded: boolean
  onToggle: () => void
  onRead: (newsId: string) => void
}) {
  const config = CATEGORY_CONFIG[item.category]
  const Icon = config.icon
  const isUnread = !item.read
  const byline = formatByline(item)

  const handleClick = () => {
    if (isUnread) onRead(item.id)
    onToggle()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50',
        expanded && 'bg-muted/30'
      )}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        {/* Unread indicator */}
        <div className="flex w-2.5 flex-shrink-0 items-center justify-center">
          {isUnread && <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
        </div>

        {/* Category icon chip */}
        <div className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md', config.color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>

        {/* Headline */}
        <span className={cn('flex-1 truncate text-sm', isUnread ? 'font-semibold' : 'text-muted-foreground')}>
          {item.headline}
        </span>

        {/* Date */}
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {item.date}
        </span>
      </div>

      {/* Preview / expanded body */}
      {!expanded && (
        <div className="ml-[calc(0.625rem+0.75rem+1.75rem+0.75rem)]">
          <p className="truncate text-xs text-muted-foreground">
            {item.body}
          </p>
          {byline && (
            <p className="truncate text-[10px] text-muted-foreground/80">
              {byline}
            </p>
          )}
        </div>
      )}
      {expanded && (
        <div className="ml-[calc(0.625rem+0.75rem+1.75rem+0.75rem)] mt-1 space-y-2">
          <p className="text-sm text-foreground">{item.body}</p>
          {byline && <p className="text-xs text-muted-foreground">{byline}</p>}
          <Badge variant="outline" className={cn('text-[10px]', config.color)}>
            {config.label}
          </Badge>
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Inbox page
// ---------------------------------------------------------------------------

export function InboxPage() {
  const navigate = useNavigate()
  const newsLog = useGameStore((s) => s.newsLog)
  const emailLog = useGameStore((s) => s.emailLog)
  const markAllNewsRead = useGameStore((s) => s.markAllNewsRead)
  const markNewsRead = useGameStore((s) => s.markNewsRead)
  const markEmailRead = useGameStore((s) => s.markEmailRead)
  const markAllEmailRead = useGameStore((s) => s.markAllEmailRead)
  const tradeInbox = useGameStore((s) => s.tradeInbox)
  const respondToTradeOffer = useGameStore((s) => s.respondToTradeOffer)
  const tribunalInbox = useGameStore((s) => s.tribunalInbox)
  const respondToTribunalCase = useGameStore((s) => s.respondToTribunalCase)
  const markTribunalCaseRead = useGameStore((s) => s.markTribunalCaseRead)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const [filter, setFilter] = useState<'all' | NewsCategory>('all')
  const [channel, setChannel] = useState<'alerts' | 'email'>('alerts')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tradeError, setTradeError] = useState<string | null>(null)
  const [tribunalError, setTribunalError] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...(channel === 'alerts' ? newsLog : emailLog)].reverse(),
    [newsLog, emailLog, channel],
  )

  const filtered = useMemo(
    () => (filter === 'all' ? sorted : sorted.filter((n) => n.category === filter)),
    [sorted, filter],
  )

  const unreadAlerts = useMemo(() => newsLog.filter((n) => !n.read).length, [newsLog])
  const unreadEmail = useMemo(() => emailLog.filter((n) => !n.read).length, [emailLog])
  const totalUnread = unreadAlerts + unreadEmail

  const unreadByCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cat of ALL_CATEGORIES) counts[cat] = 0
    const source = channel === 'alerts' ? newsLog : emailLog
    for (const item of source) {
      if (!item.read) counts[item.category] = (counts[item.category] ?? 0) + 1
    }
    return counts
  }, [newsLog, emailLog, channel])

  const pendingTradeOffers = useMemo(
    () => tradeInbox.filter((i) => i.offer.status === 'pending-user').slice(0, 4),
    [tradeInbox],
  )
  const pendingTribunalCases = useMemo(
    () => tribunalInbox.filter((c) => c.status === 'pending-user' && c.clubId === playerClubId).slice(0, 4),
    [tribunalInbox, playerClubId],
  )

  const handleTradeDecision = (offerId: string, decision: 'accept' | 'reject' | 'counter') => {
    const result = respondToTradeOffer(offerId, decision)
    if (!result.success) setTradeError(result.error ?? 'Unable to process trade offer')
    else setTradeError(null)
  }

  const handleTribunalQuickAccept = (caseId: string) => {
    const result = respondToTribunalCase(caseId, 'accept')
    if (!result.success) setTribunalError(result.error ?? 'Unable to process tribunal case')
    else {
      setTribunalError(null)
      markTribunalCaseRead(caseId)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => navigate('/')}>
          Dashboard
        </Button>
        <Button size="sm" className="h-8 gap-1.5 px-3">
          <MailOpen className="h-3.5 w-3.5" />
          Inbox
          {totalUnread > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
              {totalUnread}
            </span>
          )}
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}
          </p>
        </div>
        {totalUnread > 0 && (
          <Button variant="outline" size="sm" onClick={channel === 'alerts' ? markAllNewsRead : markAllEmailRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark {channel === 'alerts' ? 'Alerts' : 'Email'} Read
          </Button>
        )}
      </div>

      <Tabs value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
        <TabsList>
          <TabsTrigger value="alerts" className="gap-1.5">
            In-App
            {unreadAlerts > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                {unreadAlerts}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            Email
            {unreadEmail > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                {unreadEmail}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Category filter */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all" className="gap-1.5">
            All
            {totalUnread > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                {totalUnread}
              </span>
            )}
          </TabsTrigger>
          {ALL_CATEGORIES.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat]
            const count = unreadByCategory[cat] ?? 0
            return (
              <TabsTrigger key={cat} value={cat} className="gap-1.5">
                {cfg.label}
                {count > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {pendingTradeOffers.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Trade Inbox</p>
              <Badge variant="secondary">{pendingTradeOffers.length} pending</Badge>
            </div>
            {tradeError && (
              <p className="text-xs text-red-400">{tradeError}</p>
            )}
            <div className="space-y-2">
              {pendingTradeOffers.map((item) => {
                const incoming = item.offer.playerMoves
                  .filter((m) => m.toClubId === playerClubId)
                  .map((m) => players[m.playerId])
                  .filter(Boolean)
                return (
                  <div key={item.id} className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">
                      {item.offer.clubsInvolved.map((cid) => clubs[cid]?.abbreviation ?? cid).join(' / ')}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.offer.message}</p>
                    {incoming.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Incoming: {incoming.map((p) => `${p!.firstName} ${p!.lastName}`).join(', ')}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTradeDecision(item.id, 'reject')}>Reject</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTradeDecision(item.id, 'counter')}
                        disabled={item.offer.clubsInvolved.length > 2}
                      >
                        Counter
                      </Button>
                      <Button size="sm" onClick={() => handleTradeDecision(item.id, 'accept')}>Accept</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingTribunalCases.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-orange-500" />
              <p className="font-semibold text-sm">Tribunal Inbox</p>
              <Badge variant="secondary">{pendingTribunalCases.length} pending</Badge>
            </div>
            {tribunalError && (
              <p className="text-xs text-red-400">{tribunalError}</p>
            )}
            <div className="space-y-2">
              {pendingTribunalCases.map((caseItem) => {
                const player = players[caseItem.playerId]
                return (
                  <div key={caseItem.id} className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">
                      {player ? `${player.firstName} ${player.lastName}` : caseItem.playerId}
                    </p>
                    <p className="text-xs text-muted-foreground">{caseItem.incidentSummary}</p>
                    <p className="text-xs text-muted-foreground">
                      Recommended sanction: {caseItem.recommendedWeeks} week{caseItem.recommendedWeeks === 1 ? '' : 's'}.
                    </p>
                    <p className="text-xs text-orange-500">
                      Decision deadline: before your next simulated match.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTribunalQuickAccept(caseItem.id)}>
                        Quick Accept
                      </Button>
                      <Button size="sm" onClick={() => navigate(`/tribunal/${caseItem.id}`)}>
                        <Scale className="mr-1.5 h-3.5 w-3.5" />
                        Attend Hearing
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* News list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MailOpen className="mb-3 h-10 w-10" />
            <p className="text-sm font-medium">
              {filter === 'all'
                ? 'No news yet — start simulating!'
                : `No ${CATEGORY_CONFIG[filter as NewsCategory].label.toLowerCase()} news`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onRead={channel === 'alerts' ? markNewsRead : markEmailRead}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
