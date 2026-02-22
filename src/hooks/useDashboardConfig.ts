import { useState, useEffect } from 'react'

const LS_KEY = 'afl-dashboard-widgets'

export type DashboardWidgetId =
  | 'training'
  | 'dynasty'
  | 'club-intel'
  | 'info-row'
  | 'deadlines'
  | 'last-match'
  | 'legacy'

export interface DashboardWidget {
  id: DashboardWidgetId
  label: string
  description: string
  visible: boolean
  order: number // 0-based ascending
}

const DEFAULTS: DashboardWidget[] = [
  { id: 'training',   label: 'Training Overview',  description: 'Weekly load & focus coverage',          visible: true, order: 0 },
  { id: 'dynasty',    label: 'Dynasty Quests',      description: 'Active career challenges',              visible: true, order: 1 },
  { id: 'club-intel', label: 'Club Intelligence',   description: 'Team pulse, cap & list snapshot',      visible: true, order: 2 },
  { id: 'info-row',   label: 'Actions & Info',      description: 'Recommended actions, finances, media', visible: true, order: 3 },
  { id: 'deadlines',  label: 'Upcoming Deadlines',  description: 'Countdown to key events',              visible: true, order: 4 },
  { id: 'last-match', label: 'Last Match',          description: 'Most recent match result',             visible: true, order: 5 },
  { id: 'legacy',     label: 'Legacy & Dynasty',    description: 'Long-term club heritage score',        visible: true, order: 6 },
]

export function useDashboardConfig() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return DEFAULTS
      const saved = JSON.parse(raw) as DashboardWidget[]
      // Merge: add new defaults not present in saved state
      const ids = new Set(saved.map((w) => w.id))
      return [...saved, ...DEFAULTS.filter((d) => !ids.has(d.id))]
    } catch {
      return DEFAULTS
    }
  })

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(widgets))
  }, [widgets])

  const setVisible = (id: DashboardWidgetId, visible: boolean) =>
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, visible } : w)))

  const reorder = (orderedIds: DashboardWidgetId[]) =>
    setWidgets((ws) => ws.map((w) => ({ ...w, order: orderedIds.indexOf(w.id) })))

  const reset = () => setWidgets(DEFAULTS)

  const sorted = [...widgets].sort((a, b) => a.order - b.order)
  return { widgets: sorted, setVisible, reorder, reset }
}
