import {
  LayoutDashboard,
  Users,
  Swords,
  DollarSign,
  Building2,
  Settings,
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
    matchPaths: ['/squad', '/lineup', '/gameplan', '/training', '/reserves', '/reserves/match-preview', '/injury-report', '/jumper-management'],
    items: [
      { to: '/squad', label: 'Squad' },
      { to: '/jumper-management', label: 'Jumper Numbers' },
      { to: '/lineup', label: 'Lineup' },
      { to: '/gameplan', label: 'Gameplan' },
      { to: '/training', label: 'Training' },
      { to: '/reserves', label: 'Reserves' },
      { to: '/reserves/match-preview', label: 'Reserves Preview' },
      { to: '/injury-report', label: 'Injuries' },
    ],
  },
  {
    id: 'season',
    label: 'Season',
    icon: Swords,
    defaultTo: '/fixture',
    matchPaths: ['/fixture', '/match', '/ladder', '/league', '/records', '/calendar', '/state-leagues', '/offseason', '/development-report', '/tribunal', '/preseason-preview'],
    items: [
      { to: '/fixture', label: 'Fixture' },
      { to: '/ladder', label: 'Ladder' },
      { to: '/league', label: 'League' },
      { to: '/records', label: 'Records' },
      { to: '/calendar', label: 'Calendar' },
      { to: '/tribunal', label: 'Tribunal' },
      { to: '/state-leagues', label: 'State Leagues' },
      { to: '/preseason-preview', label: 'Season Preview' },
      { to: '/offseason', label: 'Offseason' },
      { to: '/development-report', label: 'Dev Report' },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    icon: DollarSign,
    defaultTo: '/salary-cap',
    matchPaths: ['/salary-cap', '/contracts', '/trades', '/draft', '/scouting', '/staff'],
    items: [
      { to: '/salary-cap', label: 'Cap Dashboard' },
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
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    defaultTo: '/game-settings',
    matchPaths: ['/game-settings'],
    items: [
      { to: '/game-settings', label: 'Game Settings' },
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
