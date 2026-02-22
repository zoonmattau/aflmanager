import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SubNav } from './SubNav'
import { SimulationOverlay } from './SimulationOverlay'
import { MatchReadyModal } from '@/components/match/MatchReadyModal'
import { CoachmarkTour } from '@/components/onboarding/CoachmarkTour'
import { WhatsNextStrip } from './WhatsNextStrip'
import { SeasonTimelineBar } from './SeasonTimelineBar'

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <CoachmarkTour />
      <SimulationOverlay />
      <MatchReadyModal />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <SeasonTimelineBar />
        <SubNav />
        <WhatsNextStrip />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
