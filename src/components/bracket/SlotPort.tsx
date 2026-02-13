/**
 * SlotPort — interactive circle on match nodes for wiring connections.
 *
 * Input ports (left side): show ladder rank badge or connection indicator.
 * Output ports (right side): colored circles (blue=winner, amber=loser).
 */

import { useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { PortType } from './bracketUtils'
import type { PortPosition } from './useBracketLayout'

interface SlotPortProps {
  nodeId: string
  portType: PortType
  portKey: string
  isConnected: boolean
  ladderRank: number | null
  isWiring: boolean
  isWiringSource: boolean
  isValidTarget: boolean
  onRegister: (key: string, element: HTMLElement | null) => void
  onOutputClick: (
    nodeId: string,
    portType: 'winner-out' | 'loser-out',
    position: PortPosition,
  ) => void
  onInputClick: (nodeId: string, portType: 'home-in' | 'away-in') => void
}

export function SlotPort({
  nodeId,
  portType,
  portKey,
  isConnected,
  ladderRank,
  isWiring,
  isWiringSource,
  isValidTarget,
  onRegister,
  onOutputClick,
  onInputClick,
}: SlotPortProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onRegister(portKey, ref.current)
    return () => onRegister(portKey, null)
  }, [portKey, onRegister])

  const isOutput = portType === 'winner-out' || portType === 'loser-out'
  const isInput = portType === 'home-in' || portType === 'away-in'

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isOutput) {
        const rect = ref.current?.getBoundingClientRect()
        const container = ref.current?.closest('[data-bracket-grid]')
        const containerRect = container?.getBoundingClientRect()
        if (rect && containerRect) {
          onOutputClick(nodeId, portType as 'winner-out' | 'loser-out', {
            x: rect.left + rect.width / 2 - containerRect.left,
            y: rect.top + rect.height / 2 - containerRect.top,
          })
        }
      } else if (isInput && isWiring && isValidTarget) {
        onInputClick(nodeId, portType as 'home-in' | 'away-in')
      }
    },
    [isOutput, isInput, isWiring, isValidTarget, nodeId, portType, onOutputClick, onInputClick],
  )

  // Determine visual style
  const isWinner = portType === 'winner-out'
  const isLoser = portType === 'loser-out'

  return (
    <div
      ref={ref}
      onClick={handleClick}
      className={cn(
        'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-all',
        // Output ports
        isWinner && !isWiringSource && 'border-blue-500 bg-blue-500/20 hover:bg-blue-500/40',
        isLoser && !isWiringSource && 'border-amber-500 bg-amber-500/20 hover:bg-amber-500/40',
        isWiringSource && 'border-white bg-white/30 ring-2 ring-white/50',
        // Input ports
        isInput && !isWiring && isConnected && 'border-green-500 bg-green-500/20',
        isInput && !isWiring && !isConnected && ladderRank !== null && 'border-zinc-500 bg-zinc-500/20',
        isInput && !isWiring && !isConnected && ladderRank === null && 'border-zinc-600 bg-zinc-800/50 border-dashed',
        // Wiring target states
        isInput && isWiring && isValidTarget && 'border-green-400 bg-green-400/30 ring-2 ring-green-400/50 animate-pulse',
        isInput && isWiring && !isValidTarget && 'border-zinc-700 bg-zinc-800/30 opacity-40 cursor-not-allowed',
      )}
      title={
        isWinner
          ? 'Winner output — click to wire'
          : isLoser
            ? 'Loser output — click to wire'
            : ladderRank !== null
              ? `Rank #${ladderRank} on ladder`
              : isConnected
                ? 'Connected'
                : 'Empty — click to connect'
      }
    >
      {/* Show ladder rank in input ports */}
      {isInput && ladderRank !== null && (
        <span className="text-[8px] font-bold text-zinc-300">{ladderRank}</span>
      )}
      {/* Small inner dot for connected inputs */}
      {isInput && isConnected && ladderRank === null && (
        <div className="h-2 w-2 rounded-full bg-green-400" />
      )}
      {/* Small arrow indicator for outputs */}
      {isOutput && (
        <div
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isWinner ? 'bg-blue-400' : 'bg-amber-400',
          )}
        />
      )}
    </div>
  )
}
