/**
 * useNavBadges — reactive navigation badge system.
 *
 * Returns a map of route-path → badge descriptor derived from game state.
 * Consumed by Sidebar (group-level roll-up) and SubNav (per-item).
 *
 * Badge kinds:
 *   dot   — coloured attention dot, no number (e.g. "leadership pending")
 *   count — coloured numeric pill (e.g. "3 pending trades")
 *
 * Colors (priority order for roll-ups):
 *   red   — urgent, requires immediate action (tribunal cases)
 *   amber — attention, something needs to be configured (lineup, leadership)
 *   blue  — informational, response required but not time-critical
 */

import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeColor = 'red' | 'amber' | 'blue'

export type NavBadge =
  | { kind: 'count'; n: number; color: BadgeColor }
  | { kind: 'dot'; color: BadgeColor }

export type NavBadgeMap = Record<string, NavBadge>

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNavBadges(): NavBadgeMap {
  const phase          = useGameStore((s) => s.phase)
  const playerClubId   = useGameStore((s) => s.playerClubId)
  const newsLog        = useGameStore((s) => s.newsLog)
  const emailLog       = useGameStore((s) => s.emailLog)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const leadershipPending = useGameStore((s) => s.leadershipPending)
  const tradeInbox     = useGameStore((s) => s.tradeInbox)
  const negotiations   = useGameStore((s) => s.negotiations)
  const negotiationThreads = useGameStore((s) => s.negotiationThreads)
  const tribunalInbox  = useGameStore((s) => s.tribunalInbox)
  const season         = useGameStore((s) => s.season)
  const currentRound   = useGameStore((s) => s.currentRound)

  return useMemo((): NavBadgeMap => {
    if (!playerClubId) return {}

    const map: NavBadgeMap = {}

    // ── Dashboard: unread news + email ──────────────────────────────────────
    const unread =
      newsLog.filter((n) => !n.read).length +
      emailLog.filter((n) => !n.read).length
    if (unread > 0) {
      map['/'] = { kind: 'count', n: unread, color: 'blue' }
    }

    // ── Leadership: appointment required before Round 1 ─────────────────────
    if (leadershipPending) {
      map['/leadership'] = { kind: 'dot', color: 'amber' }
    }

    // ── Lineup: not set when a match is due ─────────────────────────────────
    if (
      (phase === 'regular-season' || phase === 'finals') &&
      !selectedLineup
    ) {
      const round = season.rounds?.[currentRound]
      const hasUnplayedMatch = round?.fixtures?.some(
        (f) =>
          (f.homeClubId === playerClubId || f.awayClubId === playerClubId) &&
          f.result === null,
      )
      if (hasUnplayedMatch) {
        map['/lineup'] = { kind: 'dot', color: 'amber' }
      }
    }

    // ── Trades: pending-user offers in trade inbox ────────────────────────────
    const pendingOffers = tradeInbox.filter(
      (i) => i.offer.status === 'pending-user',
    ).length

    // Negotiation threads awaiting user reply (last round status = 'pending-user')
    const pendingThreads = negotiationThreads.filter(
      (t) =>
        t.playerClubId === playerClubId &&
        t.status === 'active' &&
        t.rounds.length > 0 &&
        t.rounds[t.rounds.length - 1].status === 'pending-user',
    ).length

    const totalTrades = pendingOffers + pendingThreads
    if (totalTrades > 0) {
      map['/trades'] = { kind: 'count', n: totalTrades, color: 'blue' }
    }

    // ── Contracts: negotiations with counter-offer awaiting user response ────
    const pendingContracts = Object.values(negotiations?.active ?? {}).filter(
      (n) => n.clubId === playerClubId && n.status === 'counter-offered',
    ).length
    if (pendingContracts > 0) {
      map['/contracts'] = { kind: 'count', n: pendingContracts, color: 'blue' }
    }

    // ── Tribunal: cases requiring user decision ──────────────────────────────
    const pendingTribunal = tribunalInbox.filter(
      (c) => c.status === 'pending-user',
    ).length
    if (pendingTribunal > 0) {
      map['/tribunal'] = { kind: 'count', n: pendingTribunal, color: 'red' }
    }

    return map
  }, [
    phase,
    playerClubId,
    newsLog,
    emailLog,
    selectedLineup,
    leadershipPending,
    tradeInbox,
    negotiations,
    negotiationThreads,
    tribunalInbox,
    season,
    currentRound,
  ])
}

// ---------------------------------------------------------------------------
// Aggregation helper (used by Sidebar to roll up group badges)
// ---------------------------------------------------------------------------

const COLOR_PRIORITY: Record<BadgeColor, number> = { red: 3, amber: 2, blue: 1 }

/**
 * Given a list of badges from a group's items, return a single representative
 * badge: highest-priority colour, summing counts where applicable.
 */
export function aggregateBadges(badges: (NavBadge | undefined)[]): NavBadge | null {
  let totalCount = 0
  let topColor: BadgeColor | null = null
  let hasDot = false

  for (const b of badges) {
    if (!b) continue
    const priority = COLOR_PRIORITY[b.color]
    if (!topColor || priority > COLOR_PRIORITY[topColor]) {
      topColor = b.color
    }
    if (b.kind === 'count') {
      totalCount += b.n
    } else {
      hasDot = true
    }
  }

  if (!topColor) return null
  if (totalCount > 0) return { kind: 'count', n: totalCount, color: topColor }
  if (hasDot) return { kind: 'dot', color: topColor }
  return null
}
