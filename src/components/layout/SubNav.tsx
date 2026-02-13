import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getActiveGroup } from './navConfig'

export function SubNav() {
  const { pathname } = useLocation()
  const group = getActiveGroup(pathname)

  if (!group) return null

  return (
    <nav className="flex gap-1 border-b bg-background px-4">
      {group.items.map((item) => {
        const isActive = pathname === item.to || pathname.startsWith(item.to + '/')
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              'relative px-3 py-2 text-sm font-medium transition-colors',
              'hover:text-foreground',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground'
            )}
          >
            {item.label}
            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
