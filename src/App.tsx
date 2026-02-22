import { useEffect, useRef, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/HomePage'
import { NewGamePage } from '@/pages/NewGamePage'
import { GlobalSettingsPage } from '@/pages/GlobalSettingsPage'
import { LeaguePresetsPage } from '@/pages/LeaguePresetsPage'
import { CustomLeagueBuilderPage } from '@/pages/CustomLeagueBuilderPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SquadPage } from '@/pages/SquadPage'
import { MatchDayPage } from '@/pages/MatchDayPage'
import { LadderPage } from '@/pages/LadderPage'
import { LineupPage } from '@/pages/LineupPage'
import { GameplanPage } from '@/pages/GameplanPage'
import { PlayerProfilePage } from '@/pages/PlayerProfilePage'
import { SalaryCapPage } from '@/pages/SalaryCapPage'
import { FinancesPage } from '@/pages/FinancesPage'
import { ContractsPage } from '@/pages/ContractsPage'
import { DraftPage } from '@/pages/DraftPage'
import { ScoutingPage } from '@/pages/ScoutingPage'
import { StaffPage } from '@/pages/StaffPage'
import { StaffHiringPage } from '@/pages/StaffHiringPage'
import { TradePage } from '@/pages/TradePage'
import { ClubPage } from '@/pages/ClubPage'
import { TrainingPage } from '@/pages/TrainingPage'
import { OffseasonPage } from '@/pages/OffseasonPage'
import { ExpansionPage } from '@/pages/ExpansionPage'
import { InboxPage } from '@/pages/InboxPage'
import { LeaguePage } from '@/pages/LeaguePage'
import { CalendarPage } from '@/pages/CalendarPage'
import { ReservesPage } from '@/pages/ReservesPage'
import { ReservesMatchPreviewPage } from '@/pages/ReservesMatchPreviewPage'
import { ReservesDashboardPage } from '@/pages/reserves/ReservesDashboardPage'
import { ReservesSquadPage } from '@/pages/reserves/ReservesSquadPage'
import { ReservesLineupPage } from '@/pages/reserves/ReservesLineupPage'
import { ReservesDevelopmentPage } from '@/pages/reserves/ReservesDevelopmentPage'
import { ReservesFixturesPage } from '@/pages/reserves/ReservesFixturesPage'
import { ReservesStatsPage } from '@/pages/reserves/ReservesStatsPage'
import { ReservesStaffSubPage } from '@/pages/reserves/ReservesStaffSubPage'
import { StateLeaguePage } from '@/pages/StateLeaguePage'
import { BrownlowNightPage } from '@/pages/BrownlowNightPage'
import { AwardsNightPage } from '@/pages/AwardsNightPage'
import { AllAustralianNightPage } from '@/pages/AllAustralianNightPage'
import { AllAustralianSquadPage } from '@/pages/AllAustralianSquadPage'
import { AwardsHistoryPage } from '@/pages/AwardsHistoryPage'
import { WorldHubPage } from '@/pages/WorldHubPage'
import { YouthPathwayPage } from '@/pages/YouthPathwayPage'
import { YouthCompDetailPage } from '@/pages/YouthCompDetailPage'
import { YouthTournamentPage } from '@/pages/YouthTournamentPage'
import { YouthPlayerDetailPage } from '@/pages/YouthPlayerDetailPage'
import { WorldAllPlayersPage } from '@/pages/WorldAllPlayersPage'
import { PlayerDevelopmentReportPage } from '@/pages/PlayerDevelopmentReportPage'
import { InjuryReportPage } from '@/pages/InjuryReportPage'
import { CoachingJobsPage } from '@/pages/CoachingJobsPage'
import { MatchupPreviewPage } from '@/pages/MatchupPreviewPage'
import { GameSettingsPage } from '@/pages/GameSettingsPage'
import { TribunalPage } from '@/pages/TribunalPage'
import { PreseasonPreviewPage } from '@/pages/PreseasonPreviewPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { LeagueHistoryPage } from '@/pages/LeagueHistoryPage'
import { JumperManagementPage } from '@/pages/JumperManagementPage'
import { PlayerComparisonPage } from '@/pages/PlayerComparisonPage'
import { RulesPage } from '@/pages/RulesPage'
import { AgentRelationshipsPage } from '@/pages/AgentRelationshipsPage'
import { MembershipPage } from '@/pages/MembershipPage'
import { SponsorshipPage } from '@/pages/SponsorshipPage'
import { GlossaryPage } from '@/pages/GlossaryPage'
import { BettingPage } from '@/pages/BettingPage'
import { StateOfOriginPage } from '@/pages/StateOfOriginPage'
import { MatchViewerPage } from '@/pages/MatchViewerPage'
import { CoachesPage } from '@/pages/CoachesPage'
import { CoachProfilePage } from '@/pages/CoachProfilePage'
import { LegacyPage } from '@/pages/LegacyPage'
import { LeadershipPage } from '@/pages/LeadershipPage'
import { LeadershipSelectionPage } from '@/pages/LeadershipSelectionPage'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { MatchToastContainer } from '@/components/notifications/MatchToastContainer'

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
          <div className="w-full max-w-xl rounded-lg border border-red-500/40 bg-red-500/10 p-6">
            <h2 className="mb-2 text-lg font-bold text-red-700">Something went wrong</h2>
            <p className="mb-4 text-sm text-red-700/80">
              A render error occurred. Check the browser console for details.
            </p>
            <pre className="overflow-auto rounded bg-red-950/20 p-3 text-xs text-red-300">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              className="mt-4 rounded border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-500/30"
              onClick={() => this.setState({ error: null })}
            >
              Try to recover
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------

function GameRoutes() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const phase = useGameStore((s) => s.phase)
  const jumperManagement = useGameStore((s) => s.jumperManagement)
  const location = useLocation()
  const unemployed = phase !== 'setup' && !playerClubId

  if (unemployed) {
    return (
      <AppLayout>
        <Routes>
          <Route path="/jobs" element={<CoachingJobsPage />} />
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </AppLayout>
    )
  }

  if (jumperManagement.pending && location.pathname !== '/jumper-management') {
    return <Navigate to="/jumper-management" replace />
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jumper-management" element={<JumperManagementPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/squad" element={<SquadPage />} />
        <Route path="/fixture" element={<MatchDayPage />} />
        <Route path="/match" element={<MatchDayPage />} />
        <Route path="/ladder" element={<LadderPage />} />
        <Route path="/lineup" element={<LineupPage />} />
        <Route path="/gameplan" element={<GameplanPage />} />
        <Route path="/player" element={<PlayerProfilePage />} />
        <Route path="/player/:playerId" element={<PlayerProfilePage />} />
        <Route path="/players" element={<PlayerProfilePage />} />
        <Route path="/players/:playerId" element={<PlayerProfilePage />} />
        <Route path="/salary-cap" element={<SalaryCapPage />} />
        <Route path="/finances" element={<FinancesPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/agent-relationships" element={<AgentRelationshipsPage />} />
        <Route path="/sponsorship" element={<SponsorshipPage />} />
        <Route path="/draft" element={<DraftPage />} />
        <Route path="/scouting" element={<ScoutingPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/staff/hire" element={<StaffHiringPage />} />
        <Route path="/trades" element={<TradePage />} />
        <Route path="/club" element={<ClubPage />} />
        <Route path="/club/:clubId" element={<ClubPage />} />
        <Route path="/membership" element={<MembershipPage />} />
        <Route path="/squad/:clubId" element={<SquadPage />} />
        <Route path="/league" element={<LeaguePage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/history" element={<LeagueHistoryPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/reserves" element={<ReservesDashboardPage />} />
        <Route path="/reserves/squad" element={<ReservesSquadPage />} />
        <Route path="/reserves/lineup" element={<ReservesLineupPage />} />
        <Route path="/reserves/development" element={<ReservesDevelopmentPage />} />
        <Route path="/reserves/fixtures" element={<ReservesFixturesPage />} />
        <Route path="/reserves/stats" element={<ReservesStatsPage />} />
        <Route path="/reserves/staff" element={<ReservesStaffSubPage />} />
        <Route path="/reserves/match-preview" element={<ReservesMatchPreviewPage />} />
        <Route path="/reserves/legacy" element={<ReservesPage />} />
        <Route path="/state-leagues" element={<StateLeaguePage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/offseason" element={<OffseasonPage />} />
        <Route path="/expansion" element={<ExpansionPage />} />
        <Route path="/brownlow-night" element={<BrownlowNightPage />} />
        <Route path="/awards-night" element={<AwardsNightPage />} />
        <Route path="/all-australian-night" element={<AllAustralianNightPage />} />
        <Route path="/all-australian/squad" element={<AllAustralianSquadPage />} />
        <Route path="/awards-history" element={<AwardsHistoryPage />} />
        <Route path="/world-hub" element={<WorldHubPage />} />
        <Route path="/coaches" element={<CoachesPage />} />
        <Route path="/coaches/:coachId" element={<CoachProfilePage />} />
        <Route path="/youth-pathway" element={<YouthPathwayPage />} />
        <Route path="/youth-pathway/competition/:compId" element={<YouthCompDetailPage />} />
        <Route path="/youth-pathway/player/:playerId" element={<YouthPlayerDetailPage />} />
        <Route path="/youth-pathway/tournament" element={<YouthTournamentPage />} />
        <Route path="/world/players" element={<WorldAllPlayersPage />} />
        <Route path="/development-report" element={<PlayerDevelopmentReportPage />} />
        <Route path="/injury-report" element={<InjuryReportPage />} />
        <Route path="/compare" element={<PlayerComparisonPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/glossary" element={<GlossaryPage />} />
        <Route path="/legacy" element={<LegacyPage />} />
        <Route path="/compare/:playerAId" element={<PlayerComparisonPage />} />
        <Route path="/compare/:playerAId/:playerBId" element={<PlayerComparisonPage />} />
        <Route path="/leadership" element={<LeadershipPage />} />
        <Route path="/preseason-leadership" element={<LeadershipSelectionPage />} />
        <Route path="/matchup-preview" element={<MatchupPreviewPage />} />
        <Route path="/game-settings" element={<GameSettingsPage />} />
        <Route path="/tribunal" element={<TribunalPage />} />
        <Route path="/tribunal/:caseId" element={<TribunalPage />} />
        <Route path="/preseason-preview" element={<PreseasonPreviewPage />} />
        <Route path="/betting" element={<BettingPage />} />
        <Route path="/state-of-origin" element={<StateOfOriginPage />} />
        <Route path="/watch" element={<MatchViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

function AutoSaveEffect() {
  const currentScreen = useAppStore((s) => s.currentScreen)
  const globalSettings = useAppStore((s) => s.globalSettings)
  const saveCurrentGame = useAppStore((s) => s.saveCurrentGame)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (
      currentScreen === 'game' &&
      globalSettings.autoSaveEnabled &&
      globalSettings.autoSaveIntervalMinutes > 0
    ) {
      timerRef.current = setInterval(() => {
        const gameState = useGameStore.getState()
        if (gameState.meta.id) {
          const nextLastSaved = new Date().toISOString()
          void saveCurrentGame({
            ...gameState,
            meta: {
              ...gameState.meta,
              lastSaved: nextLastSaved,
            },
          })
        }
      }, globalSettings.autoSaveIntervalMinutes * 60 * 1000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentScreen, globalSettings.autoSaveEnabled, globalSettings.autoSaveIntervalMinutes, saveCurrentGame])

  return null
}

export default function App() {
  const currentScreen = useAppStore((s) => s.currentScreen)
  const initialized = useAppStore((s) => s.initialized)
  const initialize = useAppStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <AutoSaveEffect />
          {currentScreen === 'home' && <HomePage />}
          {currentScreen === 'new-game' && <NewGamePage />}
          {currentScreen === 'settings' && <GlobalSettingsPage />}
          {currentScreen === 'league-presets' && <LeaguePresetsPage />}
          {currentScreen === 'custom-league-builder' && <CustomLeagueBuilderPage />}
          {currentScreen === 'game' && <ErrorBoundary><GameRoutes /></ErrorBoundary>}
          {currentScreen === 'game' && <MatchToastContainer />}
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}
