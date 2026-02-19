import { useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type {
  CustomLeagueTemplate,
  CustomLeagueTeam,
  CustomCompetitionModel,
  CustomLeagueStructure,
  LadderTieBreaker,
} from '@/types/customLeague'
import type { FinalsSettings } from '@/types/game'
import { createDefaultSettings } from '@/engine/core/defaultSettings'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FinalsFormatEditor } from '@/pages/wizard/FinalsFormatEditor'
import { TeamEditorPanel } from '@/components/teams/TeamEditorPanel'
import type { TeamEditorData } from '@/components/teams/TeamEditorPanel'
import { ChevronLeft, Plus, Save, Trash2 } from 'lucide-react'
import { BrandingPackPicker } from '@/components/league/BrandingPackPicker'

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

interface StructureGroup {
  id: string
  label: string
  conferenceLabel?: string
}

interface StructureValidation {
  minTeamsPerGroup: number
  maxTeamsPerGroup: number
  errors: string[]
}

function getStructureGroups(structure: CustomLeagueStructure): StructureGroup[] {
  if (structure.model === 'single-table') return []
  if (structure.model === 'conferences') {
    return Array.from({ length: Math.max(1, structure.conferenceCount) }, (_, i) => ({
      id: `conf-${i + 1}`,
      label: `Conference ${i + 1}`,
    }))
  }
  const groups: StructureGroup[] = []
  const conferenceCount = Math.max(1, structure.conferenceCount)
  const divisionsPerConference = Math.max(1, structure.divisionsPerConference)
  for (let c = 1; c <= conferenceCount; c += 1) {
    for (let d = 1; d <= divisionsPerConference; d += 1) {
      groups.push({
        id: `conf-${c}-div-${d}`,
        label: `Division ${d}`,
        conferenceLabel: `Conference ${c}`,
      })
    }
  }
  return groups
}

function normalizeGroupAssignments(
  teams: CustomLeagueTeam[],
  structure: CustomLeagueStructure,
  existingAssignments?: Record<string, string>,
): Record<string, string> | undefined {
  const groups = getStructureGroups(structure)
  if (groups.length === 0) return undefined

  const groupIds = groups.map((g) => g.id)
  const validGroupIds = new Set(groupIds)
  const assignments: Record<string, string> = {}
  const membersByGroup: Record<string, string[]> = {}
  for (const gid of groupIds) membersByGroup[gid] = []

  for (const team of teams) {
    const maybeGroup = existingAssignments?.[team.id]
    if (maybeGroup && validGroupIds.has(maybeGroup)) {
      assignments[team.id] = maybeGroup
      membersByGroup[maybeGroup].push(team.id)
    }
  }

  for (const team of teams) {
    if (assignments[team.id]) continue
    const target = groupIds.reduce((best, id) => {
      if (membersByGroup[id].length < membersByGroup[best].length) return id
      return best
    }, groupIds[0])
    assignments[team.id] = target
    membersByGroup[target].push(team.id)
  }

  const minTeams = Math.floor(teams.length / groupIds.length)
  const maxTeams = Math.ceil(teams.length / groupIds.length)
  while (true) {
    const over = groupIds.find((id) => membersByGroup[id].length > maxTeams)
    const under = groupIds.find((id) => membersByGroup[id].length < minTeams)
    if (!over || !under) break
    const moved = membersByGroup[over].pop()
    if (!moved) break
    assignments[moved] = under
    membersByGroup[under].push(moved)
  }

  while (true) {
    const over = groupIds.find((id) => membersByGroup[id].length > maxTeams)
    if (!over) break
    const target = groupIds.find((id) => membersByGroup[id].length < maxTeams && id !== over)
    if (!target) break
    const moved = membersByGroup[over].pop()
    if (!moved) break
    assignments[moved] = target
    membersByGroup[target].push(moved)
  }

  return assignments
}

function validateStructureAssignments(
  teams: CustomLeagueTeam[],
  structure: CustomLeagueStructure,
  assignments?: Record<string, string>,
): StructureValidation {
  const groups = getStructureGroups(structure)
  if (groups.length === 0) {
    return { minTeamsPerGroup: teams.length, maxTeamsPerGroup: teams.length, errors: [] }
  }

  const minTeamsPerGroup = Math.floor(teams.length / groups.length)
  const maxTeamsPerGroup = Math.ceil(teams.length / groups.length)
  const errors: string[] = []
  const groupCounts: Record<string, number> = {}
  const validGroupIds = new Set(groups.map((g) => g.id))

  for (const g of groups) groupCounts[g.id] = 0

  for (const team of teams) {
    const groupId = assignments?.[team.id]
    if (!groupId || !validGroupIds.has(groupId)) {
      errors.push(`${team.fullName} is not assigned to a valid group.`)
      continue
    }
    groupCounts[groupId] += 1
  }

  for (const group of groups) {
    const size = groupCounts[group.id]
    if (size < minTeamsPerGroup || size > maxTeamsPerGroup) {
      errors.push(
        `${group.conferenceLabel ? `${group.conferenceLabel} - ` : ''}${group.label} has ${size} teams (allowed ${minTeamsPerGroup}-${maxTeamsPerGroup}).`,
      )
    }
  }

  return { minTeamsPerGroup, maxTeamsPerGroup, errors }
}

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
  const normalizedStructure: CustomLeagueStructure = {
    ...template.structure,
    tierCount: Math.max(1, template.structure.tierCount ?? 1),
    promotionRelegationSpots: Math.max(0, template.structure.promotionRelegationSpots ?? 1),
    conferenceCount: Math.max(1, template.structure.conferenceCount ?? 1),
    divisionsPerConference: Math.max(1, template.structure.divisionsPerConference ?? 1),
  }
  normalizedStructure.groupAssignments = normalizeGroupAssignments(
    template.teams,
    normalizedStructure,
    template.structure.groupAssignments,
  )
  return {
    ...template,
    structure: normalizedStructure,
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
  const [draggingTeamId, setDraggingTeamId] = useState<string | null>(null)

  const teamOptions = useMemo(
    () => active.teams.map((t) => ({ id: t.id, label: t.fullName })),
    [active.teams],
  )
  const allTeamsForEditor = useMemo(
    () => active.teams.map((t) => ({ id: t.id, name: t.name })),
    [active.teams],
  )

  const structureGroups = useMemo(
    () => getStructureGroups(active.structure),
    [active.structure],
  )
  const structureAssignments = useMemo(
    () => active.structure.groupAssignments ?? normalizeGroupAssignments(active.teams, active.structure, undefined),
    [active.teams, active.structure],
  )
  const groupedTeams = useMemo(() => {
    const grouped: Record<string, CustomLeagueTeam[]> = {}
    for (const group of structureGroups) grouped[group.id] = []
    if (!structureAssignments) return grouped
    for (const team of active.teams) {
      const groupId = structureAssignments[team.id]
      if (groupId && grouped[groupId]) grouped[groupId].push(team)
    }
    return grouped
  }, [active.teams, structureGroups, structureAssignments])
  const structureValidation = useMemo(
    () => validateStructureAssignments(active.teams, active.structure, structureAssignments),
    [active.teams, active.structure, structureAssignments],
  )
  const isStructureValid = structureValidation.errors.length === 0

  const updateActive = (updater: (prev: CustomLeagueTemplate) => CustomLeagueTemplate) => {
    setActive((prev) => updater({
      ...prev,
      lastModified: new Date().toISOString(),
    }))
  }

  const updateTeam = (teamId: string, updates: Partial<CustomLeagueTeam>) => {
    updateActive((prev) => {
      const teams = prev.teams.map((team) => (team.id === teamId ? { ...team, ...updates } : team))
      return {
        ...prev,
        teams,
        structure: {
          ...prev.structure,
          groupAssignments: normalizeGroupAssignments(teams, prev.structure, prev.structure.groupAssignments),
        },
      }
    })
  }

  const updateStructure = (updater: (structure: CustomLeagueStructure) => CustomLeagueStructure) => {
    updateActive((prev) => {
      const nextStructure = updater(prev.structure)
      return {
        ...prev,
        structure: {
          ...nextStructure,
          groupAssignments: normalizeGroupAssignments(
            prev.teams,
            nextStructure,
            nextStructure.groupAssignments ?? prev.structure.groupAssignments,
          ),
        },
      }
    })
  }

  const moveTeamToGroup = (teamId: string, targetGroupId: string) => {
    updateActive((prev) => {
      const groups = getStructureGroups(prev.structure)
      if (!groups.some((g) => g.id === targetGroupId)) return prev
      const nextAssignments = {
        ...(normalizeGroupAssignments(prev.teams, prev.structure, prev.structure.groupAssignments) ?? {}),
        [teamId]: targetGroupId,
      }
      return {
        ...prev,
        structure: {
          ...prev.structure,
          groupAssignments: nextAssignments,
        },
      }
    })
  }

  const handleEditorTeamChange = (teamId: string, updates: Partial<TeamEditorData>) => {
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
  }

  const selectTemplate = (templateId: string) => {
    const found = templates.find((t) => t.id === templateId)
    if (!found) return
    const normalized = normalizeTemplate(found)
    setActive(normalized)
    setFinalsSettings(toFinalsSettings(normalized))
  }

  const handleAddTeam = () => {
    updateActive((prev) => {
      const idx = prev.teams.length
      const teams = [...prev.teams, createDefaultTeam(idx)]
      return {
        ...prev,
        teams,
        structure: {
          ...prev.structure,
          groupAssignments: normalizeGroupAssignments(teams, prev.structure, prev.structure.groupAssignments),
        },
      }
    })
  }

  const handleRemoveTeam = (teamId: string) => {
    updateActive((prev) => {
      const teams = prev.teams.filter((t) => t.id !== teamId)
      const filteredAssignments = Object.fromEntries(
        Object.entries(prev.structure.groupAssignments ?? {}).filter(([id]) => id !== teamId),
      )
      return {
        ...prev,
        teams,
        rivalries: prev.rivalries.filter(([a, b]) => a !== teamId && b !== teamId),
        structure: {
          ...prev.structure,
          groupAssignments: normalizeGroupAssignments(teams, prev.structure, filteredAssignments),
        },
      }
    })
  }

  const handleSave = async () => {
    if (!isStructureValid) return
    const groupCount =
      active.structure.model === 'single-table'
        ? 1
        : active.structure.model === 'conferences'
          ? Math.max(1, active.structure.conferenceCount)
          : Math.max(1, active.structure.conferenceCount) * Math.max(1, active.structure.divisionsPerConference)
    const normalizedAssignments = normalizeGroupAssignments(
      active.teams,
      active.structure,
      active.structure.groupAssignments,
    )
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
        teamsPerDivision: Math.ceil(active.teams.length / groupCount),
        groupAssignments: normalizedAssignments,
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

  const handleApplyPack = (template: CustomLeagueTemplate) => {
    const normalized = normalizeTemplate(template)
    setActive(normalized)
    setFinalsSettings(toFinalsSettings(normalized))
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
            <BrandingPackPicker onApply={handleApplyPack} />
            <Button variant="outline" onClick={handleNewTemplate}>
              <Plus className="mr-1 h-4 w-4" />
              New Template
            </Button>
            <Button onClick={handleSave} disabled={!isStructureValid}>
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
                      updateStructure((prev) => ({ ...prev, model: value as CustomCompetitionModel }))
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
                      updateStructure((prev) => ({
                        ...prev,
                        conferenceCount: Math.max(1, Number(e.target.value) || 1),
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
                      updateStructure((prev) => ({
                        ...prev,
                        divisionsPerConference: Math.max(1, Number(e.target.value) || 1),
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
                {active.structure.model !== 'single-table' && (
                  <div className="space-y-3 md:col-span-3">
                    <div className="flex items-center justify-between">
                      <Label>Team Group Assignment</Label>
                      <Badge variant={isStructureValid ? 'secondary' : 'destructive'}>
                        {isStructureValid ? 'Valid' : 'Invalid'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Drag teams between groups. Each group must contain {structureValidation.minTeamsPerGroup}
                      {structureValidation.minTeamsPerGroup !== structureValidation.maxTeamsPerGroup
                        ? `-${structureValidation.maxTeamsPerGroup}`
                        : ''} teams.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {structureGroups.map((group) => (
                        <div
                          key={group.id}
                          className="rounded border bg-card/40 p-3"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const teamId = e.dataTransfer.getData('text/team-id')
                            if (teamId) moveTeamToGroup(teamId, group.id)
                            setDraggingTeamId(null)
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              {group.conferenceLabel && (
                                <p className="text-xs text-muted-foreground">{group.conferenceLabel}</p>
                              )}
                              <p className="text-sm font-medium">{group.label}</p>
                            </div>
                            <Badge variant="outline">
                              {(groupedTeams[group.id] ?? []).length}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {(groupedTeams[group.id] ?? []).map((team) => (
                              <button
                                key={team.id}
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/team-id', team.id)
                                  setDraggingTeamId(team.id)
                                }}
                                onDragEnd={() => setDraggingTeamId(null)}
                                className="w-full rounded border bg-background px-2 py-1 text-left text-xs"
                              >
                                <span className="font-medium">{team.fullName}</span>
                                <span className="ml-2 text-muted-foreground">{team.abbreviation}</span>
                                {draggingTeamId === team.id && (
                                  <span className="ml-2 text-muted-foreground">(moving)</span>
                                )}
                              </button>
                            ))}
                            {(groupedTeams[group.id] ?? []).length === 0 && (
                              <div className="rounded border border-dashed px-2 py-3 text-center text-xs text-muted-foreground">
                                Drop team here
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {!isStructureValid && (
                      <div className="space-y-1 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                        {structureValidation.errors.map((error) => (
                          <p key={error}>{error}</p>
                        ))}
                      </div>
                    )}
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
