import {
  LayoutDashboard,
  Users,
  Swords,
  DollarSign,
  Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon?: LucideIcon
}

export interface NavGroup {
  id: string
  label: string
  icon: LucideIcon
  defaultTo: string
  matchPaths: string[]
  items: NavItem[]
}

export const standaloneItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
]

export const navGroups: NavGroup[] = [
  {
    id: 'team',
    label: 'Team',
    icon: Users,
    defaultTo: '/squad',
    matchPaths: ['/squad', '/lineup', '/gameplan', '/training', '/reserves'],
    items: [
      { to: '/squad', label: 'Squad' },
      { to: '/lineup', label: 'Lineup' },
      { to: '/gameplan', label: 'Gameplan' },
      { to: '/training', label: 'Training' },
      { to: '/reserves', label: 'Reserves' },
    ],
  },
  {
    id: 'season',
    label: 'Season',
    icon: Swords,
    defaultTo: '/match',
    matchPaths: ['/match', '/ladder', '/league', '/calendar', '/state-leagues', '/offseason'],
    items: [
      { to: '/match', label: 'Match Day' },
      { to: '/ladder', label: 'Ladder' },
      { to: '/league', label: 'League' },
      { to: '/calendar', label: 'Calendar' },
      { to: '/state-leagues', label: 'State Leagues' },
      { to: '/offseason', label: 'Offseason' },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    icon: DollarSign,
    defaultTo: '/salary-cap',
    matchPaths: ['/salary-cap', '/contracts', '/trades', '/draft', '/scouting', '/staff'],
    items: [
      { to: '/salary-cap', label: 'Salary Cap' },
      { to: '/contracts', label: 'Contracts' },
      { to: '/trades', label: 'Trades' },
      { to: '/draft', label: 'Draft' },
      { to: '/scouting', label: 'Scouting' },
      { to: '/staff', label: 'Staff' },
    ],
  },
  {
    id: 'club',
    label: 'Club',
    icon: Building2,
    defaultTo: '/club',
    matchPaths: ['/club', '/expansion'],
    items: [
      { to: '/club', label: 'Club' },
      { to: '/expansion', label: 'Expansion' },
    ],
  },
]

export function getActiveGroup(pathname: string): NavGroup | null {
  for (const group of navGroups) {
    if (group.matchPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return group
    }
  }
  return null
}
