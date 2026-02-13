import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { AppLayout } from '@/components/layout/AppLayout'
import { NewGamePage } from '@/pages/NewGamePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SquadPage } from '@/pages/SquadPage'
import { MatchDayPage } from '@/pages/MatchDayPage'
import { LadderPage } from '@/pages/LadderPage'
import { LineupPage } from '@/pages/LineupPage'
import { GameplanPage } from '@/pages/GameplanPage'
import { PlayerProfilePage } from '@/pages/PlayerProfilePage'
import { SalaryCapPage } from '@/pages/SalaryCapPage'
import { ContractsPage } from '@/pages/ContractsPage'
import { DraftPage } from '@/pages/DraftPage'
import { ScoutingPage } from '@/pages/ScoutingPage'
import { StaffPage } from '@/pages/StaffPage'
import { TradePage } from '@/pages/TradePage'
import { ClubPage } from '@/pages/ClubPage'
import { TrainingPage } from '@/pages/TrainingPage'
import { OffseasonPage } from '@/pages/OffseasonPage'
import { useGameStore } from '@/stores/gameStore'

export default function App() {
  const phase = useGameStore((s) => s.phase)

  return (
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          {phase === 'setup' ? (
            <Routes>
              <Route path="*" element={<NewGamePage />} />
            </Routes>
          ) : (
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/squad" element={<SquadPage />} />
                <Route path="/match" element={<MatchDayPage />} />
                <Route path="/ladder" element={<LadderPage />} />
                <Route path="/lineup" element={<LineupPage />} />
                <Route path="/gameplan" element={<GameplanPage />} />
                <Route path="/player/:playerId" element={<PlayerProfilePage />} />
                <Route path="/salary-cap" element={<SalaryCapPage />} />
                <Route path="/contracts" element={<ContractsPage />} />
                <Route path="/draft" element={<DraftPage />} />
                <Route path="/scouting" element={<ScoutingPage />} />
                <Route path="/staff" element={<StaffPage />} />
                <Route path="/trades" element={<TradePage />} />
                <Route path="/club" element={<ClubPage />} />
                <Route path="/training" element={<TrainingPage />} />
                <Route path="/offseason" element={<OffseasonPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          )}
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}
