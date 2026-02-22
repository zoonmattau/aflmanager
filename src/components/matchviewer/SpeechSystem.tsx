/**
 * SpeechSystem
 *
 * Quarter-break team-talk interface for managed games.
 * Shown before the tactical strategy panel.
 *
 * Flow:
 *   1. Choose delivery order (squad-first or lines-first)
 *   2. For each audience: pick tone, optionally pick target player
 *   3. "Deliver Talk" → shows morale effect chips
 *   4. "Continue to Strategy" → hands off to parent
 */

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, ChevronRight, Users, AlertCircle, Star, Brain, Zap, Heart } from 'lucide-react'
import {
  calculateSpeechEffects,
  buildAudiencePlayerMap,
  toneLabel,
  toneDescription,
} from '@/engine/coach/speechEngine'
import type {
  SpeechTone, SpeechAudience, SpeechDelivery, SpeechEffect, SpeechSegment,
} from '@/engine/coach/speechEngine'
import { SeededRNG } from '@/engine/core/rng'
import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpeechSystemProps {
  quarter: number
  homeScore: number
  awayScore: number
  userIsHome: boolean
  userClubId: string
  /** All active players (both teams — we filter by club) */
  players: Record<string, Player>
  /** IDs of players in the user's active lineup */
  userActivePlayerIds: string[]
  /** Seed for deterministic morale rolls */
  seed: number
  /** Prior tone history (updated by parent after delivery) */
  toneHistory: Partial<Record<SpeechTone, number>>
  onDeliver: (effects: SpeechEffect[], delivery: SpeechDelivery) => void
  onContinue: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TONES: SpeechTone[] = ['fire-up', 'calm', 'strategic', 'praise', 'roast']

const TONE_COLORS: Record<SpeechTone, string> = {
  'fire-up':   'bg-red-500/20 text-red-400 border-red-500/40',
  'calm':      'bg-blue-500/20 text-blue-400 border-blue-500/40',
  'roast':     'bg-orange-500/20 text-orange-400 border-orange-500/40',
  'strategic': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  'praise':    'bg-green-500/20 text-green-400 border-green-500/40',
}

const TONE_ICONS: Record<SpeechTone, React.ReactNode> = {
  'fire-up':   <Zap className="h-3 w-3" />,
  'calm':      <Heart className="h-3 w-3" />,
  'roast':     <AlertCircle className="h-3 w-3" />,
  'strategic': <Brain className="h-3 w-3" />,
  'praise':    <Star className="h-3 w-3" />,
}

const AUDIENCES: { id: SpeechAudience; label: string }[] = [
  { id: 'squad',    label: 'Full Squad' },
  { id: 'backs',    label: 'Backs'      },
  { id: 'midfield', label: 'Midfield'   },
  { id: 'forwards', label: 'Forwards'   },
]

function playerShortName(p: Player): string {
  return `${p.firstName[0]}. ${p.lastName}`
}

// ---------------------------------------------------------------------------
// Sub-component: ToneSelector
// ---------------------------------------------------------------------------

function ToneSelector({
  selected, onSelect, toneHistory,
}: {
  selected: SpeechTone | null
  onSelect: (t: SpeechTone) => void
  toneHistory: Partial<Record<SpeechTone, number>>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TONES.map((t) => {
        const uses = toneHistory[t] ?? 0
        const isSelected = selected === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            title={toneDescription(t)}
            className={[
              'flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-all',
              isSelected
                ? TONE_COLORS[t] + ' ring-1 ring-current'
                : 'border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40',
            ].join(' ')}
          >
            {TONE_ICONS[t]}
            {toneLabel(t)}
            {uses > 0 && (
              <span className="text-[9px] opacity-60">×{uses + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpeechSystem({
  quarter, homeScore, awayScore, userIsHome,
  players, userActivePlayerIds, seed, toneHistory,
  onDeliver, onContinue,
}: SpeechSystemProps) {
  const margin = userIsHome ? homeScore - awayScore : awayScore - homeScore

  const [deliveryOrder, setDeliveryOrder] = useState<'squad-first' | 'lines-first'>('squad-first')
  const [segments, setSegments] = useState<Record<SpeechAudience, Partial<SpeechSegment>>>({
    squad:    { audience: 'squad'    },
    backs:    { audience: 'backs'    },
    midfield: { audience: 'midfield' },
    forwards: { audience: 'forwards' },
  })
  const [effects, setEffects] = useState<SpeechEffect[] | null>(null)
  const [delivered, setDelivered] = useState(false)

  const audienceMap = useMemo(
    () => buildAudiencePlayerMap(userActivePlayerIds, players as Record<string, { id: string; position: { primary: string } }>),
    [userActivePlayerIds, players],
  )

  function setTone(audience: SpeechAudience, tone: SpeechTone) {
    setSegments((prev) => ({ ...prev, [audience]: { ...prev[audience], tone, targetPlayerId: undefined } }))
  }

  function setTarget(audience: SpeechAudience, playerId: string | undefined) {
    setSegments((prev) => ({ ...prev, [audience]: { ...prev[audience], targetPlayerId: playerId } }))
  }

  function buildDelivery(): SpeechDelivery {
    const audiences: SpeechAudience[] = deliveryOrder === 'squad-first'
      ? ['squad']
      : ['backs', 'midfield', 'forwards']

    const speeches: SpeechSegment[] = []
    for (const aud of audiences) {
      const seg = segments[aud]
      if (!seg.tone) continue
      speeches.push({
        audience: aud,
        tone: seg.tone,
        targetPlayerId: seg.targetPlayerId,
      })
    }
    return { deliveryOrder, speeches }
  }

  function handleDeliver() {
    const delivery = buildDelivery()
    if (delivery.speeches.length === 0) {
      // No tone chosen — just continue
      onContinue()
      return
    }

    const rng = new SeededRNG(seed + quarter * 777)
    const computed = calculateSpeechEffects(
      delivery.speeches,
      { quarter, margin, toneHistory },
      rng,
      audienceMap,
    )
    setEffects(computed)
    setDelivered(true)
    onDeliver(computed, delivery)
  }

  const activeAudiences: SpeechAudience[] = deliveryOrder === 'squad-first'
    ? ['squad']
    : ['backs', 'midfield', 'forwards']

  // Quarter break label
  const breakLabel =
    quarter === 1 ? 'Quarter Time' :
    quarter === 2 ? 'Half Time' :
    quarter === 3 ? 'Three Quarter Time' : 'Break'

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Coach's Address — {breakLabel}</span>
        <Badge
          variant="outline"
          className={`ml-auto text-[10px] ${
            margin > 0 ? 'text-green-400 border-green-500/40' :
            margin < 0 ? 'text-red-400 border-red-500/40' :
            'text-muted-foreground'
          }`}
        >
          {margin === 0 ? 'Level' : margin > 0 ? `+${margin} Up` : `${margin} Down`}
        </Badge>
      </div>

      <div className="p-3 space-y-3">

        {/* Delivery order */}
        {!delivered && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery Order
            </div>
            <div className="flex gap-2">
              {([
                { id: 'squad-first' as const,  label: 'Address squad', desc: 'One message to everyone' },
                { id: 'lines-first' as const,  label: 'Line meetings',  desc: 'Target each line separately' },
              ]).map(({ id, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDeliveryOrder(id)}
                  className={[
                    'flex-1 rounded border px-2 py-1.5 text-left transition-colors',
                    deliveryOrder === id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/40 text-muted-foreground hover:border-border hover:bg-muted/30',
                  ].join(' ')}
                >
                  <div className="text-[11px] font-medium">{label}</div>
                  <div className="text-[10px] text-muted-foreground">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Audience sections */}
        {!delivered && (
          <div className="space-y-2">
            {activeAudiences.map((aud) => {
              const seg = segments[aud]
              const tone = seg.tone as SpeechTone | undefined
              const needsTarget = tone === 'roast' || tone === 'praise'
              const linePlayerIds = audienceMap[aud]
              const lineLabel = AUDIENCES.find((a) => a.id === aud)?.label ?? aud

              return (
                <div key={aud} className="rounded border border-border/40 p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold">{lineLabel}</span>
                    <span className="text-[10px] text-muted-foreground">({linePlayerIds.length} players)</span>
                  </div>

                  <ToneSelector
                    selected={tone ?? null}
                    onSelect={(t) => setTone(aud, t)}
                    toneHistory={toneHistory}
                  />

                  {needsTarget && linePlayerIds.length > 0 && (
                    <select
                      className="w-full rounded border border-border/40 bg-background text-[11px] px-2 py-1 text-foreground"
                      value={seg.targetPlayerId ?? ''}
                      onChange={(e) => setTarget(aud, e.target.value || undefined)}
                    >
                      <option value="">— Select player —</option>
                      {linePlayerIds.map((id) => {
                        const p = players[id]
                        return p ? <option key={id} value={id}>{playerShortName(p)}</option> : null
                      })}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Effects display (after delivery) */}
        {delivered && effects && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Team Response
            </div>
            {effects.map((eff, i) => (
              <div key={i} className="space-y-1">
                <div className={[
                  'flex items-center gap-2 rounded px-2 py-1.5 text-[11px]',
                  eff.moraleDelta >= 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20',
                ].join(' ')}>
                  <span className="flex-1 font-medium">{eff.description}</span>
                </div>
                {eff.isIndividual && eff.targetPlayerId && eff.targetMoraleDelta !== undefined && (
                  <div className={[
                    'flex items-center gap-2 rounded px-2 py-1.5 text-[11px] ml-3',
                    eff.targetMoraleDelta >= 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20',
                  ].join(' ')}>
                    <span className="text-muted-foreground">
                      {players[eff.targetPlayerId]
                        ? `${playerShortName(players[eff.targetPlayerId])} `
                        : ''}
                      {eff.targetMoraleDelta >= 0
                        ? `boosted (+${eff.targetMoraleDelta} morale)`
                        : `stung (${eff.targetMoraleDelta} morale)`}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {!delivered ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={onContinue}
              >
                Skip Talk
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs gap-1"
                onClick={handleDeliver}
              >
                <MessageSquare className="h-3 w-3" />
                Deliver Talk
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="flex-1 text-xs gap-1"
              onClick={onContinue}
            >
              Continue to Strategy
              <ChevronRight className="h-3 w-3" />
            </Button>
          )}
        </div>

      </div>
    </div>
  )
}
