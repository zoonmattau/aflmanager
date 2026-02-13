import { useState, useMemo } from 'react'
import type { GameSettings } from '@/types/game'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronLeft,
  User,
  Shield,
  Settings,
  CheckCircle2,
  Search,
  RotateCcw,
  Play,
  MapPin,
} from 'lucide-react'
import clubsData from '@/data/clubs.json'

interface ClubData {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  homeGround: string
  colors: { primary: string; secondary: string; tertiary?: string }
}

const STEPS = [
  { number: 1, label: 'Manager', icon: User },
  { number: 2, label: 'Club', icon: Shield },
  { number: 3, label: 'Settings', icon: Settings },
  { number: 4, label: 'Confirm', icon: CheckCircle2 },
] as const

const DEFAULT_SETTINGS: GameSettings = {
  salaryCap: true,
  salaryCapAmount: 15500000,
  boardPressure: true,
  injuryFrequency: 'medium',
  developmentSpeed: 'normal',
  simSpeed: 'normal',
}

export function NewGamePage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [managerName, setManagerName] = useState('')
  const [saveName, setSaveName] = useState('My Career')
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [clubSearch, setClubSearch] = useState('')
  const [settings, setSettings] = useState<GameSettings>({ ...DEFAULT_SETTINGS })

  const initializeGame = useGameStore((s) => s.initializeGame)
  const clubs = clubsData as ClubData[]

  const selectedClubData = useMemo(
    () => clubs.find((c) => c.id === selectedClub) ?? null,
    [clubs, selectedClub]
  )

  const filteredClubs = useMemo(() => {
    if (!clubSearch.trim()) return clubs
    const query = clubSearch.toLowerCase()
    return clubs.filter(
      (club) =>
        club.name.toLowerCase().includes(query) ||
        club.fullName.toLowerCase().includes(query) ||
        club.mascot.toLowerCase().includes(query) ||
        club.homeGround.toLowerCase().includes(query)
    )
  }, [clubs, clubSearch])

  const canAdvance = (step: number): boolean => {
    switch (step) {
      case 1:
        return saveName.trim().length > 0
      case 2:
        return selectedClub !== null
      case 3:
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (canAdvance(currentStep) && currentStep < 4) {
      setCurrentStep((s) => s + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1)
    }
  }

  const handleStartGame = () => {
    if (!selectedClub) return
    initializeGame(selectedClub, saveName)
  }

  const handleResetSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS })
  }

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            AFL Manager
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Create a new career</p>
        </div>
      </div>

      {/* Step Indicators */}
      <div className="border-b border-zinc-800 bg-zinc-950/50">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          {STEPS.map((step, i) => {
            const StepIcon = step.icon
            const isActive = currentStep === step.number
            const isCompleted = currentStep > step.number
            return (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                      isActive
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : isCompleted
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                          : 'border-zinc-700 bg-zinc-800/50 text-zinc-500'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium transition-colors duration-300',
                      isActive
                        ? 'text-blue-400'
                        : isCompleted
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-3 h-px w-12 transition-colors duration-300 sm:mx-6 sm:w-20',
                      currentStep > step.number ? 'bg-emerald-500/50' : 'bg-zinc-700'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-8">
        <div className="w-full max-w-4xl">
          {/* Step 1: Manager Profile */}
          {currentStep === 1 && (
            <div className="mx-auto max-w-md space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Manager Profile</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Set up your identity and save file
                </p>
              </div>

              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Details</CardTitle>
                  <CardDescription>
                    Enter your name and choose a save name for this career.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="managerName" className="text-zinc-300">
                      Manager Name
                      <span className="ml-1 text-xs text-zinc-500">(optional)</span>
                    </Label>
                    <Input
                      id="managerName"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      placeholder="Enter your name"
                      className="border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="saveName" className="text-zinc-300">
                      Save Name
                      <span className="ml-1 text-xs text-red-400">*</span>
                    </Label>
                    <Input
                      id="saveName"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="My Career"
                      className="border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500"
                    />
                    {saveName.trim().length === 0 && (
                      <p className="text-xs text-red-400">A save name is required</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Select Club */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Select Your Club</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Choose the club you want to manage
                </p>
              </div>

              {/* Search */}
              <div className="mx-auto max-w-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={clubSearch}
                    onChange={(e) => setClubSearch(e.target.value)}
                    placeholder="Search clubs..."
                    className="border-zinc-700 bg-zinc-800/50 pl-9 text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>

              {/* Club Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredClubs.map((club) => {
                  const isSelected = selectedClub === club.id
                  return (
                    <Card
                      key={club.id}
                      className={cn(
                        'cursor-pointer border-2 transition-all duration-200 hover:scale-[1.02]',
                        isSelected
                          ? 'shadow-lg'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50'
                      )}
                      style={
                        isSelected
                          ? {
                              borderColor: club.colors.primary,
                              backgroundColor: `${club.colors.primary}10`,
                              boxShadow: `0 0 20px ${club.colors.primary}25`,
                            }
                          : undefined
                      }
                      onClick={() => setSelectedClub(club.id)}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        {/* Club color dot */}
                        <div
                          className="h-10 w-10 shrink-0 rounded-full shadow-inner"
                          style={{
                            background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate font-semibold',
                              isSelected ? 'text-white' : 'text-zinc-200'
                            )}
                          >
                            {club.fullName}
                          </p>
                          <p className="truncate text-sm text-zinc-400">{club.mascot}</p>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{club.homeGround}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2
                            className="h-5 w-5 shrink-0"
                            style={{ color: club.colors.primary }}
                          />
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {filteredClubs.length === 0 && (
                <p className="text-center text-sm text-zinc-500">
                  No clubs match your search.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Game Settings */}
          {currentStep === 3 && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Game Settings</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Customize your gameplay experience
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Defaults
                </Button>
              </div>

              {/* Toggle Settings */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Rules</CardTitle>
                  <CardDescription>Toggle gameplay mechanics on or off.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Salary Cap Toggle */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-zinc-200">Salary Cap</Label>
                        <p className="text-xs text-zinc-500">
                          Enforce a salary cap on player contracts
                        </p>
                      </div>
                      <Switch
                        checked={settings.salaryCap}
                        onCheckedChange={(val) => updateSetting('salaryCap', val)}
                      />
                    </div>
                    {settings.salaryCap && (
                      <div className="ml-0 space-y-1.5 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                        <Label htmlFor="salaryCapAmount" className="text-xs text-zinc-400">
                          Cap Amount
                        </Label>
                        <Input
                          id="salaryCapAmount"
                          type="number"
                          value={settings.salaryCapAmount}
                          onChange={(e) =>
                            updateSetting('salaryCapAmount', Number(e.target.value))
                          }
                          className="border-zinc-600 bg-zinc-700/50 text-white"
                        />
                        <p className="text-xs text-zinc-500">
                          {formatCurrency(settings.salaryCapAmount)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Board Pressure Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Board Pressure</Label>
                      <p className="text-xs text-zinc-500">
                        Board expectations affect your job security
                      </p>
                    </div>
                    <Switch
                      checked={settings.boardPressure}
                      onCheckedChange={(val) => updateSetting('boardPressure', val)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dropdown Settings */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Simulation</CardTitle>
                  <CardDescription>Adjust difficulty and speed settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Injury Frequency */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Injury Frequency</Label>
                    <Select
                      value={settings.injuryFrequency}
                      onValueChange={(val) =>
                        updateSetting(
                          'injuryFrequency',
                          val as GameSettings['injuryFrequency']
                        )
                      }
                    >
                      <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-500">
                      How often players get injured during matches and training
                    </p>
                  </div>

                  {/* Development Speed */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Development Speed</Label>
                    <Select
                      value={settings.developmentSpeed}
                      onValueChange={(val) =>
                        updateSetting(
                          'developmentSpeed',
                          val as GameSettings['developmentSpeed']
                        )
                      }
                    >
                      <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-500">
                      How quickly young players improve their attributes
                    </p>
                  </div>

                  {/* Sim Speed */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Simulation Speed</Label>
                    <Select
                      value={settings.simSpeed}
                      onValueChange={(val) =>
                        updateSetting('simSpeed', val as GameSettings['simSpeed'])
                      }
                    >
                      <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-500">
                      Speed of match simulations and transitions
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {currentStep === 4 && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Ready to Begin</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Review your career setup before starting
                </p>
              </div>

              {/* Manager Summary */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Manager</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Name</span>
                      <span className="text-zinc-200">
                        {managerName.trim() || 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Save Name</span>
                      <span className="text-zinc-200">{saveName}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Club Summary */}
              {selectedClubData && (
                <Card
                  className="border-2 bg-zinc-900/50"
                  style={{
                    borderColor: selectedClubData.colors.primary,
                    boxShadow: `0 0 30px ${selectedClubData.colors.primary}20`,
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-white">Club</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div
                        className="h-14 w-14 shrink-0 rounded-full shadow-md"
                        style={{
                          background: `linear-gradient(135deg, ${selectedClubData.colors.primary} 50%, ${selectedClubData.colors.secondary} 50%)`,
                        }}
                      />
                      <div>
                        <p className="text-lg font-bold text-white">
                          {selectedClubData.fullName}
                        </p>
                        <p className="text-sm text-zinc-400">
                          {selectedClubData.mascot}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="h-3 w-3" />
                          {selectedClubData.homeGround}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Settings Summary */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Salary Cap</span>
                      <span className="text-zinc-200">
                        {settings.salaryCap
                          ? formatCurrency(settings.salaryCapAmount)
                          : 'Off'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Board Pressure</span>
                      <span className="text-zinc-200">
                        {settings.boardPressure ? 'On' : 'Off'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Injury Frequency</span>
                      <span className="capitalize text-zinc-200">
                        {settings.injuryFrequency}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Development Speed</span>
                      <span className="capitalize text-zinc-200">
                        {settings.developmentSpeed}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Sim Speed</span>
                      <span className="capitalize text-zinc-200">
                        {settings.simSpeed}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Start Game Button */}
              <Button
                size="lg"
                onClick={handleStartGame}
                className="w-full bg-emerald-600 py-6 text-lg font-bold text-white hover:bg-emerald-500"
              >
                <Play className="mr-2 h-5 w-5" />
                Start Game
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <span className="text-xs text-zinc-500">
            Step {currentStep} of {STEPS.length}
          </span>

          {currentStep < 4 ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance(currentStep)}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleStartGame}
              disabled={!selectedClub}
              className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30"
            >
              <Play className="mr-1 h-4 w-4" />
              Start Game
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
