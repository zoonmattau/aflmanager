import { Link } from 'react-router-dom'
import type { Player, LineupSlot } from '@/types/player'
import { PlayerMagnet, getPositionSuitability } from './PlayerMagnet'
import { useCallback, useMemo, useState } from 'react'
import { OppositionOverlay } from './OppositionOverlay'
import type { Club } from '@/types/club'
import { getLineupSlots } from '@/engine/core/constants'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { getOverallRating } from '@/engine/player/playerRating'
import { getPositionBadgeStrongClass } from '@/lib/positionColor'
import { FIELD_SLOTS_LANDSCAPE } from './fieldConstants'
import type { SlotPosition } from './fieldConstants'
import { FieldSvg } from './FieldSvg'

export interface FootballFieldProps {
  lineup: Record<string, string>
  players: Record<string, Player>
  clubs: Record<string, Club>
  userClubId?: string
  interchangeCount: number
  substitutesEnabled?: boolean
  userSubstituteId?: string | null
  oppositionSubstituteId?: string | null
  oppositionClubId: string | null
  showOpposition: boolean
  onOppositionPlayerClick?: (playerId: string) => void
  onPlayerClick?: (playerId: string) => void
  selectedSlot?: string | null
  onSelectSlot?: (slot: string) => void
  onAssign: (slot: string, playerId: string) => void
  onSwap: (slotA: string, slotB: string) => void
  onUnassign: (slot: string) => void
}

export function FootballField({
  lineup,
  players,
  clubs,
  userClubId,
  interchangeCount,
  substitutesEnabled = false,
  userSubstituteId = null,
  oppositionSubstituteId = null,
  oppositionClubId,
  showOpposition,
  onOppositionPlayerClick,
  onPlayerClick,
  selectedSlot,
  onSelectSlot,
  onAssign,
  onSwap,
  onUnassign,
}: FootballFieldProps) {
  const FIELD_HALF_MAGNET_WIDTH = 'calc(clamp(52px, 8.2vw, 118px) / 2)'
  const FIELD_HALF_MAGNET_HEIGHT = 'calc(clamp(26px, 3.9vw, 46px) / 2)'

  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const interchangeSlotIds = useMemo(
    () =>
      getLineupSlots(Math.max(0, Math.min(8, interchangeCount))).filter((s) =>
        s.startsWith('I'),
      ) as LineupSlot[],
    [interchangeCount],
  )

  const oppositionBenchPlayers = useMemo(() => {
    if (!showOpposition || !oppositionClubId) return [] as Array<Player | null>
    const oppositionLineup = selectBestLineup(
      Object.values(players),
      oppositionClubId,
      { interchangePlayers: interchangeCount, club: clubs[oppositionClubId] },
    ).lineup
    return interchangeSlotIds.map((slot) => {
      const playerId = oppositionLineup[slot]
      return playerId ? players[playerId] ?? null : null
    })
  }, [showOpposition, oppositionClubId, players, interchangeSlotIds, interchangeCount, clubs])
  const oppositionLineup = useMemo(() => {
    if (!oppositionClubId) return {} as Record<string, string>
    return selectBestLineup(
      Object.values(players),
      oppositionClubId,
      { interchangePlayers: interchangeCount, club: clubs[oppositionClubId] },
    ).lineup
  }, [oppositionClubId, players, interchangeCount, clubs])

  const userSubstitute = useMemo(() => {
    if (!substitutesEnabled || !userSubstituteId) return null
    const player = players[userSubstituteId]
    if (!player) return null
    if (lineup && Object.values(lineup).includes(player.id)) return null
    return player
  }, [substitutesEnabled, userSubstituteId, players, lineup])

  const oppositionSubstitute = useMemo(() => {
    if (!substitutesEnabled || !oppositionClubId) return null
    if (oppositionSubstituteId) {
      const explicit = players[oppositionSubstituteId]
      if (explicit) return explicit
    }
    const selectedIds = new Set(Object.values(oppositionLineup).filter((id): id is string => Boolean(id)))
    const candidates = Object.values(players)
      .filter((p) => p.clubId === oppositionClubId && !p.injury && p.fitness >= 50)
      .filter((p) => !selectedIds.has(p.id))
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
    return candidates[0] ?? null
  }, [substitutesEnabled, oppositionClubId, oppositionSubstituteId, players, oppositionLineup])

  const oppositionBenchLabel = oppositionClubId
    ? (clubs[oppositionClubId]?.abbreviation ?? clubs[oppositionClubId]?.name ?? 'Opp')
    : 'Opp'
  const userBenchLabel = userClubId
    ? (clubs[userClubId]?.abbreviation ?? clubs[userClubId]?.name ?? 'You')
    : 'You'
  const oppositionBenchColor = oppositionClubId
    ? (clubs[oppositionClubId]?.colors.primary ?? '#ef4444')
    : '#ef4444'

  const OPP_OVERRIDES: Record<string, { top?: number; left?: number }> = {
    FB:  { top: 56 },
    CHB: { top: 56, left: 24 },
    CHF: { top: 56, left: 76 },
    FF:  { top: 56 },
    LHB: { top: 20 }, LHF: { top: 20 },
    RHB: { top: 80 }, RHF: { top: 80 },
  }
  const effectiveSlotPositions = useMemo(
    () =>
      FIELD_SLOTS_LANDSCAPE.map((pos) =>
        showOpposition && pos.slot in OPP_OVERRIDES ? { ...pos, ...OPP_OVERRIDES[pos.slot] } : pos,
      ),
    [showOpposition],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (targetSlot: string, e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOverSlot(null)

      const sourceSlot = e.dataTransfer.getData('application/x-slot')
      const playerId = e.dataTransfer.getData('application/x-player-id')
      const inferredSourceSlot = playerId
        ? Object.entries(lineup).find(([, id]) => id === playerId)?.[0]
        : undefined
      const resolvedSourceSlot = sourceSlot || inferredSourceSlot
      const targetHasOccupant = Boolean(lineup[targetSlot])

      if (resolvedSourceSlot && resolvedSourceSlot !== targetSlot) {
        if (targetHasOccupant) {
          onSwap(resolvedSourceSlot, targetSlot)
        } else if (playerId) {
          onAssign(targetSlot, playerId)
          onUnassign(resolvedSourceSlot)
        }
      } else if (playerId && !sourceSlot) {
        onAssign(targetSlot, playerId)
      }
    },
    [lineup, onAssign, onSwap, onUnassign],
  )

  const handleSlotDoubleClick = useCallback(
    (slot: string) => {
      if (lineup[slot]) {
        onUnassign(slot)
      }
    },
    [lineup, onUnassign],
  )

  const renderSlot = (pos: SlotPosition, isInterchange: boolean) => {
    const playerId = lineup[pos.slot]
    const player = playerId ? players[playerId] : null
    const isOver = dragOverSlot === pos.slot

    const style: React.CSSProperties = isInterchange
      ? {
          left: `${pos.left}%`,
          top: `${pos.top}%`,
          transform: 'translate(-50%, -50%)',
        }
      : {
          left: `clamp(${FIELD_HALF_MAGNET_WIDTH}, ${pos.left}%, calc(100% - ${FIELD_HALF_MAGNET_WIDTH}))`,
          top: `clamp(${FIELD_HALF_MAGNET_HEIGHT}, ${pos.top}%, calc(100% - ${FIELD_HALF_MAGNET_HEIGHT}))`,
          transform: 'translate(-50%, -50%)',
        }

    return (
      <div
        key={pos.slot}
        className="absolute z-20"
        style={style}
        onClick={() => onSelectSlot?.(pos.slot)}
        onDragOver={(e) => {
          handleDragOver(e)
          setDragOverSlot(pos.slot)
        }}
        onDragLeave={() => setDragOverSlot(null)}
        onDrop={(e) => handleDrop(pos.slot, e)}
        onDoubleClick={() => handleSlotDoubleClick(pos.slot)}
      >
        {player ? (
          <div className={selectedSlot === pos.slot ? 'ring-2 ring-sky-400 rounded-md' : ''}>
            <PlayerMagnet
              player={player}
              slot={pos.slot}
              suitability={getPositionSuitability(player, pos.slot)}
              onProfileClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
            />
          </div>
        ) : (
          <div
            className={`flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed text-[clamp(8px,0.95vw,10px)] font-semibold transition-colors ${
              isOver
                ? 'border-white bg-white/20 text-white'
                : selectedSlot === pos.slot
                  ? 'border-sky-300 bg-sky-500/20 text-sky-100'
                  : 'border-zinc-400/55 bg-zinc-900/45 text-zinc-300'
            }`}
          >
            {pos.label}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {showOpposition && oppositionClubId ? (
        <div className="flex items-center justify-center gap-3">
          {/* Opposition bench — left side */}
          <div className="flex flex-col items-center gap-1.5">
            {oppositionBenchPlayers.map((player, idx) => {
              if (!player) {
                return (
                  <div
                    key={`opp-bench-empty-${idx}`}
                    className="flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed border-zinc-300/80 bg-zinc-900/70 text-[clamp(8px,0.95vw,10px)] font-semibold text-zinc-100"
                  >
                    I{idx + 1}
                  </div>
                )
              }
              const surname =
                player.lastName.length > 12 ? player.lastName.slice(0, 11) + '.' : player.lastName
              const displayName = `${player.firstName.charAt(0)}. ${surname}`
              return (
                <div
                  key={`opp-bench-${player.id}`}
                  className="flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] cursor-pointer items-center gap-[clamp(3px,0.45vw,7px)] rounded-md border px-[clamp(3px,0.55vw,7px)] shadow-sm transition-opacity hover:opacity-90"
                  style={{
                    borderColor: oppositionBenchColor,
                    backgroundColor: `${oppositionBenchColor}cc`,
                  }}
                  title={`${player.firstName} ${player.lastName} (${player.position.primary})`}
                  onClick={() => onOppositionPlayerClick?.(player.id)}
                >
                  <span className="hidden min-[1150px]:block w-[clamp(18px,1.8vw,28px)] text-center text-[clamp(8px,1vw,12px)] font-bold leading-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
                    #{player.jerseyNumber}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <Link
                      to={`/player/${player.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate text-[clamp(7px,0.82vw,10px)] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] hover:underline"
                    >{displayName}</Link>
                    <span className="block truncate text-[clamp(6px,0.72vw,9px)] text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                      <span className={`rounded border px-1 py-0 [text-shadow:none] ${getPositionBadgeStrongClass(player.position.primary)}`}>{player.position.primary}</span> OVR {getOverallRating(player)}
                    </span>
                  </div>
                </div>
              )
            })}
            {substitutesEnabled && (
              <div className="mt-1">
                {oppositionSubstitute ? (
                  <div
                    className="mx-auto flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] cursor-pointer items-center gap-[clamp(3px,0.45vw,7px)] rounded-md border px-[clamp(3px,0.55vw,7px)] shadow-sm transition-opacity hover:opacity-90"
                    style={{
                      borderColor: oppositionBenchColor,
                      backgroundColor: `${oppositionBenchColor}cc`,
                    }}
                    title={`${oppositionSubstitute.firstName} ${oppositionSubstitute.lastName} (${oppositionSubstitute.position.primary})`}
                    onClick={() => onOppositionPlayerClick?.(oppositionSubstitute.id)}
                  >
                    <span className="hidden min-[1150px]:block w-[clamp(18px,1.8vw,28px)] text-center text-[clamp(8px,1vw,12px)] font-bold leading-none text-white">
                      #{oppositionSubstitute.jerseyNumber}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <Link
                        to={`/player/${oppositionSubstitute.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate text-[clamp(7px,0.82vw,10px)] text-white hover:underline"
                      >{oppositionSubstitute.firstName.charAt(0)}. {oppositionSubstitute.lastName}</Link>
                      <span className="block truncate text-[clamp(6px,0.72vw,9px)] text-zinc-100">
                        {oppositionSubstitute.position.primary}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed border-zinc-300/80 bg-zinc-900/70 text-[clamp(8px,0.95vw,10px)] font-semibold text-zinc-100">
                    SUB
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Field — centre */}
          <div className="flex flex-col flex-1 min-w-0 max-w-[780px] gap-1">
            {/* Direction labels — sit above the field */}
            <div className="flex items-center justify-between px-[25%]">
              <div className="flex items-center gap-1.5 rounded-md border border-white/20 bg-black/35 px-3 py-1.5 text-sm font-semibold text-white/80">
                <span>← {oppositionBenchLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-white/25 bg-black/40 px-3 py-1.5 text-sm font-semibold text-white/90">
                <span>{userBenchLabel} →</span>
              </div>
            </div>

            <div className="relative flex-1" style={{ aspectRatio: '35 / 27' }}>
            <FieldSvg idPrefix="lineup" landscape />

            {effectiveSlotPositions.map((pos) => renderSlot(pos, false))}

            <OppositionOverlay
              oppositionClubId={oppositionClubId}
              players={players}
              clubs={clubs}
              slotPositions={effectiveSlotPositions}
              interchangeCount={interchangeCount}
              onPlayerClick={onOppositionPlayerClick}
            />
            </div>{/* end inner relative field */}
          </div>{/* end field + labels column */}

          {/* User bench — right side */}
          <div className="flex flex-col items-center gap-1.5">
            {interchangeSlotIds.map((slot) => {
              const playerId = lineup[slot]
              const player = playerId ? players[playerId] : null
              const isOver = dragOverSlot === slot

              return (
                <div
                  key={slot}
                  onClick={() => onSelectSlot?.(slot)}
                  onDragOver={(e) => {
                    handleDragOver(e)
                    setDragOverSlot(slot)
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => handleDrop(slot, e)}
                  onDoubleClick={() => handleSlotDoubleClick(slot)}
                >
                  {player ? (
                    <div className={selectedSlot === slot ? 'ring-2 ring-sky-400 rounded-md' : ''}>
                      <PlayerMagnet
                        player={player}
                        slot={slot}
                        suitability={getPositionSuitability(player, slot)}
                        onProfileClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                      />
                    </div>
                  ) : (
                    <div
                      className={`flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed text-[clamp(8px,0.95vw,10px)] font-semibold transition-colors ${
                        isOver
                          ? 'border-white bg-white/20 text-white'
                          : selectedSlot === slot
                            ? 'border-sky-300 bg-sky-500/20 text-sky-100'
                            : 'border-zinc-300/80 bg-zinc-900/70 text-zinc-100'
                      }`}
                    >
                      {slot}
                    </div>
                  )}
                </div>
              )
            })}
            {substitutesEnabled && (
              <div className="mt-1">
                {userSubstitute ? (
                  <PlayerMagnet
                    player={userSubstitute}
                    slot="I1"
                    suitability={getPositionSuitability(userSubstitute, 'I1')}
                  />
                ) : (
                  <div className="mx-auto flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed border-zinc-300/80 bg-zinc-900/70 text-[clamp(8px,0.95vw,10px)] font-semibold text-zinc-100">
                    SUB
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <div className="relative flex-1 min-w-0 max-w-[780px]" style={{ aspectRatio: '35 / 27' }}>
            <FieldSvg idPrefix="lineup" landscape />
            {FIELD_SLOTS_LANDSCAPE.map((pos) => renderSlot(pos, false))}
          </div>

          <div className="flex flex-col items-center gap-1.5">
              {interchangeSlotIds.map((slot) => {
                const playerId = lineup[slot]
                const player = playerId ? players[playerId] : null
                const isOver = dragOverSlot === slot

                return (
                  <div
                    key={slot}
                    onClick={() => onSelectSlot?.(slot)}
                    onDragOver={(e) => {
                      handleDragOver(e)
                      setDragOverSlot(slot)
                    }}
                    onDragLeave={() => setDragOverSlot(null)}
                    onDrop={(e) => handleDrop(slot, e)}
                    onDoubleClick={() => handleSlotDoubleClick(slot)}
                  >
                    {player ? (
                      <div className={selectedSlot === slot ? 'ring-2 ring-sky-400 rounded-md' : ''}>
                        <PlayerMagnet
                          player={player}
                          slot={slot}
                          suitability={getPositionSuitability(player, slot)}
                          onProfileClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
                        />
                      </div>
                    ) : (
                      <div
                        className={`flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed text-[clamp(8px,0.95vw,10px)] font-semibold transition-colors ${
                          isOver
                            ? 'border-white bg-white/20 text-white'
                            : selectedSlot === slot
                              ? 'border-sky-300 bg-sky-500/20 text-sky-100'
                              : 'border-zinc-300/80 bg-zinc-900/70 text-zinc-100'
                        }`}
                      >
                        {slot}
                      </div>
                    )}
                  </div>
                )
              })}
              {substitutesEnabled && (
                <div className="mt-1" title={userSubstitute ? `${userSubstitute.firstName} ${userSubstitute.lastName}` : 'No substitute selected'}>
                  {userSubstitute ? (
                    <PlayerMagnet
                      player={userSubstitute}
                      slot="I1"
                      suitability={getPositionSuitability(userSubstitute, 'I1')}
                    />
                  ) : (
                    <div className="mx-auto flex h-[clamp(26px,3.9vw,46px)] w-[clamp(52px,8.2vw,118px)] items-center justify-center rounded-md border border-dashed border-zinc-300/80 bg-zinc-900/70 text-[clamp(8px,0.95vw,10px)] font-semibold text-zinc-100">
                      SUB
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}
