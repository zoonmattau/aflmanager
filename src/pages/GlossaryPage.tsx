/**
 * GlossaryPage — searchable, filterable reference for all AFL management terms.
 *
 * Definitions automatically adapt to reflect which rules and realism settings
 * are active in the current game. When a term refers to a disabled mechanic,
 * a contextual note is displayed alongside the standard definition.
 */

import { useId, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useGameStore } from '@/stores/gameStore'
import {
  GLOSSARY,
  CATEGORY_LABELS,
  searchGlossary,
  type GlossaryCategory,
  type GlossaryEntry,
} from '@/data/glossary'
import type { RealismSettings, GameSettings } from '@/types/game'
import { BookOpen, Search, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Setting-aware helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given entry's associated rule is currently active
 * (or if the entry has no setting dependency).
 */
function isRuleActive(entry: GlossaryEntry, settings: GameSettings | null): boolean {
  if (!entry.settingKey || !settings) return true
  if (entry.settingKey === 'salaryCap') return settings.salaryCap
  return settings.realism[entry.settingKey as keyof RealismSettings] as boolean
}

// ---------------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------------

interface EntryCardProps {
  entry: GlossaryEntry
  settings: GameSettings | null
  isAnchorTarget: boolean
}

function EntryCard({ entry, settings, isAnchorTarget }: EntryCardProps) {
  const active = isRuleActive(entry, settings)

  return (
    <div
      id={entry.id}
      className={[
        'rounded-lg border p-4 scroll-mt-24 space-y-2 transition-colors',
        isAnchorTarget ? 'ring-2 ring-primary/40 bg-primary/5' : 'bg-card',
        !active ? 'opacity-75' : '',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="text-sm font-semibold leading-snug flex-1 min-w-0">
          {entry.term}
        </h3>
        <Badge
          variant="secondary"
          className="text-[10px] shrink-0"
        >
          {CATEGORY_LABELS[entry.category]}
        </Badge>
        {!active && (
          <Badge variant="outline" className="text-[10px] border-muted-foreground/40 shrink-0">
            Not active
          </Badge>
        )}
      </div>

      {/* Aliases */}
      {entry.aliases && entry.aliases.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70">
          Also known as: {entry.aliases.join(', ')}
        </p>
      )}

      {/* Definition body */}
      <div className="space-y-1.5">
        {entry.body.map((paragraph, i) => (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Settings note */}
      {!active && entry.disabledNote && (
        <div className="rounded-md border border-muted-foreground/20 bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground/80">Current game note: </span>
            {entry.disabledNote}
          </p>
        </div>
      )}

      {/* Learn more link */}
      {entry.learnMorePath && (
        <a
          href={entry.learnMorePath}
          className="inline-block text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          {entry.learnMoreLabel ?? 'Learn more'}
        </a>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  category: GlossaryCategory
  entries: GlossaryEntry[]
  settings: GameSettings | null
  anchorId: string | null
}

function CategorySection({ category, entries, settings, anchorId }: CategorySectionProps) {
  if (entries.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {CATEGORY_LABELS[category]}
        </h2>
        <Separator className="flex-1" />
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            settings={settings}
            isAnchorTarget={anchorId === entry.id}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: GlossaryCategory[] = [
  'salary-cap',
  'draft',
  'player-lists',
  'contracts',
  'match-rules',
  'season-finals',
  'operations',
]

export function GlossaryPage() {
  const searchId = useId()
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)

  // Extract anchor from URL hash (e.g. /glossary#aav → "aav")
  const anchorId = location.hash ? location.hash.slice(1) : null

  // Game settings — may be absent if accessed from home screen
  const settings = useGameStore((s) => s.settings as GameSettings | null)

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<GlossaryCategory | 'all'>('all')

  const filtered = useMemo(() => {
    const bySearch = searchGlossary(query)
    if (activeCategory === 'all') return bySearch
    return bySearch.filter((e) => e.category === activeCategory)
  }, [query, activeCategory])

  // Group by category in a stable order
  const grouped = useMemo(() => {
    const map = new Map<GlossaryCategory, GlossaryEntry[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const entry of filtered) {
      map.get(entry.category)?.push(entry)
    }
    return map
  }, [filtered])

  const totalCount = filtered.length

  function clearFilters() {
    setQuery('')
    setActiveCategory('all')
  }

  const hasFilters = query.trim() !== '' || activeCategory !== 'all'

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      {/* Page header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Glossary</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Definitions for AFL management terms used throughout the application.
          {settings
            ? ' Entries reflect your current game rules and realism settings.'
            : ' Start a game to see settings-specific notes.'}
        </p>
      </div>

      {/* Search + filters */}
      <div className="space-y-3 sticky top-0 z-10 bg-background pb-2 pt-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            id={searchId}
            placeholder="Search terms, abbreviations, or definitions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setActiveCategory('all')}
          >
            All
          </Button>
          {CATEGORY_ORDER.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </Button>
          ))}
        </div>

        {/* Result count + clear */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalCount === GLOSSARY.length
              ? `${totalCount} terms`
              : `${totalCount} of ${GLOSSARY.length} terms`}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-primary hover:underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Entries */}
      <div ref={contentRef} className="space-y-8">
        {totalCount === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No terms match your search. Try a different query or clear the category filter.
          </div>
        ) : (
          CATEGORY_ORDER.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              entries={grouped.get(cat) ?? []}
              settings={settings}
              anchorId={anchorId}
            />
          ))
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground/60 pt-4 border-t">
        Definitions reflect standard AFL rules unless otherwise noted. Terms marked "Not active" refer to mechanics disabled in your current game settings.
      </p>
    </div>
  )
}
