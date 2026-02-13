import { NavLink, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useGameStore } from '@/stores/gameStore'
import { standaloneItems, navGroups, getActiveGroup } from './navConfig'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const club = clubs[playerClubId]
  const location = useLocation()
  const activeGroup = getActiveGroup(location.pathname)

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div
              className="h-8 w-8 rounded-full flex-shrink-0"
              style={{ backgroundColor: club?.colors.primary ?? '#666' }}
            />
            <span className="truncate text-sm font-semibold">
              {club?.abbreviation ?? 'AFL'}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {/* Standalone items */}
          {standaloneItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70'
                )
              }
            >
              {item.icon && <item.icon className="h-4 w-4 flex-shrink-0" />}
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}

          <Separator className="my-1" />

          {/* Group items */}
          {navGroups.map((group) => {
            const isActive = activeGroup?.id === group.id
            return (
              <NavLink
                key={group.id}
                to={group.defaultTo}
                className={cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70'
                )}
              >
                <group.icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>{group.label}</span>}
              </NavLink>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-sidebar-border px-3 py-3">
          <p className="text-xs text-muted-foreground">AFL Manager 2026</p>
        </div>
      )}
    </aside>
  )
}
