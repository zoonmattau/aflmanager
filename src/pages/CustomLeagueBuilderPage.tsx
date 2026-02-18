import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type {
  CustomLeagueTemplate,
  CustomLeagueTeam,
  CustomCompetitionModel,
  LadderTieBreaker,
} from '@/types/customLeague'
import type { FinalsSettings } from '@/types/game'
import { createDefaultSettings } from '@/engine/core/defaultSettings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FinalsFormatEditor } from '@/pages/wizard/FinalsFormatEditor'
import { TeamEditorPanel } from '@/components/teams/TeamEditorPanel'
import type { TeamEditorData } from '@/components/teams/TeamEditorPanel'
import { ChevronLeft, Plus, Save, Trash2 } from 'lucide-react'

const DEFAULT_FINALS = createDefaultSettings().finals
const TIE_BREAKER_OPTIONS: LadderTieBreaker[] = [
  'percentage',
  'points',
  'wins',
  'draws',
  'losses',
  'pointsFor',
  'pointsAgainst',
  'clubId',
]

function createDefaultTeam(index: number): CustomLeagueTeam {
  const id = `custom-team-${crypto.randomUUID().slice(0, 8)}`
  return {
    id,
    name: `Team ${index + 1}`,
    fullName: `Team ${index + 1} FC`,
    abbreviation: `T${index + 1}`,
    mascot: 'Rangers',
    homeVenue: `Venue ${index + 1}`,
    established: 2026,
    logoUrl: '',
    colors: {
      primary: '#1f2937',
      secondary: '#e5e7eb',
    },
    notes: '',
    secondaryHomeGrounds: [],
    rivalryClubIds: [],
    tier: 'medium',
    finances: { revenue: 12_000_000, expenses: 9_500_000, balance: 8_000_000 },
    fanSatisfaction: 50,
  }
}

function customTeamToEditorData(team: CustomLeagueTeam): TeamEditorData {
  return {
    id: team.id,
    name: team.name,
    fullName: team.fullName,
    abbreviation: team.abbreviation,
    mascot: team.mascot,
    logoUrl: team.logoUrl ?? '',
    homeGround: team.homeVenue,
    secondaryHomeGrounds: team.secondaryHomeGrounds ?? [],
    established: team.established,
    colors: { ...team.colors },
    guernseyStyle: team.guernseyStyle ?? null,
    notes: team.notes ?? '',
    rivalryClubIds: team.rivalryClubIds ?? [],
    tier: team.tier ?? 'medium',
    finances: team.finances ?? { revenue: 12_000_000, expenses: 9_500_000, balance: 8_000_000 },
    fanSatisfaction: team.fanSatisfaction ?? 50,
  }
}

function editorDataToCustomTeamUpdates(updates: Partial<TeamEditorData>): Partial<CustomLeagueTeam> {
  const out: Partial<CustomLeagueTeam> = {}
  if (updates.name !== undefined) out.name = updates.name
  if (updates.fullName !== undefined) out.fullName = updates.fullName
  if (updates.abbreviation !== undefined) out.abbreviation = updates.abbreviation
  if (updates.mascot !== undefined) out.mascot = updates.mascot
  if (updates.logoUrl !== undefined) out.logoUrl = updates.logoUrl
  if (updates.homeGround !== undefined) out.homeVenue = updates.homeGround
  if (updates.secondaryHomeGrounds !== undefined) out.secondaryHomeGrounds = updates.secondaryHomeGrounds
  if (updates.established !== undefined) out.established = updates.established
  if (updates.colors !== undefined) out.colors = updates.colors
  if (updates.guernseyStyle !== undefined) out.guernseyStyle = updates.guernseyStyle ?? undefined
  if (updates.notes !== undefined) out.notes = updates.notes
  if (updates.rivalryClubIds !== undefined) out.rivalryClubIds = updates.rivalryClubIds
  if (updates.tier !== undefined) out.tier = updates.tier
  if (updates.finances !== undefined) out.finances = updates.finances
  if (updates.fanSatisfaction !== undefined) out.fanSatisfaction = updates.fanSatisfaction
  return out
}

function deriveRivalriesFromTeams(teams: CustomLeagueTeam[]): Array<[string, string]> {
  const seen = new Set<string>()
  const pairs: Array<[string, string]> = []
  for (const team of teams) {
    for (const rid of team.rivalryClubIds ?? []) {
      const key = [team.id, rid].sort().join('::')
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push([team.id, rid])
      }
    }
  }
  return pairs
}

function createEmptyTemplate(): CustomLeagueTemplate {
  const createdAt = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: 'New Custom League',
    description: 'Editable AFL-style custom world',
    createdAt,
    lastModified: createdAt,
    teams: Array.from({ length: 12 }, (_, i) => createDefaultTeam(i)),
    rivalries: [],
    structure: {
      model: 'single-table',
      conferenceCount: 2,
      divisionsPerConference: 2,
      teamsPerDivision: 6,
      tierCount: 2,
      enablePromotionRelegation: false,
      promotionRelegationSpots: 1,
    },
    ladderRules: {
      pointsForWin: 4,
      pointsForDraw: 2,
      pointsForLoss: 0,
      primarySort: 'points',
      tieBreakers: ['percentage', 'wins', 'pointsFor', 'clubId'],
    },
    fixtureRules: {
      roundCount: 23,
      byeRounds: true,
      byeRoundCount: 2,
      enforceHomeAwayBalance: true,
      enforceRivalries: true,
      travelWeighting: 40,
      venueSharingRules: true,
    },
    finalsRules: {
      finalsTeams: 8,
      finalsFormat: 'afl-top-8',
      customFinalsFormat: undefined,
    },
  }
}

function normalizeTemplate(template: CustomLeagueTemplate): CustomLeagueTemplate {
  return {
    ...template,
    structure: {
      ...template.structure,
      tierCount: Math.max(1, template.structure.tierCount ?? 1),
      promotionRelegationSpots: Math.max(0, template.structure.promotionRelegationSpots ?? 1),
    },
  }
}

function toFinalsSettings(template: CustomLeagueTemplate): FinalsSettings {
  return {
    ...DEFAULT_FINALS,
    finalsQualifyingTeams: template.finalsRules.finalsTeams,
    finalsFormat: template.finalsRules.finalsFormat,
    customFinalsFormat: template.finalsRules.customFinalsFormat,
  }
}

export function CustomLeagueBuilderPage() {
  const setScreen = useAppStore((s) => s.setScreen)
  const templates = useAppStore((s) => s.customLeagueTemplates)
  const saveTemplate = useAppStore((s) => s.createOrUpdateCustomLeagueTemplate)
  const deleteTemplate = useAppStore((s) => s.deleteCustomLeagueTemplate)
  const [active, setActive] = useState<CustomLeagueTemplate>(() => normalizeTemplate(templates[0] ?? createEmptyTemplate()))
  const [finalsSettings, setFinalsSettings] = useState<FinalsSettings>(() => toFinalsSettings(normalizeTemplate(templates[0] ?? createEmptyTemplate())))

  const teamOptions = useMemo(
    () => active.teams.map((t) => ({ id: t.id, label: t.fullName })),
    [active.teams],
  )
  const allTeamsForEditor = useMemo(
    () => active.teams.map((t) => ({ id: t.id, name: t.name })),
    [active.teams],
  )

  const handleEditorTeamChange = useCallback(
    (teamId: string, updates: Partial<TeamEditorData>) => {
      const teamUpdates = editorDataToCustomTeamUpdates(updates)
      updateTeam(teamId, teamUpdates)

      // Bidirectional rivalry sync within the template
      if (updates.rivalryClubIds) {
        const existingTeam = active.teams.find((t) => t.id === teamId)
        const oldRivals = existingTeam?.rivalryClubIds ?? []
        const newRivals = updates.rivalryClubIds
        for (const rid of newRivals) {
          if (!oldRivals.includes(rid)) {
            const rival = active.teams.find((t) => t.id === rid)
            if (rival) {
              const rivalIds = rival.rivalryClubIds ?? []
              if (!rivalIds.includes(teamId)) {
                updateTeam(rid, { rivalryClubIds: [...rivalIds, teamId] })
              }
            }
          }
        }
        for (const rid of oldRivals) {
          if (!newRivals.includes(rid)) {
            const rival = active.teams.find((t) => t.id === rid)
            if (rival) {
              const rivalIds = rival.rivalryClubIds ?? []
              updateTeam(rid, { rivalryClubIds: rivalIds.filter((id) => id !== teamId) })
            }
          }
        }
      }
    },
    [active.teams, updateTeam],
  )

  const selectTemplate = (templateId: string) => {
    const found = templates.find((t) => t.id === templateId)
    if (!found) return
    const normalized = normalizeTemplate(found)
    setActive(normalized)
    setFinalsSettings(toFinalsSettings(normalized))
  }

  const updateActive = (updater: (prev: CustomLeagueTemplate) => CustomLeagueTemplate) => {
    setActive((prev) => updater({
      ...prev,
      lastModified: new Date().toISOString(),
    }))
  }

  const updateTeam = (teamId: string, updates: Partial<CustomLeagueTeam>) => {
    updateActive((prev) => ({
      ...prev,
      teams: prev.teams.map((team) => (team.id === teamId ? { ...team, ...updates } : team)),
    }))
  }

  const handleAddTeam = () => {
    updateActive((prev) => {
      const idx = prev.teams.length
      return {
        ...prev,
        teams: [...prev.teams, createDefaultTeam(idx)],
      }
    })
  }

  const handleRemoveTeam = (teamId: string) => {
    updateActive((prev) => ({
      ...prev,
      teams: prev.teams.filter((t) => t.id !== teamId),
      rivalries: prev.rivalries.filter(([a, b]) => a !== teamId && b !== teamId),
    }))
  }

  const handleSave = async () => {
    const normalized: CustomLeagueTemplate = {
      ...active,
      rivalries: deriveRivalriesFromTeams(active.teams),
      finalsRules: {
        finalsTeams: finalsSettings.finalsQualifyingTeams,
        finalsFormat: finalsSettings.finalsFormat,
        customFinalsFormat: finalsSettings.customFinalsFormat,
      },
      structure: {
        ...active.structure,
        teamsPerDivision:
          active.structure.model === 'single-table'
            ? active.teams.length
            : active.structure.teamsPerDivision,
      },
    }
    await saveTemplate(normalized)
    setActive(normalized)
  }

  const handleNewTemplate = () => {
    const next = createEmptyTemplate()
    setActive(next)
    setFinalsSettings(toFinalsSettings(next))
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setScreen('home')}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleNewTemplate}>
              <Plus className="mr-1 h-4 w-4" />
              New Template
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-1 h-4 w-4" />
              Save Template
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Templates</CardTitle>
              <CardDescription>Saved custom league worlds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="flex items-center gap-2">
                  <Button
                    variant={template.id === active.id ? 'default' : 'outline'}
                    className="flex-1 justify-start"
                    onClick={() => selectTemplate(template.id)}
                  >
                    {template.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTemplate(template.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">World Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Template Name</Label>
                  <Input value={active.name} onChange={(e) => updateActive((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={active.description} onChange={(e) => updateActive((p) => ({ ...p, description: e.target.value }))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">League Structure</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Model</Label>
                  <Select
                    value={active.structure.model}
                    onValueChange={(value) =>
                      updateActive((prev) => ({
                        ...prev,
                        structure: { ...prev.structure, model: value as CustomCompetitionModel },
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single-table">Single Table</SelectItem>
                      <SelectItem value="conferences">Conferences</SelectItem>
                      <SelectItem value="divisions">Divisions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Conferences</Label>
                  <Input
                    type="number"
                    value={active.structure.conferenceCount}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        structure: { ...prev.structure, conferenceCount: Math.max(1, Number(e.target.value) || 1) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Divisions per Conference</Label>
                  <Input
                    type="number"
                    value={active.structure.divisionsPerConference}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        structure: { ...prev.structure, divisionsPerConference: Math.max(1, Number(e.target.value) || 1) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tier Count</Label>
                  <Input
                    type="number"
                    value={active.structure.tierCount}
                    onChange={(e) =>
                      updateActive((prev) => ({
                        ...prev,
                        structure: { ...prev.structure, tierCount: Math.max(1, Number(e.target.value) || 1) },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between md:col-span-3">
                  <Label>Enable Promotion / Relegation (future systems)</Label>
                  <Switch
                    checked={active.structure.enablePromotionRelegation}
                    onCheckedChange={(v) =>
                      updateActive((prev) => ({
                        ...prev,
                        structure: { ...prev.structure, enablePromotionRelegation: v },
                      }))
                    }
                  />
                </div>
                {active.structure.enablePromotionRelegation && (
                  <div className="space-y-1 md:col-span-3">
                    <Label>Promoted / Relegated Clubs Per Tier Boundary</Label>
                    <Input
                      type="number"
                      value={active.structure.promotionRelegationSpots}
                      onChange={(e) =>
                        updateActive((prev) => ({
                          ...prev,
                          structure: {
                            ...prev.structure,
                            promotionRelegationSpots: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Teams</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" onClick={handleAddTeam}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Team
                </Button>
                <div className="space-y-2">
                  {active.teams.map((team) => (
                    <TeamEditorPanel
                      key={team.id}
                      team={customTeamToEditorData(team)}
                      allTeams={allTeamsForEditor}
                      onChange={(updates) => handleEditorTeamChange(team.id, updates)}
                      showFinancials
                      onDelete={() => handleRemoveTeam(team.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rivalries (Summary)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Rivalries are managed per-team in the Teams section above. This is a read-only summary.</p>
                {deriveRivalriesFromTeams(active.teams).map(([a, b]) => (
                  <div key={`${a}-${b}`} className="rounded border px-3 py-2 text-sm">
                    {teamOptions.find((t) => t.id === a)?.label ?? a} vs {teamOptions.find((t) => t.id === b)?.label ?? b}
                  </div>
                ))}
                {deriveRivalriesFromTeams(active.teams).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No rivalries defined. Add them via each team's editor above.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ladder Rules</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label>Win</Label>
                  <Input type="number" value={active.ladderRules.pointsForWin} onChange={(e) => updateActive((p) => ({ ...p, ladderRules: { ...p.ladderRules, pointsForWin: Number(e.target.value) || 0 } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Draw</Label>
                  <Input type="number" value={active.ladderRules.pointsForDraw} onChange={(e) => updateActive((p) => ({ ...p, ladderRules: { ...p.ladderRules, pointsForDraw: Number(e.target.value) || 0 } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Loss</Label>
                  <Input type="number" value={active.ladderRules.pointsForLoss} onChange={(e) => updateActive((p) => ({ ...p, ladderRules: { ...p.ladderRules, pointsForLoss: Number(e.target.value) || 0 } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Primary Sort</Label>
                  <Select
                    value={active.ladderRules.primarySort}
                    onValueChange={(value) => updateActive((p) => ({ ...p, ladderRules: { ...p.ladderRules, primarySort: value as 'points' | 'percentage' } }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="points">Points First</SelectItem>
                      <SelectItem value="percentage">Percentage First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Tie-breakers (ordered)</Label>
                  <div className="grid gap-2 md:grid-cols-4">
                    {TIE_BREAKER_OPTIONS.map((option) => (
                      <label key={option} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={active.ladderRules.tieBreakers.includes(option)}
                          onChange={(e) =>
                            updateActive((p) => ({
                              ...p,
                              ladderRules: {
                                ...p.ladderRules,
                                tieBreakers: e.target.checked
                                  ? [...p.ladderRules.tieBreakers, option]
                                  : p.ladderRules.tieBreakers.filter((t) => t !== option),
                              },
                            }))
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fixture Rules</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Rounds</Label>
                  <Input type="number" value={active.fixtureRules.roundCount} onChange={(e) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, roundCount: Math.max(0, Number(e.target.value) || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Bye Rounds</Label>
                  <Input type="number" value={active.fixtureRules.byeRoundCount} onChange={(e) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, byeRoundCount: Math.max(0, Number(e.target.value) || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Travel Weighting (0-100)</Label>
                  <Input type="number" value={active.fixtureRules.travelWeighting} onChange={(e) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, travelWeighting: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))} />
                </div>
                <div className="flex items-center justify-between md:col-span-3">
                  <Label>Enable Bye Rounds</Label>
                  <Switch checked={active.fixtureRules.byeRounds} onCheckedChange={(v) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, byeRounds: v } }))} />
                </div>
                <div className="flex items-center justify-between md:col-span-3">
                  <Label>Home / Away Balance</Label>
                  <Switch checked={active.fixtureRules.enforceHomeAwayBalance} onCheckedChange={(v) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, enforceHomeAwayBalance: v } }))} />
                </div>
                <div className="flex items-center justify-between md:col-span-3">
                  <Label>Rivalry Enforcement</Label>
                  <Switch checked={active.fixtureRules.enforceRivalries} onCheckedChange={(v) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, enforceRivalries: v } }))} />
                </div>
                <div className="flex items-center justify-between md:col-span-3">
                  <Label>Venue Sharing Rules</Label>
                  <Switch checked={active.fixtureRules.venueSharingRules} onCheckedChange={(v) => updateActive((p) => ({ ...p, fixtureRules: { ...p.fixtureRules, venueSharingRules: v } }))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Finals Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <FinalsFormatEditor finals={finalsSettings} onChange={setFinalsSettings} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
