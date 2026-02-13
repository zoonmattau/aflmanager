import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
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
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Category display config
// ---------------------------------------------------------------------------

type NewsCategory = NewsItem['category']

const CATEGORY_CONFIG: Record<NewsCategory, { icon: React.ElementType; color: string; label: string }> = {
  match:    { icon: Swords,          color: 'bg-blue-500/15 text-blue-400',   label: 'Match' },
  trade:    { icon: ArrowLeftRight,  color: 'bg-purple-500/15 text-purple-400', label: 'Trade' },
  injury:   { icon: AlertTriangle,   color: 'bg-red-500/15 text-red-400',    label: 'Injury' },
  draft:    { icon: GraduationCap,   color: 'bg-green-500/15 text-green-400', label: 'Draft' },
  contract: { icon: FileText,        color: 'bg-amber-500/15 text-amber-400', label: 'Contract' },
  general:  { icon: Newspaper,       color: 'bg-zinc-500/15 text-zinc-400',  label: 'General' },
}

const ALL_CATEGORIES: NewsCategory[] = ['match', 'trade', 'injury', 'draft', 'contract', 'general']

// ---------------------------------------------------------------------------
// News row
// ---------------------------------------------------------------------------

function NewsRow({
  item,
  expanded,
  onToggle,
}: {
  item: NewsItem
  expanded: boolean
  onToggle: () => void
}) {
  const markNewsRead = useGameStore((s) => s.markNewsRead)
  const config = CATEGORY_CONFIG[item.category]
  const Icon = config.icon
  const isUnread = !item.read

  const handleClick = () => {
    if (isUnread) markNewsRead(item.id)
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
        <p className="ml-[calc(0.625rem+0.75rem+1.75rem+0.75rem)] truncate text-xs text-muted-foreground">
          {item.body}
        </p>
      )}
      {expanded && (
        <div className="ml-[calc(0.625rem+0.75rem+1.75rem+0.75rem)] mt-1 space-y-2">
          <p className="text-sm text-foreground">{item.body}</p>
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
  const newsLog = useGameStore((s) => s.newsLog)
  const markAllNewsRead = useGameStore((s) => s.markAllNewsRead)
  const [filter, setFilter] = useState<'all' | NewsCategory>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...newsLog].reverse(),
    [newsLog],
  )

  const filtered = useMemo(
    () => (filter === 'all' ? sorted : sorted.filter((n) => n.category === filter)),
    [sorted, filter],
  )

  const totalUnread = useMemo(() => newsLog.filter((n) => !n.read).length, [newsLog])

  const unreadByCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cat of ALL_CATEGORIES) counts[cat] = 0
    for (const item of newsLog) {
      if (!item.read) counts[item.category] = (counts[item.category] ?? 0) + 1
    }
    return counts
  }, [newsLog])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}
          </p>
        </div>
        {totalUnread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllNewsRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

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
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
