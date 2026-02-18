import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ADULT_STATE_LEAGUE_IDS, resolveStateLeagueAffiliation } from '@/engine/stateLeague/stateLeagueEngine'
import type { StateLeague, StateLeagueAffiliationSettings, StateLeagueId, AdultStateLeagueId } from '@/types/stateLeague'

const ADULT_STATE_LEAGUE_LABELS: Record<AdultStateLeagueId, string> = {
  vfl: 'VFL',
  sanfl: 'SANFL',
  wafl: 'WAFL',
  tfl: 'TFL',
  ntfl: 'NTFL',
}

type ClubOption = { id: string; name: string; abbreviation?: string }

interface AffiliateManagementEditorProps {
  clubs: ClubOption[]
  stateLeagues: Record<StateLeagueId, StateLeague> | null
  value: StateLeagueAffiliationSettings
  onChange: (next: StateLeagueAffiliationSettings) => void
  title?: string
  description?: string
}

export function AffiliateManagementEditor({
  clubs,
  stateLeagues,
  value,
  onChange,
  title = 'State League Affiliates',
  description = 'Manage AFL club affiliate league assignments and swap pairings with validation.',
}: AffiliateManagementEditorProps) {
  const [swapClubA, setSwapClubA] = useState<string>('')
  const [swapClubB, setSwapClubB] = useState<string>('')
  const [swapError, setSwapError] = useState<string>('')

  const sortedClubs = useMemo(
    () => [...clubs].sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  )

  const effectiveLeagueByClub = useMemo(() => {
    const out: Record<string, AdultStateLeagueId> = {}
    for (const club of sortedClubs) {
      const resolved = resolveStateLeagueAffiliation(stateLeagues, club.id, value)
      if (resolved && ADULT_STATE_LEAGUE_IDS.includes(resolved.leagueId as AdultStateLeagueId)) {
        out[club.id] = resolved.leagueId as AdultStateLeagueId
      } else {
        out[club.id] = value.clubAffiliations[club.id] ?? 'vfl'
      }
    }
    return out
  }, [sortedClubs, stateLeagues, value])

  const affiliateNameByClub = useMemo(() => {
    const out: Record<string, string> = {}
    for (const club of sortedClubs) {
      const resolved = resolveStateLeagueAffiliation(stateLeagues, club.id, value)
      out[club.id] = resolved?.club.name ?? 'No affiliate club found'
    }
    return out
  }, [sortedClubs, stateLeagues, value])

  const leagueCounts = useMemo(() => {
    const counts: Record<AdultStateLeagueId, number> = {
      vfl: 0,
      sanfl: 0,
      wafl: 0,
      tfl: 0,
      ntfl: 0,
    }
    for (const clubId of Object.keys(effectiveLeagueByClub)) {
      counts[effectiveLeagueByClub[clubId]]++
    }
    return counts
  }, [effectiveLeagueByClub])

  const updateClubLeague = (clubId: string, leagueId: AdultStateLeagueId) => {
    setSwapError('')
    onChange({
      allowCustomAffiliations: true,
      clubAffiliations: {
        ...value.clubAffiliations,
        [clubId]: leagueId,
      },
    })
  }

  const handleSwap = () => {
    setSwapError('')
    if (!swapClubA || !swapClubB) {
      setSwapError('Select two AFL clubs to swap.')
      return
    }
    if (swapClubA === swapClubB) {
      setSwapError('Select two different AFL clubs.')
      return
    }

    const leagueA = effectiveLeagueByClub[swapClubA]
    const leagueB = effectiveLeagueByClub[swapClubB]
    if (!leagueA || !leagueB) {
      setSwapError('One or both clubs do not have a valid affiliation.')
      return
    }
    if (leagueA === leagueB) {
      setSwapError('Both clubs are already in the same league.')
      return
    }

    onChange({
      allowCustomAffiliations: true,
      clubAffiliations: {
        ...value.clubAffiliations,
        [swapClubA]: leagueB,
        [swapClubB]: leagueA,
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Enable Custom Affiliations</Label>
            <p className="text-xs text-muted-foreground">When off, automatic affiliation rules are used.</p>
          </div>
          <Switch
            checked={value.allowCustomAffiliations}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                allowCustomAffiliations: checked,
              })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {ADULT_STATE_LEAGUE_IDS.map((leagueId) => (
            <div key={`league-count-${leagueId}`} className="rounded border px-2 py-1 text-xs">
              <span className="font-medium">{ADULT_STATE_LEAGUE_LABELS[leagueId]}</span>
              <span className="ml-1 text-muted-foreground">({leagueCounts[leagueId]})</span>
            </div>
          ))}
        </div>

        {value.allowCustomAffiliations && (
          <div className="rounded border p-3">
            <p className="mb-2 text-sm font-medium">Swap Two Clubs</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <Select value={swapClubA} onValueChange={setSwapClubA}>
                <SelectTrigger><SelectValue placeholder="Club A" /></SelectTrigger>
                <SelectContent>
                  {sortedClubs.map((club) => (
                    <SelectItem key={`swap-a-${club.id}`} value={club.id}>{club.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={swapClubB} onValueChange={setSwapClubB}>
                <SelectTrigger><SelectValue placeholder="Club B" /></SelectTrigger>
                <SelectContent>
                  {sortedClubs.map((club) => (
                    <SelectItem key={`swap-b-${club.id}`} value={club.id}>{club.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={handleSwap}>Swap Leagues</Button>
            </div>
            {swapError && <p className="mt-2 text-xs text-red-500">{swapError}</p>}
          </div>
        )}

        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {sortedClubs.map((club) => {
            const leagueId = effectiveLeagueByClub[club.id]
            return (
              <div key={`aff-row-${club.id}`} className="rounded border p-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{club.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Affiliate: {affiliateNameByClub[club.id]}
                    </p>
                  </div>
                  <div className="w-40">
                    <Select
                      value={leagueId}
                      onValueChange={(next) => updateClubLeague(club.id, next as AdultStateLeagueId)}
                      disabled={!value.allowCustomAffiliations}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADULT_STATE_LEAGUE_IDS.map((id) => (
                          <SelectItem key={`league-opt-${club.id}-${id}`} value={id}>
                            {ADULT_STATE_LEAGUE_LABELS[id]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

