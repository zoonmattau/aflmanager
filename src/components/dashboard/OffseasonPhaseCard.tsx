import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, ExternalLink, Rocket, AlertTriangle } from 'lucide-react'
import {
  getOffseasonPhaseLabel,
  getUnsignedPool,
} from '@/engine/season/offseasonFlow'
import type { OffseasonPhase } from '@/engine/season/offseasonFlow'
import { PHASE_ICONS } from '@/components/offseason/PhaseTimeline'
import { resolveListConstraints, validateClubList, mustDelist } from '@/engine/rules/listRules'
import { calculatePlayerValue } from '@/engine/contracts/negotiation'
import { getOverallRating } from '@/engine/player/playerRating'
import type { Player } from '@/types/player'

function getPhaseDescription(phase: OffseasonPhase): string {
  switch (phase) {
    case 'season-end':
      return 'Review season awards, finalize stats, and prepare for list changes.'
    case 'retirements':
      return 'Players announce their retirement from the game.'
    case 'delistings':
      return 'Trim your roster to meet list size requirements.'
    case 'trade-period':
      return 'Negotiate and finalize trades with other clubs.'
    case 'free-agency':
      return 'Sign unrestricted and restricted free agents.'
    case 'national-draft':
      return 'Select the best available talent in the National Draft.'
    case 'rookie-draft':
      return 'Pick up overlooked prospects in the Rookie Draft.'
    case 'supplemental-signing':
      return 'Sign remaining unsigned players to fill roster gaps.'
    case 'preseason':
      return 'Pre-season training camp builds fitness and develops skills.'
    case 'venue-allocation':
      return 'Manage your home ground schedule for the upcoming season.'
    case 'practice-matches':
      return 'Play practice matches to prepare your squad.'
    case 'ready':
      return 'The offseason is complete. Your squad is assembled and ready to compete.'
  }
}

export function OffseasonPhaseCard() {
  const navigate = useNavigate()

  const offseasonState = useGameStore((s) => s.offseasonState)
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const settings = useGameStore((s) => s.settings)
  const currentYear = useGameStore((s) => s.currentYear)
  const advancePhase = useGameStore((s) => s.advanceOffseasonPhase)
  const startNewSeasonAction = useGameStore((s) => s.startNewSeasonAction)
  const signSupplementalPlayer = useGameStore((s) => s.signSupplementalPlayer)
  const simulationActive = useGameStore((s) => s.simulation.active)

  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [signMessage, setSignMessage] = useState<string | null>(null)

  const currentPhase = offseasonState?.currentPhase ?? 'season-end'
  const isReady = currentPhase === 'ready'

  const canAdvance = useMemo(() => {
    if (!offseasonState) return false
    if (offseasonState.currentPhase === 'delistings') {
      const constraints = resolveListConstraints(settings)
      const validation = validateClubList(players, playerClubId, constraints)
      return validation.valid
    }
    return true
  }, [offseasonState, players, playerClubId, settings])

  const phaseStats = useMemo(() => {
    if (!offseasonState) return null

    switch (currentPhase) {
      case 'delistings': {
        const constraints = resolveListConstraints(settings)
        const excess = mustDelist(players, playerClubId, constraints)
        const rosterCount = Object.values(players).filter(
          (p) => p.clubId === playerClubId,
        ).length
        return {
          items: [
            { label: 'Roster Size', value: `${rosterCount}` },
            { label: 'Must Delist', value: `${excess}`, highlight: excess > 0 },
            { label: 'Delisted', value: `${offseasonState.delistedPlayerIds.length}` },
          ],
        }
      }
      case 'retirements':
        return {
          items: [
            { label: 'Retirements', value: `${offseasonState.retiredPlayerIds.length}` },
          ],
        }
      case 'trade-period':
        return {
          items: [
            { label: 'Phase', value: 'Open' },
          ],
        }
      case 'free-agency': {
        const unsigned = getUnsignedPool(players)
        return {
          items: [
            { label: 'Unsigned Pool', value: `${unsigned.length}` },
          ],
        }
      }
      case 'national-draft':
      case 'rookie-draft': {
        const clubs = useGameStore.getState().clubs
        const club = clubs[playerClubId]
        const picks = club?.draftPicks?.filter(
          (p) => p.currentClubId === playerClubId,
        ) ?? []
        return {
          items: [
            { label: 'Your Picks', value: `${picks.length}` },
            { label: 'Drafted', value: `${offseasonState.newDraftees.length}` },
          ],
        }
      }
      default:
        return null
    }
  }, [currentPhase, offseasonState, players, playerClubId, settings])

  const supplementalTargets = useMemo(() => {
    if (currentPhase !== 'supplemental-signing') return []
    return getUnsignedPool(players)
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 5)
  }, [currentPhase, players])

  const handleAdvance = useCallback(() => {
    const result = advancePhase()
    if (!result.success) {
      setAdvanceError(result.error)
    } else {
      setAdvanceError(null)
    }
  }, [advancePhase])

  const handleStartSeason = useCallback(() => {
    const result = startNewSeasonAction()
    if (!result.success) {
      setAdvanceError(result.error ?? 'Unable to continue to the new season.')
      return
    }
    setAdvanceError(null)
    navigate('/')
  }, [startNewSeasonAction, navigate])

  const handleQuickSupplementalSign = useCallback((player: Player) => {
    const value = calculatePlayerValue(player)
    const years = player.age <= 24 ? 3 : player.age <= 28 ? 2 : 1
    const result = signSupplementalPlayer(player.id, years, value)
    if (result.success) {
      setSignMessage(`Signed ${player.firstName} ${player.lastName}`)
      setAdvanceError(null)
      return
    }
    setAdvanceError(result.error ?? 'Failed to sign player')
    setSignMessage(null)
  }, [signSupplementalPlayer])

  if (!offseasonState) return null

  const phaseIndex = [
    'season-end', 'retirements', 'delistings', 'trade-period',
    'free-agency', 'national-draft', 'rookie-draft', 'supplemental-signing',
    'preseason', 'venue-allocation', 'practice-matches', 'ready',
  ].indexOf(currentPhase)

  return (
    <Card>
      <CardContent className="py-6">
        {/* Phase header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            {PHASE_ICONS[currentPhase]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{getOffseasonPhaseLabel(currentPhase)}</h3>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                Phase {phaseIndex + 1} of 12
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {getPhaseDescription(currentPhase)}
            </p>
          </div>
        </div>

        {/* Phase stats */}
        {phaseStats && (
          <div className="flex gap-4 mb-4">
            {phaseStats.items.map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border px-3 py-2 ${
                  item.highlight
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-border bg-muted/30'
                }`}
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {item.label}
                </p>
                <p className={`text-lg font-bold ${item.highlight ? 'text-red-400' : ''}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Error display */}
        {advanceError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{advanceError}</p>
          </div>
        )}
        {signMessage && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 mb-4 text-sm text-emerald-300">
            {signMessage}
          </div>
        )}

        {currentPhase === 'supplemental-signing' && (
          <div className="mb-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Quick Supplemental Signings</div>
            {supplementalTargets.length === 0 ? (
              <div className="rounded border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                No unsigned players available.
              </div>
            ) : (
              <div className="space-y-1.5">
                {supplementalTargets.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded border border-border/70 bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.position.primary} · Age {p.age} · OVR {getOverallRating(p)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleQuickSupplementalSign(p)}
                    >
                      Sign
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/offseason')}
          >
            View Details
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>

          {isReady ? (
            <Button size="lg" onClick={handleStartSeason} className="gap-2" disabled={simulationActive}>
              <Rocket className="h-4 w-4" />
              Start Season {currentYear + 1}
            </Button>
          ) : (
            <Button onClick={handleAdvance} disabled={!canAdvance || simulationActive} className="gap-2">
              Advance Phase
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
