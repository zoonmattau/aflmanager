import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { AppLayout } from '@/components/layout/AppLayout'
import { SetupPage } from '@/pages/SetupPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SquadPage } from '@/pages/SquadPage'
import { MatchDayPage } from '@/pages/MatchDayPage'
import { LadderPage } from '@/pages/LadderPage'
import { useGameStore } from '@/stores/gameStore'

export default function App() {
  const phase = useGameStore((s) => s.phase)

  return (
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          {phase === 'setup' ? (
            <Routes>
              <Route path="*" element={<SetupPage />} />
            </Routes>
          ) : (
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/squad" element={<SquadPage />} />
                <Route path="/match" element={<MatchDayPage />} />
                <Route path="/ladder" element={<LadderPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          )}
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}
