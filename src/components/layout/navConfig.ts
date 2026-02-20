import {
  LayoutDashboard,
  Users,
  Swords,
  DollarSign,
  Building2,
  Settings,
  Handshake,
  Globe,
  BookOpen,
  Shirt,
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
    matchPaths: ['/squad', '/lineup', '/gameplan', '/training', '/injury-report', '/jumper-management', '/compare'],
    items: [
      { to: '/squad', label: 'Squad' },
      { to: '/lineup', label: 'Lineup' },
      { to: '/gameplan', label: 'Gameplan' },
      { to: '/training', label: 'Training' },
      { to: '/injury-report', label: 'Injuries' },
      { to: '/compare', label: 'Compare' },
      { to: '/jumper-management', label: 'Jumper Numbers' },
    ],
  },
  {
    id: 'reserves',
    label: 'Reserves',
    icon: Shirt,
    defaultTo: '/reserves',
    matchPaths: ['/reserves'],
    items: [
      { to: '/reserves', label: 'Dashboard' },
      { to: '/reserves/squad', label: 'Squad' },
      { to: '/reserves/lineup', label: 'Lineup & Tactics' },
      { to: '/reserves/development', label: 'Development' },
      { to: '/reserves/fixtures', label: 'Fixtures & Ladder' },
      { to: '/reserves/stats', label: 'Stats' },
      { to: '/reserves/staff', label: 'Staff' },
      { to: '/reserves/match-preview', label: 'Match Preview' },
    ],
  },
  {
    id: 'season',
    label: 'Season',
    icon: Swords,
    defaultTo: '/fixture',
    matchPaths: ['/fixture', '/match', '/ladder', '/calendar', '/tribunal', '/preseason-preview', '/offseason', '/betting', '/state-of-origin'],
    items: [
      { to: '/fixture', label: 'Fixture' },
      { to: '/ladder', label: 'Ladder' },
      { to: '/calendar', label: 'Calendar' },
      { to: '/tribunal', label: 'Tribunal' },
      { to: '/preseason-preview', label: 'Season Preview' },
      { to: '/offseason', label: 'Offseason' },
      { to: '/betting', label: 'Betting' },
      { to: '/state-of-origin', label: 'State of Origin' },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    icon: DollarSign,
    defaultTo: '/salary-cap',
    matchPaths: ['/salary-cap', '/contracts', '/trades', '/draft', '/scouting', '/staff', '/agent-relationships', '/sponsorship', '/finances'],
    items: [
      { to: '/finances', label: 'Finances' },
      { to: '/salary-cap', label: 'Cap Dashboard' },
      { to: '/contracts', label: 'Contracts' },
      { to: '/trades', label: 'Trades' },
      { to: '/draft', label: 'Draft' },
      { to: '/scouting', label: 'Scouting' },
      { to: '/staff', label: 'Staff' },
      { to: '/agent-relationships', label: 'Agents' },
      { to: '/sponsorship', label: 'Sponsorship', icon: Handshake },
    ],
  },
  {
    id: 'club',
    label: 'Club',
    icon: Building2,
    defaultTo: '/club',
    matchPaths: ['/club', '/membership'],
    items: [
      { to: '/club', label: 'Club' },
      { to: '/membership', label: 'Membership' },
    ],
  },
  {
    id: 'world',
    label: 'World',
    icon: Globe,
    defaultTo: '/world-hub',
    matchPaths: ['/world-hub', '/league', '/state-leagues', '/development-report', '/youth-pathway', '/expansion'],
    items: [
      { to: '/world-hub', label: 'Hub' },
      { to: '/league', label: 'League' },
      { to: '/state-leagues', label: 'State Leagues' },
      { to: '/youth-pathway', label: 'Youth Pathway' },
      { to: '/development-report', label: 'Dev Report' },
      { to: '/expansion', label: 'Expansion' },
    ],
  },
  {
    id: 'history',
    label: 'History',
    icon: BookOpen,
    defaultTo: '/records',
    matchPaths: ['/records', '/history', '/awards-history', '/all-australian', '/rules', '/glossary'],
    items: [
      { to: '/records', label: 'Records' },
      { to: '/history', label: 'History' },
      { to: '/awards-history', label: 'Awards History' },
      { to: '/all-australian/squad', label: 'AA Squad' },
      { to: '/rules', label: 'Rulebook' },
      { to: '/glossary', label: 'Glossary' },
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
