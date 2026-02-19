import { useState, useMemo, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Club } from '@/types/club'
import type { CustomStadium } from '@/types/stadium'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TeamEditorPanel } from '@/components/teams/TeamEditorPanel'
import type { TeamEditorData } from '@/components/teams/TeamEditorPanel'
import { StadiumEditorPanel, createDefaultStadium } from '@/components/stadium/StadiumEditorPanel'
import { Building2, Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clubToEditorData(club: Club): TeamEditorData {
  return {
    id: club.id,
    name: club.name,
    fullName: club.fullName,
    abbreviation: club.abbreviation,
    mascot: club.mascot,
    logoUrl: club.logoUrl ?? '',
    homeGround: club.homeGround,
    secondaryHomeGrounds: club.secondaryHomeGrounds ?? [],
    established: club.established,
    colors: { ...club.colors },
    guernseyStyle: club.guernseyStyle ?? null,
    notes: club.notes ?? '',
    rivalryClubIds: club.rivalryClubIds ?? [],
    tier: club.tier,
    finances: {
      revenue: club.finances.revenue,
      expenses: club.finances.expenses,
      balance: club.finances.balance,
    },
    fanSatisfaction: club.fanSatisfaction ?? 50,
  }
}

function editorDataToClubUpdates(updates: Partial<TeamEditorData>): Partial<Club> {
  const out: Partial<Club> = {}
  if (updates.name !== undefined) out.name = updates.name
  if (updates.fullName !== undefined) out.fullName = updates.fullName
  if (updates.abbreviation !== undefined) out.abbreviation = updates.abbreviation
  if (updates.mascot !== undefined) out.mascot = updates.mascot
  if (updates.logoUrl !== undefined) out.logoUrl = updates.logoUrl
  if (updates.homeGround !== undefined) out.homeGround = updates.homeGround
  if (updates.secondaryHomeGrounds !== undefined) out.secondaryHomeGrounds = updates.secondaryHomeGrounds
  if (updates.established !== undefined) out.established = updates.established
  if (updates.colors !== undefined) out.colors = updates.colors
  if (updates.guernseyStyle !== undefined) out.guernseyStyle = updates.guernseyStyle ?? undefined
  if (updates.notes !== undefined) out.notes = updates.notes
  if (updates.rivalryClubIds !== undefined) out.rivalryClubIds = updates.rivalryClubIds
  if (updates.tier !== undefined) out.tier = updates.tier
  if (updates.fanSatisfaction !== undefined) out.fanSatisfaction = updates.fanSatisfaction
  return out
}

function generateExpansionId(): string {
  return `custom-expansion-${crypto.randomUUID().slice(0, 8)}`
}

function createBlankExpansionEditorData(): TeamEditorData {
  return {
    id: generateExpansionId(),
    name: 'New Club',
    fullName: 'New Club FC',
    abbreviation: 'NCF',
    mascot: 'Eagles',
    logoUrl: '',
    homeGround: 'New Stadium',
    secondaryHomeGrounds: [],
    established: new Date().getFullYear() + 2,
    colors: { primary: '#1a3c5e', secondary: '#e8b84b' },
    guernseyStyle: null,
    notes: '',
    rivalryClubIds: [],
    tier: 'small',
    finances: { revenue: 25_000_000, expenses: 28_000_000, balance: -3_000_000 },
    fanSatisfaction: 40,
  }
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type Tab = 'clubs' | 'expansion' | 'stadiums'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function LeagueCustomiserPage() {
  const clubs = useGameStore((s) => s.clubs)
  const leagueConfig = useGameStore((s) => s.leagueConfig)
  const settings = useGameStore((s) => s.settings)
  const currentYear = useGameStore((s) => s.currentYear)
  const updateClub = useGameStore((s) => s.updateClub)
  const planCustomExpansion = useGameStore((s) => s.planCustomExpansion)
  const updateGameSettings = useGameStore((s) => s.updateGameSettings)

  const [activeTab, setActiveTab] = useState<Tab>('clubs')

  // Expansion form state
  const [expansionEditor, setExpansionEditor] = useState<TeamEditorData>(() => createBlankExpansionEditorData())
  const [expansionEntryYear, setExpansionEntryYear] = useState(currentYear + 3)
  const [expansionError, setExpansionError] = useState('')
  const [expansionSuccess, setExpansionSuccess] = useState(false)

  const activeClubs = useMemo(
    () => leagueConfig.activeClubIds.map((id) => clubs[id]).filter(Boolean) as Club[],
    [clubs, leagueConfig.activeClubIds],
  )

  const allTeamsForEditor = useMemo(
    () => activeClubs.map((c) => ({ id: c.id, name: c.name })),
    [activeClubs],
  )

  const customStadiums: CustomStadium[] = settings.customStadiums ?? []

  const handleClubChange = useCallback(
    (clubId: string, updates: Partial<TeamEditorData>) => {
      const existing = clubs[clubId]
      if (!existing) return
      const clubUpdates = editorDataToClubUpdates(updates)
      updateClub(clubId, clubUpdates)

      // Bidirectional rivalry sync
      if (updates.rivalryClubIds) {
        const oldRivals = existing.rivalryClubIds ?? []
        const newRivals = updates.rivalryClubIds
        for (const rid of newRivals) {
          if (!oldRivals.includes(rid)) {
            const rival = clubs[rid]
            if (rival) {
              const rivalIds = rival.rivalryClubIds ?? []
              if (!rivalIds.includes(clubId)) {
                updateClub(rid, { rivalryClubIds: [...rivalIds, clubId] })
              }
            }
          }
        }
        for (const rid of oldRivals) {
          if (!newRivals.includes(rid)) {
            const rival = clubs[rid]
            if (rival) {
              updateClub(rid, { rivalryClubIds: (rival.rivalryClubIds ?? []).filter((id) => id !== clubId) })
            }
          }
        }
      }
    },
    [clubs, updateClub],
  )

  const handlePlanExpansion = () => {
    setExpansionError('')
    setExpansionSuccess(false)
    if (!expansionEditor.name.trim() || !expansionEditor.abbreviation.trim()) {
      setExpansionError('Club name and abbreviation are required.')
      return
    }
    const result = planCustomExpansion(
      {
        id: expansionEditor.id,
        name: expansionEditor.name,
        fullName: expansionEditor.fullName,
        abbreviation: expansionEditor.abbreviation,
        mascot: expansionEditor.mascot,
        homeGround: expansionEditor.homeGround,
        colors: expansionEditor.colors,
        tier: expansionEditor.tier,
        logoUrl: expansionEditor.logoUrl || undefined,
        notes: expansionEditor.notes || undefined,
        secondaryHomeGrounds: expansionEditor.secondaryHomeGrounds,
        guernseyStyle: expansionEditor.guernseyStyle ?? undefined,
        rivalryClubIds: expansionEditor.rivalryClubIds,
      },
      expansionEntryYear,
    )
    if (!result.success) {
      setExpansionError(result.error ?? 'Failed to create expansion plan.')
    } else {
      setExpansionSuccess(true)
      setExpansionEditor(createBlankExpansionEditorData())
      setExpansionEntryYear(currentYear + 3)
    }
  }

  const handleAddStadium = () => {
    updateGameSettings({
      customStadiums: [...customStadiums, createDefaultStadium()],
    })
  }

  const handleUpdateStadium = (stadiumId: string, updates: Partial<CustomStadium>) => {
    updateGameSettings({
      customStadiums: customStadiums.map((s) => (s.id === stadiumId ? { ...s, ...updates } : s)),
    })
  }

  const handleRemoveStadium = (stadiumId: string) => {
    updateGameSettings({
      customStadiums: customStadiums.filter((s) => s.id !== stadiumId),
    })
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'clubs', label: 'Club Editor', count: activeClubs.length },
    { id: 'expansion', label: 'Expansion', count: leagueConfig.expansionPlans.length },
    { id: 'stadiums', label: 'Stadiums', count: customStadiums.length || undefined },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">League Customiser</h1>
          <p className="text-sm text-muted-foreground">
            Edit club identities, plan expansions, and manage custom stadiums
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Club Editor Tab */}
      {activeTab === 'clubs' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Changes are applied immediately to the current game. You can rename clubs, update
            colours, logos, home grounds, and guernsey patterns for any active club.
          </p>
          {activeClubs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No active clubs found.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeClubs.map((club) => (
                <TeamEditorPanel
                  key={club.id}
                  team={clubToEditorData(club)}
                  allTeams={allTeamsForEditor}
                  onChange={(updates) => handleClubChange(club.id, updates)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expansion Tab */}
      {activeTab === 'expansion' && (
        <div className="space-y-6">
          {/* Existing Expansion Plans */}
          {leagueConfig.expansionPlans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Planned Expansions</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {leagueConfig.expansionPlans.map((plan) => {
                  const club = clubs[plan.clubId]
                  return (
                    <Card key={plan.clubId}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          {club && (
                            <div
                              className="h-8 w-8 shrink-0 rounded-full"
                              style={{
                                background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
                              }}
                            />
                          )}
                          <div>
                            <CardTitle className="text-sm">
                              {club?.fullName ?? plan.clubId}
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px]">
                              {plan.status}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>AFL Entry</span>
                          <span className="font-medium text-foreground">{plan.aflEntryYear}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Priority Picks</span>
                          <span>{plan.priorityPicksPerYear}/yr × {plan.priorityPickYears}yr</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cap Concession</span>
                          <span>
                            {plan.salaryCapConcession > 0
                              ? `+$${(plan.salaryCapConcession / 1_000_000).toFixed(1)}M × ${plan.salaryCapConcessionYears}yr`
                              : 'None'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* New Expansion Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Plan New Expansion Club
              </CardTitle>
              <CardDescription>
                Design a custom expansion club and set its AFL entry year. The club will appear
                on the Expansion page and join the competition in its entry year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>AFL Entry Year</Label>
                  <Input
                    type="number"
                    value={expansionEntryYear}
                    onChange={(e) => setExpansionEntryYear(Math.max(currentYear + 1, parseInt(e.target.value, 10) || currentYear + 1))}
                    min={currentYear + 1}
                    max={currentYear + 20}
                    className="border-zinc-700 bg-zinc-800"
                  />
                  <p className="text-xs text-muted-foreground">
                    Earliest possible: {currentYear + 1}
                  </p>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <Label className="mb-2 block text-sm">Club Details</Label>
                <TeamEditorPanel
                  team={expansionEditor}
                  allTeams={allTeamsForEditor}
                  onChange={(updates) => setExpansionEditor((prev) => ({ ...prev, ...updates }))}
                />
              </div>

              {expansionError && (
                <p className="text-sm text-destructive">{expansionError}</p>
              )}
              {expansionSuccess && (
                <p className="text-sm text-emerald-400">Expansion plan created successfully.</p>
              )}

              <Button onClick={handlePlanExpansion}>
                <Plus className="mr-1 h-4 w-4" />
                Create Expansion Plan
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stadiums Tab */}
      {activeTab === 'stadiums' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Custom stadiums store capacity, surface, and location data. Assign one to a club
              by matching its name with the club's Home Ground field.
            </p>
            <Button variant="outline" onClick={handleAddStadium}>
              <Plus className="mr-1 h-4 w-4" />
              Add Stadium
            </Button>
          </div>

          {customStadiums.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <div className="mb-2 flex justify-center">
                  <Building2 className="h-8 w-8 opacity-30" />
                </div>
                No custom stadiums yet. Click "Add Stadium" to create one.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customStadiums.map((stadium) => (
                <StadiumEditorPanel
                  key={stadium.id}
                  stadium={stadium}
                  onChange={(updates) => handleUpdateStadium(stadium.id, updates)}
                  onDelete={() => handleRemoveStadium(stadium.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
