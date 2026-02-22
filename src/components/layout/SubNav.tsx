import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { getActiveGroup } from './navConfig'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMemo } from 'react'
import { useNavBadges } from '@/hooks/useNavBadges'

export function SubNav() {
  const { pathname } = useLocation()
  const group = getActiveGroup(pathname)
  const phase = useGameStore((s) => s.phase)
  const currentRound = useGameStore((s) => s.currentRound)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const viewedTeamClubId = useAppStore((s) => s.viewedTeamClubId)
  const badges = useNavBadges()
  const setViewedTeamClubId = useAppStore((s) => s.setViewedTeamClubId)

  const isTeamGroup = group?.id === 'team'
  const effectiveClubId = isTeamGroup ? (viewedTeamClubId ?? playerClubId) : playerClubId
  const isOwnClub = effectiveClubId === playerClubId

  const sortedClubs = useMemo(() => {
    return Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name))
  }, [clubs])

  if (!group) return null

  const items = group.items.filter((item) => {
    if (item.hideAfterRound !== undefined) {
      if (phase === 'regular-season' && currentRound > item.hideAfterRound) return false
    }
    if (item.requiresOwnClub && !isOwnClub) return false
    return true
  })

  if (items.length <= 1 && !isTeamGroup) return null

  return (
    <div className="border-b bg-background">
      {isTeamGroup && sortedClubs.length > 0 && (
        <div className="px-4 pt-2 pb-1">
          <Select
            value={effectiveClubId}
            onValueChange={(id) => setViewedTeamClubId(id === playerClubId ? null : id)}
          >
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedClubs.map((club) => (
                <SelectItem key={club.id} value={club.id} className="text-xs">
                  {club.name}
                  {club.id === playerClubId ? ' ★' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {items.length > 1 && (
        <nav className="flex gap-1 px-4">
          {items.map((item) => {
            const isActive = pathname === item.to || pathname.startsWith(item.to + '/')
            const badge = badges[item.to]
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'relative flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors',
                  'hover:text-foreground',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
                {badge && (
                  badge.kind === 'dot' ? (
                    <span
                      className={cn(
                        'ml-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full',
                        badge.color === 'red' ? 'bg-red-500'
                          : badge.color === 'amber' ? 'bg-amber-500'
                          : 'bg-blue-500',
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        'ml-1 inline-flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white',
                        badge.color === 'red' ? 'bg-red-500'
                          : badge.color === 'amber' ? 'bg-amber-500'
                          : 'bg-blue-500',
                      )}
                    >
                      {badge.n > 99 ? '99+' : badge.n}
                    </span>
                  )
                )}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                )}
              </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}
