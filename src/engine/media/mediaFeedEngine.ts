import type { NewsItem } from '@/types/game'

interface MediaOutlet {
  name: string
  type: 'tv' | 'radio' | 'newspaper' | 'internet'
}

const OUTLETS: MediaOutlet[] = [
  { name: 'Southern Cross Sports TV', type: 'tv' },
  { name: 'Boundary Line Network', type: 'tv' },
  { name: 'Prime Footy Vision', type: 'tv' },
  { name: '97.3 The Huddle', type: 'radio' },
  { name: 'Coastline Footy Radio', type: 'radio' },
  { name: 'AM 1188 Matchday', type: 'radio' },
  { name: 'The Ledger Post', type: 'newspaper' },
  { name: 'The Southern Football Times', type: 'newspaper' },
  { name: 'The Weekly Shout', type: 'newspaper' },
  { name: 'FrontBar Wire', type: 'internet' },
  { name: 'Drop Punt Daily', type: 'internet' },
  { name: 'Inside Arc Media', type: 'internet' },
]

const REPORTER_FIRST = [
  'Jordan', 'Casey', 'Alex', 'Morgan', 'Taylor', 'Sam', 'Cameron', 'Riley', 'Jamie', 'Hayden',
]

const REPORTER_LAST = [
  'Quinn', 'Mercer', 'Doyle', 'Harlow', 'Pike', 'Rennie', 'Fletcher', 'Keane', 'Barlow', 'Sutton',
]

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function pickDeterministic<T>(items: T[], seed: string): T {
  return items[hashString(seed) % items.length]
}

function buildReporterName(seed: string): string {
  const first = pickDeterministic(REPORTER_FIRST, `${seed}-first`)
  const last = pickDeterministic(REPORTER_LAST, `${seed}-last`)
  return `${first} ${last}`
}

function inferTone(item: NewsItem): NonNullable<NewsItem['media']>['tone'] {
  const text = `${item.headline} ${item.body}`.toLowerCase()
  if (text.includes('rumour') || text.includes('linked') || text.includes('monitoring')) return 'rumour'
  if (text.includes('controvers') || text.includes('tribunal') || text.includes('suspension')) return 'controversy'
  if (item.category === 'match') return 'match-report'
  if (item.category === 'trade' || item.category === 'contract') return 'analysis'
  return 'straight'
}

function cleanFactText(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > 150 ? `${trimmed.slice(0, 147)}...` : trimmed
}

function deriveFactBasis(item: NewsItem): string {
  const candidate = item.body || item.headline
  return cleanFactText(candidate || 'Update generated from verified league records.')
}

export function applyMediaCoverage(item: NewsItem): NewsItem {
  const existing = item.media
  if (existing?.reporterName && existing?.outletName) {
    return {
      ...item,
      media: {
        ...existing,
        factBasis: existing.factBasis || deriveFactBasis(item),
        tone: existing.tone || inferTone(item),
      },
    }
  }

  const seed = `${item.id}|${item.date}|${item.category}`
  const outlet = pickDeterministic(OUTLETS, `${seed}-outlet`)
  return {
    ...item,
    media: {
      reporterName: buildReporterName(seed),
      outletName: outlet.name,
      outletType: outlet.type,
      tone: inferTone(item),
      factBasis: deriveFactBasis(item),
      sourceNewsId: item.media?.sourceNewsId,
    },
  }
}

function buildDerivedStory(source: NewsItem, mode: 'match-report' | 'trade-drama' | 'contract-drama' | 'controversy' | 'rumour'): NewsItem | null {
  const fact = deriveFactBasis(source)
  const baseId = `media-derived-${mode}-${source.id}`

  switch (mode) {
    case 'match-report':
      if (source.category !== 'match') return null
      return {
        id: baseId,
        date: source.date,
        category: 'match',
        clubIds: [...source.clubIds],
        playerIds: [...source.playerIds],
        headline: `Match Report: ${source.headline}`,
        body: `Full-time report: ${fact}`,
        media: {
          reporterName: '',
          outletName: '',
          outletType: 'internet',
          tone: 'match-report',
          factBasis: fact,
          sourceNewsId: source.id,
        },
      }
    case 'trade-drama':
      if (source.category !== 'trade') return null
      return {
        id: baseId,
        date: source.date,
        category: 'trade',
        clubIds: [...source.clubIds],
        playerIds: [...source.playerIds],
        headline: `Trade Drama: ${source.headline}`,
        body: `League chatter has intensified, but confirmed details remain: ${fact}`,
        media: {
          reporterName: '',
          outletName: '',
          outletType: 'internet',
          tone: 'analysis',
          factBasis: fact,
          sourceNewsId: source.id,
        },
      }
    case 'contract-drama':
      if (source.category !== 'contract') return null
      return {
        id: baseId,
        date: source.date,
        category: 'contract',
        clubIds: [...source.clubIds],
        playerIds: [...source.playerIds],
        headline: `Contract Watch: ${source.headline}`,
        body: `Contract talks are under pressure. Confirmed element: ${fact}`,
        media: {
          reporterName: '',
          outletName: '',
          outletType: 'newspaper',
          tone: 'analysis',
          factBasis: fact,
          sourceNewsId: source.id,
        },
      }
    case 'controversy':
      if (source.category !== 'discipline' && source.category !== 'injury') return null
      return {
        id: baseId,
        date: source.date,
        category: source.category,
        clubIds: [...source.clubIds],
        playerIds: [...source.playerIds],
        headline: `Controversy: ${source.headline}`,
        body: `Debate is growing across the league. Verified detail: ${fact}`,
        media: {
          reporterName: '',
          outletName: '',
          outletType: 'tv',
          tone: 'controversy',
          factBasis: fact,
          sourceNewsId: source.id,
        },
      }
    case 'rumour':
      if (source.category !== 'trade' && source.category !== 'contract' && source.category !== 'general') return null
      return {
        id: baseId,
        date: source.date,
        category: source.category,
        clubIds: [...source.clubIds],
        playerIds: [...source.playerIds],
        headline: `Rumour Mill: ${source.headline}`,
        body: `Rumours continue to circulate. Confirmed baseline fact: ${fact}`,
        media: {
          reporterName: '',
          outletName: '',
          outletType: 'radio',
          tone: 'rumour',
          factBasis: fact,
          sourceNewsId: source.id,
        },
      }
  }
}

export function deriveMediaStories(source: NewsItem): NewsItem[] {
  if (source.id.startsWith('media-derived-')) return []

  const candidates: Array<'match-report' | 'trade-drama' | 'contract-drama' | 'controversy' | 'rumour'> = []

  if (source.category === 'match') candidates.push('match-report')
  if (source.category === 'trade') candidates.push('trade-drama', 'rumour')
  if (source.category === 'contract') candidates.push('contract-drama', 'rumour')
  if (source.category === 'discipline' || source.category === 'injury') candidates.push('controversy')
  if (source.category === 'general') candidates.push('rumour')

  return candidates
    .map((mode) => buildDerivedStory(source, mode))
    .filter((item): item is NewsItem => Boolean(item))
    .map((item) => applyMediaCoverage(item))
}
